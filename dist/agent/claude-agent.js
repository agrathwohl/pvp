import * as fs from "fs/promises";
import path from "path";
import { AnthropicProvider, } from "./providers/index.js";
import { WebSocketClient } from "../transports/websocket.js";
import { createMessage } from "../protocol/messages.js";
import { createParticipantInfo } from "../protocol/defaults.js";
import { ulid } from "../utils/ulid.js";
import { logger } from "../utils/logger.js";
import { createShellToolHandler } from "./tools/shell-tool.js";
import { categorizeCommand } from "./tools/shell-executor.js";
import { createFileToolHandler } from "./tools/file-tool.js";
import { createGitCommitToolHandler } from "./tools/git-commit-tool.js";
import { createNotebookToolHandler } from "./tools/notebook-tool.js";
import { createNpmToolHandler } from "./tools/npm-tool.js";
import { createTasksToolHandler, TASKS_CONTEXT_KEY } from "./tools/tasks-tool.js";
import { BUILTIN_TOOL_DEFINITIONS } from "./tools/tool-definitions.js";
import { MCPManager } from "./mcp/index.js";
export class ClaudeAgent {
    client;
    provider;
    participantId;
    sessionId = null;
    workingDirectory = null;
    localWorkDir = null;
    workspaceInitialized = false;
    agentName;
    model;
    conversationHistory = [];
    shellToolHandler;
    fileToolHandler;
    gitCommitToolHandler;
    toolProposals = new Map();
    fileWriteProposals = new Map();
    fileEditProposals = new Map();
    gitCommitProposals = new Map();
    notebookToolHandler;
    notebookProposals = new Map();
    npmToolHandler;
    npmProposals = new Map();
    tasksToolHandler;
    tasksProposals = new Map();
    strictMode = false;
    toolUseIdToProposalId = new Map();
    // Track session participants for @mention filtering
    sessionParticipants = new Map();
    currentPromptRef = null;
    // MCP support
    mcpManager;
    mcpToolProposals = new Map();
    // Tool batching - Anthropic API requires ALL tool_use blocks to have
    // corresponding tool_result blocks in the next message
    pendingToolBatch = null;
    constructor(config) {
        this.participantId = ulid();
        this.agentName = config.agentName || "Claude Assistant";
        this.model = config.model || "claude-sonnet-4-5-20250929";
        this.localWorkDir = config.localWorkDir || null;
        // If local working directory is set, use it immediately (don't wait for server context.add)
        if (this.localWorkDir) {
            this.workingDirectory = this.localWorkDir;
        }
        // Initialize LLM provider (defaults to AnthropicProvider)
        this.provider = config.provider ?? new AnthropicProvider({
            apiKey: config.apiKey || process.env.ANTHROPIC_API_KEY || "",
        });
        // Initialize WebSocket client
        this.client = new WebSocketClient(config.serverUrl, this.participantId);
        // Initialize shell tool handler
        this.shellToolHandler = createShellToolHandler();
        // Initialize file tool handler
        this.fileToolHandler = createFileToolHandler();
        // Initialize git commit tool handler
        this.gitCommitToolHandler = createGitCommitToolHandler();
        // Initialize notebook tool handler
        this.notebookToolHandler = createNotebookToolHandler();
        // Initialize npm tool handler
        this.npmToolHandler = createNpmToolHandler();
        // Initialize tasks tool handler
        this.tasksToolHandler = createTasksToolHandler();
        // Initialize strict mode
        this.strictMode = config.strictMode || false;
        // Initialize MCP manager
        this.mcpManager = new MCPManager();
        this.setupEventHandlers();
        if (config.sessionId) {
            this.sessionId = config.sessionId;
        }
    }
    /**
     * BLOCKING INITIALIZATION - Must complete before ANY message processing.
     * Creates working directory and initializes git repo if needed.
     */
    async initializeWorkspace() {
        // Determine working directory: localWorkDir takes priority, else generate from sessionId
        const workDir = this.localWorkDir || (this.sessionId ? `/tmp/pvp-agent/${this.sessionId}` : `/tmp/pvp-agent/${this.participantId}`);
        this.workingDirectory = workDir;
        logger.info({ workDir }, "Initializing agent workspace...");
        // Step 1: mkdir -p the working directory
        try {
            await fs.mkdir(workDir, { recursive: true });
            logger.info({ workDir }, "Working directory created/verified");
        }
        catch (error) {
            logger.error({ error, workDir }, "CRITICAL: Failed to create working directory");
            throw new Error(`Failed to create working directory: ${workDir}`);
        }
        // Step 2: Check if .git exists, if not initialize git repo
        const gitDir = path.join(workDir, ".git");
        try {
            await fs.access(gitDir);
            logger.info({ workDir }, "Git repository already exists");
        }
        catch {
            // .git doesn't exist - initialize it
            logger.info({ workDir }, "No git repo found, initializing...");
            try {
                const proc = Bun.spawn(["git", "init"], {
                    cwd: workDir,
                    stdout: "pipe",
                    stderr: "pipe",
                });
                const exitCode = await proc.exited;
                if (exitCode !== 0) {
                    const stderr = await new Response(proc.stderr).text();
                    throw new Error(`git init failed: ${stderr}`);
                }
                logger.info({ workDir }, "Git repository initialized");
            }
            catch (gitError) {
                logger.error({ gitError, workDir }, "CRITICAL: Failed to initialize git repository");
                throw new Error(`Failed to initialize git in: ${workDir}`);
            }
        }
        this.workspaceInitialized = true;
        logger.info({ workDir }, "✅ Workspace initialization complete - agent ready");
    }
    /**
     * Initialize MCP servers from configuration
     */
    async initializeMCP(configs) {
        for (const config of configs) {
            try {
                await this.mcpManager.addServer(config);
                logger.info({ server: config.name }, "MCP server initialized");
            }
            catch (error) {
                logger.error({ error, server: config.name }, "Failed to initialize MCP server");
            }
        }
    }
    setupEventHandlers() {
        this.client.on("connected", async () => {
            logger.info(`[${this.agentName}] Connected to server`);
            if (this.sessionId) {
                // Join existing session
                await this.joinSession(this.sessionId);
            }
        });
        this.client.on("disconnected", () => {
            logger.info(`[${this.agentName}] Disconnected from server`);
        });
        this.client.on("message", async (message) => {
            await this.handleMessage(message);
        });
    }
    async connect() {
        // BLOCKING: Initialize workspace BEFORE any network communication
        // This ensures mkdir -p and git init complete before any prompt/tool can execute
        await this.initializeWorkspace();
        this.client.connect();
    }
    async joinSession(sessionId) {
        this.sessionId = sessionId;
        // Ensure session working directory exists before any operations
        // This is critical for git operations and file management
        const sessionWorkDir = `/tmp/pvp-git/${sessionId}`;
        try {
            await fs.mkdir(sessionWorkDir, { recursive: true });
            logger.info({ sessionWorkDir }, "Created session working directory");
        }
        catch (error) {
            logger.warn({ error, sessionWorkDir }, "Failed to create session working directory");
        }
        const joinMsg = createMessage("session.join", sessionId, this.participantId, {
            participant: createParticipantInfo(this.participantId, this.agentName, "agent", ["navigator"], // Agents are navigators - they help guide/assist
            ["prompt", "add_context"] // Agents need add_context to emit context.update/context.add
            ),
            supported_versions: [1],
        });
        this.client.send(joinMsg);
        logger.info(`[${this.agentName}] Joined session: ${sessionId}`);
        // If using local working directory, announce it to the session
        if (this.localWorkDir) {
            const contextMsg = createMessage("context.add", sessionId, this.participantId, {
                key: `agent:${this.participantId}:working_directory`,
                content_type: "text",
                content: this.localWorkDir,
                source: this.agentName,
                tags: ["agent", "working_directory"],
            });
            this.client.send(contextMsg);
            logger.info({ workingDirectory: this.localWorkDir }, "Announced local working directory to session");
        }
    }
    async handleMessage(message) {
        try {
            // GUARD: Block prompt/tool operations if workspace not initialized
            // This is defense-in-depth - initializeWorkspace() should complete before connect()
            const requiresWorkspace = ["prompt.submit", "tool.execute"].includes(message.type);
            if (requiresWorkspace && !this.workspaceInitialized) {
                logger.error({ type: message.type }, "BLOCKED: Workspace not initialized - cannot process operation");
                throw new Error(`Cannot process ${message.type} - workspace not initialized`);
            }
            switch (message.type) {
                case "prompt.submit":
                    // Only respond to prompts targeted at this agent
                    if (message.payload.target_agent === this.participantId) {
                        await this.handlePrompt(message);
                    }
                    break;
                case "tool.execute":
                    // Handle tool execution requests
                    await this.handleToolExecution(message);
                    break;
                case "interrupt.raise":
                    // Handle human interruptions
                    await this.handleInterrupt(message);
                    break;
                case "gate.reject":
                    // Handle gate rejection - need to send error result back to Claude
                    await this.handleGateRejection(message);
                    break;
                case "gate.timeout":
                    // Handle gate timeout - may need to send error result back to Claude
                    if (message.payload.resolution === "rejected") {
                        await this.handleGateRejection(message);
                    }
                    break;
                case "context.add":
                    // Check for session working directory
                    if (message.payload.key === "session:working_directory" && typeof message.payload.content === "string") {
                        if (this.localWorkDir) {
                            // Use local working directory instead of server-provided path (for remote connections)
                            this.workingDirectory = this.localWorkDir;
                            logger.info({ workingDirectory: this.workingDirectory }, "Using local working directory (--local flag)");
                        }
                        else {
                            const newWorkDir = message.payload.content;
                            this.workingDirectory = newWorkDir;
                            logger.info({ workingDirectory: this.workingDirectory }, "Session working directory set");
                            // CRITICAL: Ensure git repo exists in server-provided directory
                            const gitDir = path.join(newWorkDir, ".git");
                            try {
                                await fs.access(gitDir);
                                logger.info({ workingDirectory: newWorkDir }, "Git repository already exists in server directory");
                            }
                            catch {
                                // No .git - initialize it
                                logger.info({ workingDirectory: newWorkDir }, "No git repo in server directory, initializing...");
                                try {
                                    const proc = Bun.spawn(["git", "init"], {
                                        cwd: newWorkDir,
                                        stdout: "pipe",
                                        stderr: "pipe",
                                    });
                                    const exitCode = await proc.exited;
                                    if (exitCode !== 0) {
                                        const stderr = await new Response(proc.stderr).text();
                                        logger.error({ stderr, workingDirectory: newWorkDir }, "git init failed in server directory");
                                    }
                                    else {
                                        logger.info({ workingDirectory: newWorkDir }, "Git repository initialized in server directory");
                                    }
                                }
                                catch (gitError) {
                                    logger.error({ gitError, workingDirectory: newWorkDir }, "Failed to initialize git in server directory");
                                }
                            }
                        }
                    }
                    // Check for tasks context restoration
                    if (message.payload.key === TASKS_CONTEXT_KEY) {
                        try {
                            const content = message.payload.content;
                            if (content && typeof content === "object") {
                                const tasksState = content;
                                this.tasksToolHandler.restoreState(tasksState);
                                logger.info({
                                    taskCount: tasksState.tasks?.length || 0,
                                    hasGoal: !!tasksState.goal
                                }, "Restored tasks from session context");
                            }
                        }
                        catch (err) {
                            logger.error({ err }, "Failed to restore tasks from session context");
                        }
                    }
                    break;
                case "participant.announce": {
                    // Track participant for @mention filtering
                    const payload = message.payload;
                    const isNewParticipant = !this.sessionParticipants.has(payload.id);
                    const isNotSelf = payload.id !== this.participantId;
                    this.sessionParticipants.set(payload.id, {
                        name: payload.name,
                        type: payload.type,
                    });
                    logger.debug({ participantId: payload.id, name: payload.name, type: payload.type }, "Tracking session participant");
                    // Notify LLM about new participant joining
                    if (isNewParticipant && isNotSelf && this.sessionId) {
                        await this.handleParticipantJoined(payload);
                    }
                    break;
                }
                case "session.join": {
                    // Also track from session.join which embeds participant info
                    const joinPayload = message.payload;
                    if (joinPayload.participant) {
                        const isNewParticipant = !this.sessionParticipants.has(joinPayload.participant.id);
                        const isNotSelf = joinPayload.participant.id !== this.participantId;
                        this.sessionParticipants.set(joinPayload.participant.id, {
                            name: joinPayload.participant.name,
                            type: joinPayload.participant.type,
                        });
                        logger.debug({ participantId: joinPayload.participant.id, name: joinPayload.participant.name }, "Tracking participant from session.join");
                        // Notify LLM about new participant joining
                        if (isNewParticipant && isNotSelf && this.sessionId) {
                            await this.handleParticipantJoined(joinPayload.participant);
                        }
                    }
                    break;
                }
                default:
                    // Log other message types for debugging
                    logger.debug({ type: message.type }, "Received message");
                    break;
            }
        }
        catch (error) {
            logger.error({ error, messageType: message.type }, "Error handling message");
        }
    }
    async handlePrompt(message) {
        if (message.type !== "prompt.submit")
            return;
        if (!this.sessionId)
            return;
        const { content } = message.payload;
        // @mention filtering: check if message is addressed to another participant
        const mentionCheck = this.checkMentionRouting(content);
        if (mentionCheck.shouldIgnore) {
            logger.info({ targetParticipant: mentionCheck.targetName, content: content.slice(0, 50) }, "Ignoring prompt addressed to another participant");
            return;
        }
        // If there's mention context (message mentions others but not directly addressed),
        // prepend it so the LLM can use context clues to decide if it should respond
        const effectiveContent = mentionCheck.mentionContext
            ? `${mentionCheck.mentionContext}\n\n${content}`
            : content;
        // CRITICAL: Block new prompts while tools are pending
        // The Anthropic API requires all tool_use blocks to have tool_result blocks
        // in the next message. If we process a new prompt while tools are pending,
        // the conversation history will be corrupted.
        if (this.pendingToolBatch && this.pendingToolBatch.tools.size > 0) {
            const pendingCount = Array.from(this.pendingToolBatch.tools.values())
                .filter(t => t.status === 'pending').length;
            if (pendingCount > 0) {
                logger.warn({
                    pendingTools: pendingCount,
                    prompt: content.slice(0, 50),
                }, "Rejecting prompt - tools pending approval");
                // Send error back to user
                const errorMsg = createMessage("error", this.sessionId, this.participantId, {
                    code: "INVALID_STATE",
                    message: `Cannot process new prompt - ${pendingCount} tool(s) awaiting approval. Please approve or reject pending gates first.`,
                    recoverable: true,
                    related_to: message.id,
                });
                this.client.send(errorMsg);
                return;
            }
        }
        logger.info(`[${this.agentName}] Processing prompt: ${effectiveContent.slice(0, 100)}...`);
        // Store prompt ref for tool result responses
        this.currentPromptRef = message.id;
        // Send thinking start
        const thinkingStartMsg = createMessage("thinking.start", this.sessionId, this.participantId, {
            agent: this.participantId,
            prompt_ref: message.id,
            visible_to: "all",
        });
        this.client.send(thinkingStartMsg);
        // Send response start
        const responseStartMsg = createMessage("response.start", this.sessionId, this.participantId, {
            agent: this.participantId,
            prompt_ref: message.id,
        });
        this.client.send(responseStartMsg);
        try {
            // Inject strict mode context if enabled
            const strictModeContext = this.getStrictModeContext();
            if (strictModeContext && this.conversationHistory.length === 0) {
                // Add strict mode context as first system-like user message
                this.conversationHistory.push({
                    role: "user",
                    content: strictModeContext
                });
                this.conversationHistory.push({
                    role: "assistant",
                    content: "Understood. I am operating in STRICT MODE and will ensure all actions align with the defined session goals and tasks."
                });
            }
            // Add user message to history
            this.conversationHistory.push({
                role: "user",
                content: effectiveContent
            });
            // Call LLM provider with tools
            const response = await this.provider.createCompletion({
                model: this.model,
                maxTokens: 4096,
                messages: this.conversationHistory,
                tools: this.getAllTools()
            });
            // Handle response content
            let fullResponse = response.text;
            const toolUses = [];
            for (const block of response.rawContent) {
                if (block.type === "text") {
                    const chunkMsg = createMessage("response.chunk", this.sessionId, this.participantId, {
                        text: block.text
                    });
                    this.client.send(chunkMsg);
                }
                else if (block.type === "tool_use") {
                    toolUses.push(block);
                }
            }
            // Add assistant response to history
            this.conversationHistory.push({
                role: "assistant",
                content: response.rawContent
            });
            // Create batch for tool_use blocks - Anthropic requires ALL tool_results together
            if (toolUses.length > 0) {
                this.createToolBatch(message.id, toolUses);
                await this.proposeToolBatch(toolUses);
            }
            // Send thinking end
            const thinkingEndMsg = createMessage("thinking.end", this.sessionId, this.participantId, {
                summary: `Generated ${fullResponse.length} character response with ${toolUses.length} tool requests`,
            });
            this.client.send(thinkingEndMsg);
            // Send response end
            const responseEndMsg = createMessage("response.end", this.sessionId, this.participantId, {
                finish_reason: response.finishReason === "tool_use" ? "tool_use" : "complete",
            });
            this.client.send(responseEndMsg);
            logger.info(`[${this.agentName}] Response sent (${fullResponse.length} chars, ${toolUses.length} tools)`);
        }
        catch (error) {
            logger.error({ error }, "Error in tool-enabled response");
            // Check if this is a tool_result missing error - if so, try to recover
            const errorMessage = error instanceof Error ? error.message : String(error);
            if (errorMessage.includes("tool_use") && errorMessage.includes("tool_result")) {
                logger.warn("Detected corrupted conversation history - attempting recovery");
                this.recoverFromCorruptedHistory();
            }
            // Send error message
            const errorMsg = createMessage("error", this.sessionId, this.participantId, {
                code: "AGENT_ERROR",
                message: error instanceof Error ? error.message : "Unknown error",
                recoverable: true,
                related_to: message.id,
            });
            this.client.send(errorMsg);
        }
    }
    async handleToolExecution(message) {
        if (message.type !== "tool.execute")
            return;
        if (!this.sessionId)
            return;
        const { tool_proposal, approved_by } = message.payload;
        // Check if this is an MCP tool proposal
        if (this.mcpToolProposals.has(tool_proposal)) {
            logger.info({ toolProposal: tool_proposal, approvers: approved_by }, "Executing approved MCP tool");
            await this.executeMCPTool(tool_proposal);
            return;
        }
        // Check if this is a file write proposal
        if (this.fileWriteProposals.has(tool_proposal)) {
            logger.info({ toolProposal: tool_proposal, approvers: approved_by }, "Executing approved file write");
            await this.executeFileWrite(tool_proposal);
            return;
        }
        // Check if this is a file edit proposal
        if (this.fileEditProposals.has(tool_proposal)) {
            logger.info({ toolProposal: tool_proposal, approvers: approved_by }, "Executing approved file edit");
            await this.executeFileEdit(tool_proposal);
            return;
        }
        // Check if this is a git commit proposal
        if (this.gitCommitProposals.has(tool_proposal)) {
            logger.info({ toolProposal: tool_proposal, approvers: approved_by }, "Executing approved git commit");
            await this.executeGitCommit(tool_proposal);
            return;
        }
        // Check if this is a notebook execution proposal
        if (this.notebookProposals.has(tool_proposal)) {
            logger.info({ toolProposal: tool_proposal, approvers: approved_by }, "Executing approved notebook");
            await this.executeNotebook(tool_proposal);
            return;
        }
        // Check if this is an npm operation proposal
        if (this.npmProposals.has(tool_proposal)) {
            logger.info({ toolProposal: tool_proposal, approvers: approved_by }, "Executing approved npm operation");
            await this.executeNpm(tool_proposal);
            return;
        }
        // Check if this is a tasks operation proposal
        if (this.tasksProposals.has(tool_proposal)) {
            logger.info({ toolProposal: tool_proposal, approvers: approved_by }, "Executing tasks operation");
            await this.executeTasks(tool_proposal);
            return;
        }
        // Retrieve the shell tool proposal
        const proposal = this.toolProposals.get(tool_proposal);
        if (!proposal) {
            logger.error({ toolProposal: tool_proposal }, "Tool proposal not found in any map - sending error to batch");
            // Must update batch with error result so it doesn't hang forever waiting
            this.updateBatchResult(tool_proposal, {
                success: false,
                output: "",
                error: `Tool proposal ${tool_proposal} not found - may have been created before code was deployed`,
            });
            return;
        }
        logger.info({
            toolProposal: tool_proposal,
            approvers: approved_by,
            command: `${proposal.command.command} ${proposal.command.args.join(" ")}`
        }, "Executing approved shell command");
        // Store tool execution result
        let toolResult = null;
        try {
            // Execute the shell command with streaming output
            await this.shellToolHandler.executeCommand(tool_proposal, proposal.command, this.sessionId, this.participantId, (msg) => {
                this.client.send(msg);
                // Capture tool.result message
                if (msg.type === "tool.result") {
                    const result = msg.payload.result;
                    const stdout = result?.stdout || "";
                    const stderr = result?.stderr || "";
                    const exitCode = result?.exitCode ?? null;
                    toolResult = {
                        success: msg.payload.success,
                        output: `Exit code: ${exitCode}\n${stdout}${stderr ? `\nStderr: ${stderr}` : ""}`.trim(),
                        error: msg.payload.error
                    };
                }
            }, this.workingDirectory ?? undefined);
        }
        catch (error) {
            // Send error result back to Claude
            toolResult = {
                success: false,
                output: "",
                error: error instanceof Error ? error.message : "Unknown execution error"
            };
            logger.error({ error, toolProposal: tool_proposal }, "Tool execution failed");
        }
        // Clean up
        this.toolProposals.delete(tool_proposal);
        // Update batch with result (don't send to Claude yet - wait for all tools)
        if (toolResult) {
            this.updateBatchResult(tool_proposal, toolResult);
        }
    }
    async handleInterrupt(message) {
        if (message.type !== "interrupt.raise")
            return;
        if (!this.sessionId)
            return;
        logger.info(`[${this.agentName}] Interrupt received: ${message.payload.message}`);
        // Acknowledge interrupt
        const ackMsg = createMessage("interrupt.acknowledge", this.sessionId, this.participantId, {
            interrupt: message.id,
            by: this.participantId,
            action_taken: "acknowledged",
        });
        this.client.send(ackMsg);
        // Clear conversation context on emergency interrupts
        if (message.payload.urgency === "emergency") {
            this.conversationHistory = [];
            logger.info(`[${this.agentName}] Conversation history cleared`);
        }
    }
    /**
     * Handle gate rejection - send error result back to Claude
     */
    async handleGateRejection(message) {
        if (message.type !== "gate.reject" && message.type !== "gate.timeout")
            return;
        if (!this.sessionId)
            return;
        // Get the gate/proposal ID
        const proposalId = message.payload.gate;
        // Determine the reason for rejection
        const reason = message.type === "gate.reject"
            ? message.payload.reason
            : `Gate timed out (${message.payload.approvals_received}/${message.payload.approvals_required} approvals)`;
        logger.info({ proposalId, reason }, "Gate rejected - agent will stop after batch completes");
        // CRITICAL: Mark batch as having a rejection - agent must stop after sending results
        if (this.pendingToolBatch) {
            this.pendingToolBatch.hadRejection = true;
        }
        // Check if this is a shell tool proposal
        const shellProposal = this.toolProposals.get(proposalId);
        if (shellProposal) {
            this.toolProposals.delete(proposalId);
            this.updateBatchResult(proposalId, {
                success: false,
                output: "",
                error: `Command rejected by human: ${reason}`,
            });
            return;
        }
        // Check if this is a file write proposal
        const fileWriteProposal = this.fileWriteProposals.get(proposalId);
        if (fileWriteProposal) {
            this.fileWriteProposals.delete(proposalId);
            this.updateBatchResult(proposalId, {
                success: false,
                output: "",
                error: `File write to "${fileWriteProposal.path}" rejected by human: ${reason}`,
            });
            return;
        }
        // Check if this is a file edit proposal
        const fileEditProposal = this.fileEditProposals.get(proposalId);
        if (fileEditProposal) {
            this.fileEditProposals.delete(proposalId);
            this.updateBatchResult(proposalId, {
                success: false,
                output: "",
                error: `File edit to "${fileEditProposal.path}" rejected by human: ${reason}`,
            });
            return;
        }
        // Check if this is a notebook proposal
        const notebookProposal = this.notebookProposals.get(proposalId);
        if (notebookProposal) {
            this.notebookProposals.delete(proposalId);
            this.updateBatchResult(proposalId, {
                success: false,
                output: "",
                error: `Notebook execution "${notebookProposal.notebookPath}" rejected by human: ${reason}`,
            });
            return;
        }
        // Check if this is an npm proposal
        const npmProposal = this.npmProposals.get(proposalId);
        if (npmProposal) {
            this.npmProposals.delete(proposalId);
            this.updateBatchResult(proposalId, {
                success: false,
                output: "",
                error: `NPM operation "${npmProposal.operation}" rejected by human: ${reason}`,
            });
            return;
        }
        // Check if this is an MCP tool proposal
        const mcpProposal = this.mcpToolProposals.get(proposalId);
        if (mcpProposal) {
            this.mcpToolProposals.delete(proposalId);
            this.updateBatchResult(proposalId, {
                success: false,
                output: "",
                error: `Tool "${mcpProposal.tool.mcp_tool.name}" rejected by human: ${reason}`,
            });
            return;
        }
        // No matching proposal found - still need to update batch so it doesn't hang
        logger.error({ proposalId, reason }, "Gate rejection received but no matching proposal found - updating batch with error");
        this.updateBatchResult(proposalId, {
            success: false,
            output: "",
            error: `Gate rejected but proposal ${proposalId} not found: ${reason}`,
        });
    }
    /**
     * Send tool execution result back to Claude to continue the conversation
     */
    async sendToolResultToClaude(proposalId, result) {
        if (!this.sessionId)
            return;
        // Get the original Claude tool use ID
        const toolUseId = this.toolUseIdToProposalId.get(proposalId);
        if (!toolUseId) {
            logger.warn({ proposalId }, "No tool use ID found for proposal");
            return;
        }
        // Clean up tracking
        this.toolUseIdToProposalId.delete(proposalId);
        try {
            // Send thinking start for processing tool result
            const thinkingStartMsg = createMessage("thinking.start", this.sessionId, this.participantId, {
                agent: this.participantId,
                prompt_ref: this.currentPromptRef || proposalId,
                visible_to: "all",
            });
            this.client.send(thinkingStartMsg);
            // Send response start
            const responseStartMsg = createMessage("response.start", this.sessionId, this.participantId, {
                agent: this.participantId,
                prompt_ref: this.currentPromptRef || proposalId,
            });
            this.client.send(responseStartMsg);
            // Add tool result to conversation history
            this.conversationHistory.push({
                role: "user",
                content: [
                    {
                        type: "tool_result",
                        toolUseId: toolUseId,
                        content: result.error ? `Error: ${result.error}` : result.output,
                        isError: !result.success
                    }
                ]
            });
            // Call Claude again with the tool result
            const response = await this.provider.createCompletion({
                model: this.model,
                maxTokens: 4096,
                messages: this.conversationHistory,
                tools: this.getAllTools()
            });
            // Handle Claude's response to the tool result
            let fullResponse = response.text;
            const toolUses = [];
            for (const block of response.rawContent) {
                if (block.type === "text") {
                    const chunkMsg = createMessage("response.chunk", this.sessionId, this.participantId, {
                        text: block.text
                    });
                    this.client.send(chunkMsg);
                }
                else if (block.type === "tool_use") {
                    toolUses.push(block);
                }
            }
            // Add Claude's response to history
            this.conversationHistory.push({
                role: "assistant",
                content: response.rawContent
            });
            // Create batch for follow-up tool requests
            if (toolUses.length > 0) {
                this.createToolBatch(this.currentPromptRef || proposalId, toolUses);
                await this.proposeToolBatch(toolUses);
            }
            // Send thinking end
            const thinkingEndMsg = createMessage("thinking.end", this.sessionId, this.participantId, {
                summary: `Processed tool result and generated ${fullResponse.length} character response with ${toolUses.length} additional tool requests`,
            });
            this.client.send(thinkingEndMsg);
            // Send response end
            const responseEndMsg = createMessage("response.end", this.sessionId, this.participantId, {
                finish_reason: response.finishReason === "tool_use" ? "tool_use" : "complete",
            });
            this.client.send(responseEndMsg);
            logger.info(`[${this.agentName}] Sent tool result to Claude and received response (${fullResponse.length} chars, ${toolUses.length} additional tools)`);
        }
        catch (error) {
            logger.error({ error, proposalId, toolUseId }, "Error sending tool result to Claude");
            // Check if this is a tool_result missing error - if so, try to recover
            const errorMessage = error instanceof Error ? error.message : String(error);
            if (errorMessage.includes("tool_use") && errorMessage.includes("tool_result")) {
                logger.warn("Detected corrupted conversation history in fallback path - attempting recovery");
                this.recoverFromCorruptedHistory();
            }
            const errorMsg = createMessage("error", this.sessionId, this.participantId, {
                code: "AGENT_ERROR",
                message: error instanceof Error ? error.message : "Unknown error",
                recoverable: true,
            });
            this.client.send(errorMsg);
        }
    }
    /**
     * Get all available tools (builtin + MCP) for LLM provider
     */
    getAllTools() {
        // Start with builtin tool definitions
        const tools = [...BUILTIN_TOOL_DEFINITIONS];
        // Add MCP tools with namespaced names
        for (const mcpTool of this.mcpManager.getAllTools()) {
            tools.push({
                name: mcpTool.namespaced_name,
                description: mcpTool.mcp_tool.description || `Tool from ${mcpTool.server_name}`,
                input_schema: mcpTool.mcp_tool.inputSchema
            });
        }
        return tools;
    }
    async proposeShellCommand(command, toolUseId) {
        if (!this.sessionId) {
            throw new Error("Not connected to a session");
        }
        try {
            const shellCmd = categorizeCommand(command);
            // Set working directory if available from session
            if (this.workingDirectory) {
                shellCmd.cwd = this.workingDirectory;
            }
            const proposalMsg = this.shellToolHandler.proposeCommand(command, this.sessionId, this.participantId);
            // Store the proposal for later execution
            this.toolProposals.set(proposalMsg.id, {
                command: shellCmd,
                proposalMsg,
            });
            // Track Claude's tool use ID if provided
            if (toolUseId) {
                this.toolUseIdToProposalId.set(proposalMsg.id, toolUseId);
                // Update batch with proposal ID
                if (this.pendingToolBatch) {
                    const batchEntry = this.pendingToolBatch.tools.get(toolUseId);
                    if (batchEntry) {
                        batchEntry.proposalId = proposalMsg.id;
                    }
                }
            }
            // Send the proposal
            this.client.send(proposalMsg);
            logger.info({
                proposalId: proposalMsg.id,
                toolUseId,
                command,
                category: shellCmd.category,
                riskLevel: shellCmd.riskLevel,
                requiresApproval: shellCmd.requiresApproval,
            }, "Proposed shell command");
            return proposalMsg.id;
        }
        catch (error) {
            logger.error({ error, command }, "Failed to propose shell command");
            throw error;
        }
    }
    /**
     * Resolve a file path relative to the working directory if not absolute
     */
    resolveFilePath(filePath) {
        if (path.isAbsolute(filePath)) {
            return filePath;
        }
        if (this.workingDirectory) {
            return path.resolve(this.workingDirectory, filePath);
        }
        return filePath;
    }
    /**
     * Propose a file write operation through the PVP gate system
     */
    async proposeFileWrite(filePath, content, createDirs, toolUseId) {
        if (!this.sessionId) {
            throw new Error("Not connected to a session");
        }
        // Resolve relative paths to working directory
        const resolvedPath = this.resolveFilePath(filePath);
        try {
            const proposalMsg = this.fileToolHandler.proposeFileWrite(resolvedPath, content, createDirs, this.sessionId, this.participantId);
            // Store the proposal for later execution (use resolved path)
            this.fileWriteProposals.set(proposalMsg.id, {
                path: resolvedPath,
                content,
                createDirs,
                toolUseId,
            });
            // Track Claude's tool use ID
            this.toolUseIdToProposalId.set(proposalMsg.id, toolUseId);
            // Update batch with proposal ID
            if (this.pendingToolBatch) {
                const batchEntry = this.pendingToolBatch.tools.get(toolUseId);
                if (batchEntry) {
                    batchEntry.proposalId = proposalMsg.id;
                }
            }
            // Send the proposal
            this.client.send(proposalMsg);
            logger.info({
                proposalId: proposalMsg.id,
                toolUseId,
                path: filePath,
                bytes: content.length,
                createDirs,
            }, "Proposed file write");
            return proposalMsg.id;
        }
        catch (error) {
            logger.error({ error, path: filePath }, "Failed to propose file write");
            throw error;
        }
    }
    /**
     * Propose a file edit operation through the PVP gate system
     */
    async proposeFileEdit(filePath, oldText, newText, occurrence, toolUseId) {
        if (!this.sessionId) {
            throw new Error("Not connected to a session");
        }
        // Resolve relative paths to working directory
        const resolvedPath = this.resolveFilePath(filePath);
        try {
            const proposalMsg = this.fileToolHandler.proposeFileEdit(resolvedPath, oldText, newText, occurrence, this.sessionId, this.participantId);
            // Store the proposal for later execution (use resolved path)
            this.fileEditProposals.set(proposalMsg.id, {
                path: resolvedPath,
                oldText,
                newText,
                occurrence,
                toolUseId,
            });
            // Track Claude's tool use ID
            this.toolUseIdToProposalId.set(proposalMsg.id, toolUseId);
            // Update batch with proposal ID
            if (this.pendingToolBatch) {
                const batchEntry = this.pendingToolBatch.tools.get(toolUseId);
                if (batchEntry) {
                    batchEntry.proposalId = proposalMsg.id;
                }
            }
            // Send the proposal
            this.client.send(proposalMsg);
            logger.info({
                proposalId: proposalMsg.id,
                toolUseId,
                path: filePath,
                occurrence,
            }, "Proposed file edit");
            return proposalMsg.id;
        }
        catch (error) {
            logger.error({ error, path: filePath }, "Failed to propose file edit");
            throw error;
        }
    }
    /**
     * Propose a git commit through the PVP gate system
     */
    async proposeGitCommit(input, toolUseId) {
        if (!this.sessionId) {
            throw new Error("Not connected to a session");
        }
        const args = {
            type: input.type,
            description: input.description,
            scope: input.scope,
            body: input.body,
            confidence: input.confidence,
            decisionType: input.decision_type,
        };
        // Build session context for commit
        const context = {
            sessionId: this.sessionId,
            agentId: this.participantId,
            participants: [{ type: "ai", identifier: this.agentName }],
            workingDirectory: this.workingDirectory || process.cwd(),
        };
        try {
            const proposalMsg = this.gitCommitToolHandler.proposeCommit(args, context);
            // Store the proposal for later execution
            this.gitCommitProposals.set(proposalMsg.id, {
                args,
                context,
                toolUseId,
            });
            // Track Claude's tool use ID
            this.toolUseIdToProposalId.set(proposalMsg.id, toolUseId);
            // Update batch with proposal ID
            if (this.pendingToolBatch) {
                const batchEntry = this.pendingToolBatch.tools.get(toolUseId);
                if (batchEntry) {
                    batchEntry.proposalId = proposalMsg.id;
                }
            }
            // Send the proposal
            this.client.send(proposalMsg);
            logger.info({
                proposalId: proposalMsg.id,
                toolUseId,
                type: args.type,
                description: args.description,
            }, "Proposed git commit");
            return proposalMsg.id;
        }
        catch (error) {
            logger.error({ error, type: input.type }, "Failed to propose git commit");
            throw error;
        }
    }
    /**
     * Execute an approved git commit
     */
    async executeGitCommit(proposalId) {
        if (!this.sessionId)
            return;
        const proposal = this.gitCommitProposals.get(proposalId);
        if (!proposal) {
            logger.warn({ proposalId }, "Git commit proposal not found");
            return;
        }
        const { args, context } = proposal;
        logger.info({
            proposalId,
            type: args.type,
            description: args.description,
        }, "Executing approved git commit");
        try {
            let result = null;
            await this.gitCommitToolHandler.executeCommit(proposalId, args, context, (msg) => {
                this.client.send(msg);
                // Capture tool.result message
                if (msg.type === "tool.result") {
                    const payload = msg.payload;
                    result = {
                        success: payload.success,
                        output: typeof payload.result === "string"
                            ? payload.result
                            : JSON.stringify(payload.result || {}),
                        error: payload.error,
                    };
                }
            });
            // Clean up
            this.gitCommitProposals.delete(proposalId);
            // Update batch with result
            if (result) {
                this.updateBatchResult(proposalId, result);
            }
        }
        catch (error) {
            logger.error({ error, proposalId }, "Git commit execution failed");
            this.gitCommitProposals.delete(proposalId);
            this.updateBatchResult(proposalId, {
                success: false,
                output: "",
                error: error instanceof Error ? error.message : "Unknown error",
            });
        }
    }
    /**
     * Propose a notebook execution to the session
     */
    async proposeNotebookExecute(notebookPath, outputFormat = "notebook", toolUseId) {
        if (!this.sessionId) {
            throw new Error("Not connected to a session");
        }
        try {
            // Resolve the notebook path relative to working directory
            const resolvedPath = this.resolveFilePath(notebookPath);
            const proposalMsg = this.notebookToolHandler.proposeNotebookExecute(resolvedPath, outputFormat, this.sessionId, this.participantId);
            // Store the proposal for later execution
            this.notebookProposals.set(proposalMsg.id, {
                notebookPath: resolvedPath,
                outputFormat,
                toolUseId: toolUseId || "",
            });
            // Track Claude's tool use ID if provided
            if (toolUseId) {
                this.toolUseIdToProposalId.set(proposalMsg.id, toolUseId);
                // Update batch with proposal ID
                if (this.pendingToolBatch) {
                    const batchEntry = this.pendingToolBatch.tools.get(toolUseId);
                    if (batchEntry) {
                        batchEntry.proposalId = proposalMsg.id;
                    }
                }
            }
            // Send the proposal
            this.client.send(proposalMsg);
            logger.info({
                proposalId: proposalMsg.id,
                toolUseId,
                notebookPath: resolvedPath,
                outputFormat,
            }, "Proposed notebook execution");
            return proposalMsg.id;
        }
        catch (error) {
            logger.error({ error, notebookPath }, "Failed to propose notebook execution");
            throw error;
        }
    }
    /**
     * Execute a notebook after approval
     */
    async executeNotebook(proposalId) {
        if (!this.sessionId)
            return;
        const proposal = this.notebookProposals.get(proposalId);
        if (!proposal) {
            logger.warn({ proposalId }, "Notebook proposal not found");
            return;
        }
        const { notebookPath, outputFormat } = proposal;
        logger.info({
            proposalId,
            notebookPath,
            outputFormat,
        }, "Executing approved notebook");
        try {
            let result = null;
            await this.notebookToolHandler.executeNotebook(proposalId, notebookPath, outputFormat, this.sessionId, this.participantId, (msg) => {
                this.client.send(msg);
                // Capture tool.result message
                if (msg.type === "tool.result") {
                    const payload = msg.payload;
                    result = {
                        success: payload.success,
                        output: typeof payload.result === "string"
                            ? payload.result
                            : JSON.stringify(payload.result || {}),
                        error: payload.error,
                    };
                }
            }, this.workingDirectory ?? undefined);
            // Clean up
            this.notebookProposals.delete(proposalId);
            // Update batch with result
            if (result) {
                this.updateBatchResult(proposalId, result);
            }
        }
        catch (error) {
            logger.error({ error, proposalId }, "Notebook execution failed");
            this.notebookProposals.delete(proposalId);
            this.updateBatchResult(proposalId, {
                success: false,
                output: "",
                error: error instanceof Error ? error.message : "Unknown error",
            });
        }
    }
    /**
     * Propose an npm operation to the session
     */
    async proposeNpmOperation(operation, args = [], packageManager, toolUseId) {
        if (!this.sessionId) {
            throw new Error("Not connected to a session");
        }
        try {
            const pm = packageManager || "npm";
            const proposalMsg = this.npmToolHandler.proposeNpmOperation(operation, args, this.sessionId, this.participantId, pm);
            // Store the proposal for later execution
            this.npmProposals.set(proposalMsg.id, {
                operation,
                args,
                packageManager: pm,
                toolUseId: toolUseId || "",
            });
            // Track Claude's tool use ID if provided
            if (toolUseId) {
                this.toolUseIdToProposalId.set(proposalMsg.id, toolUseId);
                // Update batch with proposal ID
                if (this.pendingToolBatch) {
                    const batchEntry = this.pendingToolBatch.tools.get(toolUseId);
                    if (batchEntry) {
                        batchEntry.proposalId = proposalMsg.id;
                    }
                }
            }
            // Send the proposal
            this.client.send(proposalMsg);
            logger.info({
                proposalId: proposalMsg.id,
                toolUseId,
                operation,
                args,
                packageManager: pm,
            }, "Proposed npm operation");
            return proposalMsg.id;
        }
        catch (error) {
            logger.error({ error, operation, args }, "Failed to propose npm operation");
            throw error;
        }
    }
    /**
     * Execute an npm operation after approval
     */
    async executeNpm(proposalId) {
        if (!this.sessionId)
            return;
        const proposal = this.npmProposals.get(proposalId);
        if (!proposal) {
            logger.warn({ proposalId }, "Npm proposal not found");
            return;
        }
        const { operation, args, packageManager } = proposal;
        logger.info({
            proposalId,
            operation,
            args,
            packageManager,
        }, "Executing approved npm operation");
        try {
            let result = null;
            await this.npmToolHandler.executeNpmOperation(proposalId, operation, args, this.sessionId, this.participantId, (msg) => {
                this.client.send(msg);
                // Capture tool.result message
                if (msg.type === "tool.result") {
                    const payload = msg.payload;
                    result = {
                        success: payload.success,
                        output: typeof payload.result === "string"
                            ? payload.result
                            : JSON.stringify(payload.result || {}),
                        error: payload.error,
                    };
                }
            }, this.workingDirectory ?? undefined, packageManager);
            // Clean up
            this.npmProposals.delete(proposalId);
            // Update batch with result
            if (result) {
                this.updateBatchResult(proposalId, result);
            }
        }
        catch (error) {
            logger.error({ error, proposalId }, "Npm operation failed");
            this.npmProposals.delete(proposalId);
            this.updateBatchResult(proposalId, {
                success: false,
                output: "",
                error: error instanceof Error ? error.message : "Unknown error",
            });
        }
    }
    /**
     * Get the current session tasks and goals context summary
     * Returns a markdown-formatted string describing the session objective and task status
     */
    getTasksContextSummary() {
        return this.tasksToolHandler.getContextSummary();
    }
    /**
     * Handle a new participant joining the session.
     * Notifies the LLM about the new participant so it can respond intelligently.
     */
    async handleParticipantJoined(participant) {
        if (!this.sessionId)
            return;
        // Don't interrupt if tools are pending
        if (this.pendingToolBatch && this.pendingToolBatch.tools.size > 0) {
            const pendingCount = Array.from(this.pendingToolBatch.tools.values())
                .filter(t => t.status === 'pending').length;
            if (pendingCount > 0) {
                logger.debug({ participant: participant.name }, "Skipping join notification - tools pending");
                return;
            }
        }
        logger.info({ name: participant.name, type: participant.type, roles: participant.roles }, "New participant joined session - notifying LLM");
        // Build context about who joined
        const participantType = participant.type === "agent" ? "AI agent" : "human";
        const rolesDesc = participant.roles.length > 0 ? ` with role(s): ${participant.roles.join(", ")}` : "";
        const joinNotification = `[SYSTEM NOTIFICATION: A new ${participantType} named "${participant.name}" has joined the session${rolesDesc}. ` +
            `You may acknowledge their arrival briefly and welcome them if appropriate. ` +
            `If you have prior context about this participant, you may reference it.]`;
        // Generate a prompt ref for this notification response
        const notificationPromptRef = ulid();
        // Send thinking start (follows established pattern)
        const thinkingStartMsg = createMessage("thinking.start", this.sessionId, this.participantId, {
            agent: this.participantId,
            prompt_ref: notificationPromptRef,
            visible_to: "all",
        });
        this.client.send(thinkingStartMsg);
        // Send response start
        const responseStartMsg = createMessage("response.start", this.sessionId, this.participantId, {
            agent: this.participantId,
            prompt_ref: notificationPromptRef,
        });
        this.client.send(responseStartMsg);
        try {
            // Add join notification to history
            this.conversationHistory.push({
                role: "user",
                content: joinNotification
            });
            // Call Claude for a brief acknowledgment
            const response = await this.provider.createCompletion({
                model: this.model,
                maxTokens: 256, // Keep response brief
                messages: this.conversationHistory,
                tools: [] // No tools for join acknowledgment
            });
            // Handle response
            const fullResponse = response.text;
            for (const block of response.rawContent) {
                if (block.type === "text") {
                    const chunkMsg = createMessage("response.chunk", this.sessionId, this.participantId, { text: block.text });
                    this.client.send(chunkMsg);
                }
            }
            // Add assistant response to history
            this.conversationHistory.push({
                role: "assistant",
                content: response.rawContent
            });
            // Send thinking end
            const thinkingEndMsg = createMessage("thinking.end", this.sessionId, this.participantId, {
                summary: `Generated join acknowledgment for ${participant.name}`,
            });
            this.client.send(thinkingEndMsg);
            // Send response end
            const responseEndMsg = createMessage("response.end", this.sessionId, this.participantId, {
                finish_reason: "complete",
            });
            this.client.send(responseEndMsg);
        }
        catch (error) {
            logger.error({ error, participant: participant.name }, "Error generating join acknowledgment");
            // Send thinking end on error
            const thinkingEndMsg = createMessage("thinking.end", this.sessionId, this.participantId, {
                summary: "Error generating join acknowledgment",
            });
            this.client.send(thinkingEndMsg);
            // Send error response end
            const responseEndMsg = createMessage("response.end", this.sessionId, this.participantId, {
                finish_reason: "error",
            });
            this.client.send(responseEndMsg);
        }
    }
    /**
     * Check if a message is addressed to another participant via @mention
     *
     * Rules:
     * - If message STARTS with "@participantName" where participantName is another participant,
     *   the agent should ignore the message entirely
     * - If "@participantName" appears elsewhere in the message, the agent should use context
     *   clues to decide if it's being addressed (handled by returning mentionContext)
     *
     * @returns shouldIgnore: true if agent should not respond, mentionContext: context for LLM
     */
    checkMentionRouting(content) {
        const trimmedContent = content.trim();
        // Build list of other participants (not this agent)
        const otherParticipants = [];
        for (const [id, info] of this.sessionParticipants) {
            if (id !== this.participantId) {
                otherParticipants.push({ id, name: info.name });
            }
        }
        if (otherParticipants.length === 0) {
            // No other participants tracked, can't filter
            return { shouldIgnore: false };
        }
        // Check if message starts with @participantName (case-insensitive)
        const startsWithMentionRegex = /^@(\S+)/i;
        const startsWithMatch = trimmedContent.match(startsWithMentionRegex);
        if (startsWithMatch) {
            const mentionedName = startsWithMatch[1].toLowerCase();
            // Check if this mentions another participant
            for (const participant of otherParticipants) {
                const participantNameLower = participant.name.toLowerCase();
                // Match if the mention is the participant's name or starts with it
                if (mentionedName === participantNameLower ||
                    participantNameLower.startsWith(mentionedName) ||
                    mentionedName.startsWith(participantNameLower)) {
                    return {
                        shouldIgnore: true,
                        targetName: participant.name,
                    };
                }
            }
            // Check if it mentions this agent (case-insensitive)
            const agentNameLower = this.agentName.toLowerCase();
            if (mentionedName === agentNameLower ||
                agentNameLower.startsWith(mentionedName) ||
                mentionedName.startsWith(agentNameLower)) {
                // Addressed to this agent, definitely respond
                return { shouldIgnore: false };
            }
        }
        // Check for @mentions elsewhere in the message
        const mentionRegex = /@(\S+)/gi;
        const allMentions = [...trimmedContent.matchAll(mentionRegex)];
        if (allMentions.length > 0) {
            const mentionedNames = [];
            let mentionsThisAgent = false;
            let mentionsOthers = false;
            for (const match of allMentions) {
                const mentionedName = match[1].toLowerCase();
                // Check if mentions this agent
                const agentNameLower = this.agentName.toLowerCase();
                if (mentionedName === agentNameLower ||
                    agentNameLower.startsWith(mentionedName) ||
                    mentionedName.startsWith(agentNameLower)) {
                    mentionsThisAgent = true;
                }
                // Check if mentions other participants
                for (const participant of otherParticipants) {
                    const participantNameLower = participant.name.toLowerCase();
                    if (mentionedName === participantNameLower ||
                        participantNameLower.startsWith(mentionedName) ||
                        mentionedName.startsWith(participantNameLower)) {
                        mentionsOthers = true;
                        mentionedNames.push(participant.name);
                    }
                }
            }
            // If mentions others but not this agent, provide context for LLM to decide
            if (mentionsOthers && !mentionsThisAgent) {
                return {
                    shouldIgnore: false,
                    mentionContext: `Note: This message mentions other participant(s): ${mentionedNames.join(", ")}. ` +
                        `Use context clues to determine if you are also being addressed or if this is directed only at them.`,
                };
            }
        }
        return { shouldIgnore: false };
    }
    /**
     * Check if strict mode is enabled
     */
    isStrictMode() {
        return this.strictMode;
    }
    /**
     * Validate that work aligns with session tasks (for strict mode)
     * Returns validation result with reason
     */
    validateAgainstTasks() {
        const state = this.tasksToolHandler.getState();
        // No goal and no tasks - nothing to validate against
        if (!state.goal && state.tasks.length === 0) {
            return {
                valid: false,
                reason: "STRICT MODE: No session goal or tasks defined. Use the 'tasks' tool to set a goal or add tasks before proceeding.",
            };
        }
        // Check for incomplete tasks (in_progress or pending)
        const activeTasks = state.tasks.filter(t => t.status !== "completed");
        if (activeTasks.length > 0) {
            return { valid: true, reason: `Working towards ${activeTasks.length} active task(s)` };
        }
        // Has goal but all tasks completed
        if (state.goal) {
            return { valid: true, reason: `Session goal: "${state.goal.goal}"` };
        }
        return {
            valid: false,
            reason: "STRICT MODE: All tasks completed. Set new tasks or a new goal to continue.",
        };
    }
    /**
     * Get strict mode context for system prompt injection
     * Returns context that helps Claude understand and work within strict mode constraints
     */
    getStrictModeContext() {
        if (!this.strictMode)
            return null;
        const state = this.tasksToolHandler.getState();
        const lines = [
            "## STRICT MODE ACTIVE",
            "",
            "You are operating in STRICT MODE. All responses and tool usage must align with the session's defined tasks and goals.",
            "",
        ];
        if (state.goal) {
            lines.push(`**Session Goal:** ${state.goal.goal}`);
            lines.push("");
        }
        const activeTasks = state.tasks.filter(t => t.status !== "completed");
        if (activeTasks.length > 0) {
            lines.push("**Active Tasks:**");
            for (const task of activeTasks) {
                const status = task.status === "in_progress" ? "🔄" : "⏳";
                lines.push(`- ${status} [${task.priority}] ${task.title} (${task.id})`);
            }
            lines.push("");
        }
        if (!state.goal && activeTasks.length === 0) {
            lines.push("⚠️ **WARNING:** No goal or tasks defined. You must first use the 'tasks' tool to:");
            lines.push("- Set a session goal with: `set_goal`");
            lines.push("- Add tasks with: `add`");
            lines.push("");
        }
        lines.push("Before executing any action, verify it serves one of the defined tasks or the session goal.");
        return lines.join("\n");
    }
    /**
     * Propose a tasks operation for session goal/task management
     */
    async proposeTasksOperation(args, toolUseId) {
        if (!this.sessionId) {
            throw new Error("Not connected to a session");
        }
        try {
            const proposalMsg = this.tasksToolHandler.proposeTasksOperation(args, this.sessionId, this.participantId);
            // Store the proposal for later execution
            this.tasksProposals.set(proposalMsg.id, {
                args,
                toolUseId: toolUseId || "",
            });
            // Track Claude's tool use ID if provided
            if (toolUseId) {
                this.toolUseIdToProposalId.set(proposalMsg.id, toolUseId);
                // Update batch with proposal ID
                if (this.pendingToolBatch) {
                    const batchEntry = this.pendingToolBatch.tools.get(toolUseId);
                    if (batchEntry) {
                        batchEntry.proposalId = proposalMsg.id;
                    }
                }
            }
            // Send the proposal
            this.client.send(proposalMsg);
            logger.info({
                proposalId: proposalMsg.id,
                toolUseId,
                operation: args.operation,
            }, "Proposed tasks operation");
            return proposalMsg.id;
        }
        catch (error) {
            logger.error({ error, operation: args.operation }, "Failed to propose tasks operation");
            throw error;
        }
    }
    /**
     * Execute an approved tasks operation
     */
    async executeTasks(proposalId) {
        if (!this.sessionId)
            return;
        const proposal = this.tasksProposals.get(proposalId);
        if (!proposal) {
            logger.warn({ proposalId }, "Tasks proposal not found");
            return;
        }
        const { args } = proposal;
        logger.info({
            proposalId,
            operation: args.operation,
        }, "Executing tasks operation");
        try {
            let result = null;
            await this.tasksToolHandler.executeTasksOperation(proposalId, args, this.sessionId, this.participantId, (msg) => {
                this.client.send(msg);
                // Capture tool.result message
                if (msg.type === "tool.result") {
                    const payload = msg.payload;
                    result = {
                        success: payload.success,
                        output: typeof payload.result === "string"
                            ? payload.result
                            : JSON.stringify(payload.result || {}),
                        error: payload.error,
                    };
                }
            });
            // Clean up
            this.tasksProposals.delete(proposalId);
            // Update batch with result
            if (result) {
                this.updateBatchResult(proposalId, result);
            }
        }
        catch (error) {
            logger.error({ error, proposalId }, "Tasks operation failed");
            this.tasksProposals.delete(proposalId);
            this.updateBatchResult(proposalId, {
                success: false,
                output: "",
                error: error instanceof Error ? error.message : "Unknown error",
            });
        }
    }
    /**
     * Propose an MCP tool for execution through the PVP gate system
     */
    async proposeMCPTool(namespacedName, args, toolUseId) {
        if (!this.sessionId) {
            throw new Error("Not connected to a session");
        }
        const mcpTool = this.mcpManager.getTool(namespacedName);
        if (!mcpTool) {
            throw new Error(`MCP tool not found: ${namespacedName}`);
        }
        // Create tool proposal message
        const proposalMsg = createMessage("tool.propose", this.sessionId, this.participantId, {
            tool_name: namespacedName,
            arguments: args,
            agent: this.participantId,
            category: mcpTool.category,
            risk_level: mcpTool.risk_level,
            description: mcpTool.mcp_tool.description || `MCP tool from ${mcpTool.server_name}`,
            requires_approval: mcpTool.requires_approval,
        });
        // Store the proposal for later execution
        this.mcpToolProposals.set(proposalMsg.id, {
            tool: mcpTool,
            args,
            toolUseId,
        });
        // Track Claude's tool use ID
        this.toolUseIdToProposalId.set(proposalMsg.id, toolUseId);
        // Update batch with proposal ID
        if (this.pendingToolBatch) {
            const batchEntry = this.pendingToolBatch.tools.get(toolUseId);
            if (batchEntry) {
                batchEntry.proposalId = proposalMsg.id;
            }
        }
        // Send the proposal
        this.client.send(proposalMsg);
        logger.info({
            proposalId: proposalMsg.id,
            toolUseId,
            tool: namespacedName,
            category: mcpTool.category,
            riskLevel: mcpTool.risk_level,
            requiresApproval: mcpTool.requires_approval,
        }, "Proposed MCP tool");
        return proposalMsg.id;
    }
    /**
     * Execute an approved file write operation
     */
    async executeFileWrite(proposalId) {
        if (!this.sessionId)
            return;
        const proposal = this.fileWriteProposals.get(proposalId);
        if (!proposal) {
            logger.warn({ proposalId }, "File write proposal not found");
            return;
        }
        const { path, content, createDirs } = proposal;
        logger.info({
            proposalId,
            path,
            bytes: content.length,
        }, "Executing approved file write");
        try {
            const result = await this.fileToolHandler.executeFileWrite(proposalId, path, content, createDirs, this.sessionId, this.participantId, (msg) => this.client.send(msg));
            // Clean up
            this.fileWriteProposals.delete(proposalId);
            // Notify participants of file change
            if (result.success) {
                const updateMsg = createMessage("context.update", this.sessionId, this.participantId, {
                    key: `file:${result.path}`,
                    new_content: content,
                    reason: `File written by ${this.agentName}`,
                });
                this.client.send(updateMsg);
            }
            // Update batch with result
            this.updateBatchResult(proposalId, {
                success: result.success,
                output: result.success
                    ? `Wrote ${result.bytesWritten} bytes to ${result.path}`
                    : `Failed to write: ${result.error}`,
                error: result.error,
            });
        }
        catch (error) {
            logger.error({ error, proposalId, path }, "File write execution failed");
            this.fileWriteProposals.delete(proposalId);
            this.updateBatchResult(proposalId, {
                success: false,
                output: "",
                error: error instanceof Error ? error.message : "Unknown error",
            });
        }
    }
    /**
     * Execute an approved file edit operation
     */
    async executeFileEdit(proposalId) {
        if (!this.sessionId)
            return;
        const proposal = this.fileEditProposals.get(proposalId);
        if (!proposal) {
            logger.warn({ proposalId }, "File edit proposal not found");
            return;
        }
        const { path, oldText, newText, occurrence } = proposal;
        logger.info({
            proposalId,
            path,
            occurrence,
        }, "Executing approved file edit");
        try {
            const result = await this.fileToolHandler.executeFileEdit(proposalId, path, oldText, newText, occurrence, this.sessionId, this.participantId, (msg) => this.client.send(msg));
            // Clean up
            this.fileEditProposals.delete(proposalId);
            // Notify participants of file change
            if (result.success) {
                const updateMsg = createMessage("context.update", this.sessionId, this.participantId, {
                    key: `file:${result.path}`,
                    diff: `- ${oldText}\n+ ${newText}`,
                    reason: `File edited by ${this.agentName}`,
                });
                this.client.send(updateMsg);
            }
            // Update batch with result
            this.updateBatchResult(proposalId, {
                success: result.success,
                output: result.success
                    ? `Replaced ${result.replacements} of ${result.matchCount} occurrences in ${result.path}`
                    : `Failed to edit: ${result.error}`,
                error: result.error,
            });
        }
        catch (error) {
            logger.error({ error, proposalId, path }, "File edit execution failed");
            this.fileEditProposals.delete(proposalId);
            this.updateBatchResult(proposalId, {
                success: false,
                output: "",
                error: error instanceof Error ? error.message : "Unknown error",
            });
        }
    }
    /**
     * Execute an approved MCP tool
     */
    async executeMCPTool(proposalId) {
        if (!this.sessionId)
            return;
        const proposal = this.mcpToolProposals.get(proposalId);
        if (!proposal) {
            logger.warn({ proposalId }, "MCP tool proposal not found");
            return;
        }
        const { tool, args, toolUseId } = proposal;
        logger.info({
            proposalId,
            tool: tool.namespaced_name,
            server: tool.server_name,
        }, "Executing approved MCP tool");
        const startTime = Date.now();
        try {
            // Execute via MCP manager
            const result = await this.mcpManager.callTool(tool.namespaced_name, args);
            const duration_ms = Date.now() - startTime;
            // Send tool result message through PVP
            const resultMsg = createMessage("tool.result", this.sessionId, this.participantId, {
                tool_proposal: proposalId,
                success: result.success,
                result: result.content,
                error: result.error,
                duration_ms,
            });
            this.client.send(resultMsg);
            // Clean up
            this.mcpToolProposals.delete(proposalId);
            // Update batch with result (don't send to Claude yet - wait for all tools)
            this.updateBatchResult(proposalId, {
                success: result.success,
                output: JSON.stringify(result.content, null, 2),
                error: result.error,
            });
        }
        catch (error) {
            const duration_ms = Date.now() - startTime;
            logger.error({ error, proposalId, tool: tool.namespaced_name }, "MCP tool execution failed");
            // Send error result
            const errorMsg = createMessage("tool.result", this.sessionId, this.participantId, {
                tool_proposal: proposalId,
                success: false,
                error: error instanceof Error ? error.message : "Unknown error",
                duration_ms,
            });
            this.client.send(errorMsg);
            this.mcpToolProposals.delete(proposalId);
            // Update batch with error result
            this.updateBatchResult(proposalId, {
                success: false,
                output: "",
                error: error instanceof Error ? error.message : "Unknown error",
            });
        }
    }
    /**
     * Update a tool's result in the pending batch and check if batch is complete
     */
    updateBatchResult(proposalId, result) {
        if (!this.pendingToolBatch) {
            logger.warn({ proposalId }, "No pending tool batch, falling back to immediate send");
            this.sendToolResultToClaude(proposalId, result);
            return;
        }
        // Find the batch entry by proposalId
        let foundToolUseId = null;
        for (const [toolUseId, entry] of this.pendingToolBatch.tools) {
            if (entry.proposalId === proposalId) {
                foundToolUseId = toolUseId;
                break;
            }
        }
        if (!foundToolUseId) {
            logger.warn({ proposalId }, "Proposal not found in batch, falling back to immediate send");
            this.sendToolResultToClaude(proposalId, result);
            return;
        }
        // Get and update the entry
        const entry = this.pendingToolBatch.tools.get(foundToolUseId);
        entry.status = 'resolved';
        entry.result = result;
        logger.info({
            proposalId,
            toolUseId: foundToolUseId,
            batchSize: this.pendingToolBatch.tools.size,
            resolved: Array.from(this.pendingToolBatch.tools.values()).filter(e => e.status === 'resolved').length,
        }, "Updated batch entry with result");
        // Check if all tools are resolved
        this.checkAndSendBatchResults();
    }
    /**
     * Check if all tools in the batch are resolved and send results to Claude
     */
    async checkAndSendBatchResults() {
        if (!this.pendingToolBatch || !this.sessionId)
            return;
        const allResolved = Array.from(this.pendingToolBatch.tools.values()).every(entry => entry.status === 'resolved');
        if (!allResolved) {
            const pending = Array.from(this.pendingToolBatch.tools.values()).filter(e => e.status === 'pending');
            logger.debug({ pendingCount: pending.length }, "Batch not complete, waiting for more results");
            return;
        }
        logger.info({ batchSize: this.pendingToolBatch.tools.size }, "All tools resolved, sending batch results to Claude");
        // Build tool_result blocks for all tools
        const toolResults = [];
        for (const [toolUseId, entry] of this.pendingToolBatch.tools) {
            if (!entry.result)
                continue;
            toolResults.push({
                type: "tool_result",
                toolUseId: toolUseId,
                content: entry.result.error ? `Error: ${entry.result.error}` : entry.result.output,
                isError: !entry.result.success,
            });
            // Clean up tracking maps
            if (entry.proposalId) {
                this.toolUseIdToProposalId.delete(entry.proposalId);
            }
        }
        // Capture batch state before clearing
        const promptRef = this.pendingToolBatch.promptRef;
        const hadRejection = this.pendingToolBatch.hadRejection;
        this.pendingToolBatch = null;
        // If ANY tool was rejected, agent must STOP and wait for new user prompt
        if (hadRejection) {
            logger.info("Batch had rejection - agent stopping, waiting for new user prompt");
            // Still need to add results to history so conversation stays valid
            this.conversationHistory.push({
                role: "user",
                content: toolResults,
            });
            // Send a notification that the agent is waiting
            const responseEndMsg = createMessage("response.end", this.sessionId, this.participantId, {
                finish_reason: "interrupted", // User rejected tool - agent interrupted
            });
            this.client.send(responseEndMsg);
            return; // STOP - do not call Claude again until new prompt
        }
        try {
            // Send thinking start for processing tool results
            const thinkingStartMsg = createMessage("thinking.start", this.sessionId, this.participantId, {
                agent: this.participantId,
                prompt_ref: promptRef,
                visible_to: "all",
            });
            this.client.send(thinkingStartMsg);
            // Send response start
            const responseStartMsg = createMessage("response.start", this.sessionId, this.participantId, {
                agent: this.participantId,
                prompt_ref: promptRef,
            });
            this.client.send(responseStartMsg);
            // Add ALL tool results to conversation history in a single message
            this.conversationHistory.push({
                role: "user",
                content: toolResults,
            });
            // Call Claude again with all tool results
            const response = await this.provider.createCompletion({
                model: this.model,
                maxTokens: 4096,
                messages: this.conversationHistory,
                tools: this.getAllTools(),
            });
            // Handle Claude's response
            let fullResponse = response.text;
            const toolUses = [];
            for (const block of response.rawContent) {
                if (block.type === "text") {
                    const chunkMsg = createMessage("response.chunk", this.sessionId, this.participantId, {
                        text: block.text,
                    });
                    this.client.send(chunkMsg);
                }
                else if (block.type === "tool_use") {
                    toolUses.push(block);
                }
            }
            // Add Claude's response to history
            this.conversationHistory.push({
                role: "assistant",
                content: response.rawContent,
            });
            // Create new batch if Claude requests more tools
            if (toolUses.length > 0) {
                this.createToolBatch(promptRef, toolUses);
                await this.proposeToolBatch(toolUses);
            }
            // Send thinking end
            const thinkingEndMsg = createMessage("thinking.end", this.sessionId, this.participantId, {
                summary: `Processed ${toolResults.length} tool results, generated ${fullResponse.length} char response with ${toolUses.length} additional tool requests`,
            });
            this.client.send(thinkingEndMsg);
            // Send response end
            const responseEndMsg = createMessage("response.end", this.sessionId, this.participantId, {
                finish_reason: response.finishReason === "tool_use" ? "tool_use" : "complete",
            });
            this.client.send(responseEndMsg);
            logger.info(`[${this.agentName}] Sent ${toolResults.length} tool results to Claude (${fullResponse.length} chars, ${toolUses.length} additional tools)`);
        }
        catch (error) {
            logger.error({ error, toolResultCount: toolResults.length }, "Error sending batch results to Claude");
            // Check if this is a tool_result missing error - if so, try to recover
            const errorMessage = error instanceof Error ? error.message : String(error);
            if (errorMessage.includes("tool_use") && errorMessage.includes("tool_result")) {
                logger.warn("Detected corrupted conversation history in batch send - attempting recovery");
                this.recoverFromCorruptedHistory();
            }
            const errorMsg = createMessage("error", this.sessionId, this.participantId, {
                code: "AGENT_ERROR",
                message: error instanceof Error ? error.message : "Unknown error",
                recoverable: true,
            });
            this.client.send(errorMsg);
        }
    }
    /**
     * Create a new tool batch for tracking parallel tool_use blocks
     */
    createToolBatch(promptRef, toolUses) {
        this.pendingToolBatch = {
            promptRef,
            hadRejection: false,
            tools: new Map(),
        };
        for (const toolUse of toolUses) {
            this.pendingToolBatch.tools.set(toolUse.id, {
                toolUseId: toolUse.id,
                toolName: toolUse.name,
                proposalId: null,
                status: 'pending',
                result: null,
            });
        }
        logger.info({ batchSize: toolUses.length, promptRef }, "Created tool batch");
    }
    /**
     * Propose all tools in a batch
     */
    async proposeToolBatch(toolUses) {
        // Strict mode enforcement: validate that goals/tasks exist before executing non-tasks tools
        if (this.strictMode) {
            const validation = this.validateAgainstTasks();
            if (!validation.valid) {
                // Check if any tool is NOT the tasks tool - those need to be blocked
                for (const toolUse of toolUses) {
                    if (toolUse.name !== "tasks") {
                        logger.warn({ toolName: toolUse.name, toolUseId: toolUse.id, reason: validation.reason }, "Strict mode: blocking tool without session tasks/goals");
                        this.markToolFailed(toolUse.id, validation.reason);
                    }
                }
                // Filter to only tasks tool operations (which are always allowed)
                const tasksOnlyTools = toolUses.filter(t => t.name === "tasks");
                if (tasksOnlyTools.length === 0) {
                    return; // All tools blocked, nothing to do
                }
                // Continue with only the tasks tool(s)
                toolUses = tasksOnlyTools;
            }
        }
        for (const toolUse of toolUses) {
            try {
                // Validate input exists
                if (!toolUse.input) {
                    logger.error({ toolUseId: toolUse.id, toolName: toolUse.name }, "Tool use has undefined input");
                    // Mark as failed in batch so we don't wait forever
                    this.markToolFailed(toolUse.id, "Tool input was undefined");
                    continue;
                }
                if (toolUse.name === "execute_shell_command") {
                    const input = toolUse.input;
                    if (!input.command) {
                        logger.error({ toolUseId: toolUse.id }, "Shell command input missing command field");
                        this.markToolFailed(toolUse.id, "Missing command field");
                        continue;
                    }
                    logger.info({ command: input.command, toolUseId: toolUse.id }, "Claude requested shell command execution");
                    await this.proposeShellCommand(input.command, toolUse.id);
                }
                else if (toolUse.name === "file_write") {
                    const input = toolUse.input;
                    if (!input.path || input.content === undefined) {
                        logger.error({ toolUseId: toolUse.id, hasPath: !!input.path, hasContent: input.content !== undefined }, "File write input missing required fields");
                        this.markToolFailed(toolUse.id, "Missing path or content field");
                        continue;
                    }
                    logger.info({ path: input.path, bytes: input.content.length, toolUseId: toolUse.id }, "Claude requested file write");
                    await this.proposeFileWrite(input.path, input.content, input.create_dirs || false, toolUse.id);
                }
                else if (toolUse.name === "file_edit") {
                    const input = toolUse.input;
                    if (!input.path || input.old_text === undefined || input.new_text === undefined) {
                        logger.error({ toolUseId: toolUse.id }, "File edit input missing required fields");
                        this.markToolFailed(toolUse.id, "Missing required fields");
                        continue;
                    }
                    logger.info({ path: input.path, toolUseId: toolUse.id }, "Claude requested file edit");
                    await this.proposeFileEdit(input.path, input.old_text, input.new_text, input.occurrence || 0, toolUse.id);
                }
                else if (toolUse.name === "git_commit") {
                    const input = toolUse.input;
                    if (!input.type || !input.description) {
                        logger.error({ toolUseId: toolUse.id }, "Git commit input missing required fields");
                        this.markToolFailed(toolUse.id, "Missing type or description");
                        continue;
                    }
                    logger.info({ type: input.type, description: input.description, toolUseId: toolUse.id }, "Claude requested git commit");
                    await this.proposeGitCommit(input, toolUse.id);
                }
                else if (toolUse.name === "notebook_execute") {
                    const input = toolUse.input;
                    if (!input.notebook_path) {
                        logger.error({ toolUseId: toolUse.id }, "Notebook execute input missing notebook_path field");
                        this.markToolFailed(toolUse.id, "Missing notebook_path");
                        continue;
                    }
                    logger.info({ notebookPath: input.notebook_path, outputFormat: input.output_format || "notebook", toolUseId: toolUse.id }, "Claude requested notebook execution");
                    await this.proposeNotebookExecute(input.notebook_path, input.output_format || "notebook", toolUse.id);
                }
                else if (toolUse.name === "npm") {
                    const input = toolUse.input;
                    if (!input.operation) {
                        logger.error({ toolUseId: toolUse.id }, "Npm input missing operation field");
                        this.markToolFailed(toolUse.id, "Missing operation");
                        continue;
                    }
                    logger.info({ operation: input.operation, args: input.args, packageManager: input.package_manager, toolUseId: toolUse.id }, "Claude requested npm operation");
                    await this.proposeNpmOperation(input.operation, input.args || [], input.package_manager, toolUse.id);
                }
                else if (toolUse.name === "tasks") {
                    const input = toolUse.input;
                    if (!input.operation) {
                        logger.error({ toolUseId: toolUse.id }, "Tasks input missing operation field");
                        this.markToolFailed(toolUse.id, "Missing operation");
                        continue;
                    }
                    logger.info({ operation: input.operation, toolUseId: toolUse.id }, "Claude requested tasks operation");
                    await this.proposeTasksOperation(input, toolUse.id);
                }
                else if (this.mcpManager.isMCPTool(toolUse.name)) {
                    logger.info({ tool: toolUse.name, toolUseId: toolUse.id }, "Claude requested MCP tool execution");
                    await this.proposeMCPTool(toolUse.name, toolUse.input, toolUse.id);
                }
                else {
                    logger.warn({ toolName: toolUse.name, toolUseId: toolUse.id }, "Unknown tool type");
                    this.markToolFailed(toolUse.id, `Unknown tool: ${toolUse.name}`);
                }
            }
            catch (error) {
                logger.error({ error, toolUseId: toolUse.id, toolName: toolUse.name }, "Error proposing tool");
                this.markToolFailed(toolUse.id, `Error proposing tool: ${error}`);
            }
        }
    }
    /**
     * Mark a tool as failed in the pending batch
     */
    markToolFailed(toolUseId, errorMessage) {
        if (!this.pendingToolBatch) {
            return;
        }
        const entry = this.pendingToolBatch.tools.get(toolUseId);
        if (entry) {
            entry.status = 'resolved';
            entry.result = {
                success: false,
                output: "",
                error: errorMessage,
            };
            logger.info({ toolUseId, errorMessage }, "Marked tool as failed in batch");
            // Check if all tools are now resolved
            this.checkAndSendBatchResults();
        }
    }
    /**
     * Recover from corrupted conversation history caused by missing tool_result blocks.
     * This removes the last assistant message if it contains tool_use blocks without
     * corresponding tool_result, and clears any pending tool batches.
     */
    recoverFromCorruptedHistory() {
        // Clear pending tool batch
        if (this.pendingToolBatch) {
            logger.info({ batchSize: this.pendingToolBatch.tools.size }, "Clearing pending tool batch during recovery");
            this.pendingToolBatch = null;
        }
        // Clear pending proposals
        this.toolProposals.clear();
        this.fileWriteProposals.clear();
        this.fileEditProposals.clear();
        this.mcpToolProposals.clear();
        this.toolUseIdToProposalId.clear();
        // Find and remove the last assistant message if it contains tool_use
        for (let i = this.conversationHistory.length - 1; i >= 0; i--) {
            const msg = this.conversationHistory[i];
            if (msg.role === "assistant" && Array.isArray(msg.content)) {
                const hasToolUse = msg.content.some((block) => block.type === "tool_use");
                if (hasToolUse) {
                    logger.info({ index: i }, "Removing corrupted assistant message with tool_use");
                    // Remove this message and everything after it
                    this.conversationHistory = this.conversationHistory.slice(0, i);
                    break;
                }
            }
        }
        logger.info({ historyLength: this.conversationHistory.length }, "Conversation history recovered");
    }
    async disconnect() {
        await this.mcpManager.shutdown();
        this.client.close();
    }
}
