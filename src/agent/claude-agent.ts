import Anthropic from "@anthropic-ai/sdk";
import type { MessageParam, ToolUseBlock, Tool, ToolResultBlockParam } from "@anthropic-ai/sdk/resources/messages.js";
import path from "path";
import { WebSocketClient } from "../transports/websocket.js";
import { createMessage } from "../protocol/messages.js";
import { createParticipantInfo } from "../protocol/defaults.js";
import { ulid } from "../utils/ulid.js";
import { logger } from "../utils/logger.js";
import { createShellToolHandler } from "./tools/shell-tool.js";
import { categorizeCommand } from "./tools/shell-executor.js";
import { createFileToolHandler } from "./tools/file-tool.js";
import { categorizeFilePath, isPathBlocked, type FileWriteCommand, type FileEditCommand } from "./tools/file-executor.js";
import { createGitCommitToolHandler, type GitCommitArgs, type CommitSessionContext } from "./tools/git-commit-tool.js";
import { MCPManager, type MCPServerConfig, type MCPToolDefinition } from "./mcp/index.js";
import type {
  AnyMessage,
  ParticipantId,
  SessionId,
  MessageId,
} from "../protocol/types.js";
import type { ShellCommand } from "./tools/shell-executor.js";

export interface ClaudeAgentConfig {
  serverUrl: string;
  sessionId?: SessionId;
  agentName?: string;
  model?: string;
  apiKey?: string;
  /** Local working directory path. If set, ignores server-provided path (for remote connections) */
  localWorkDir?: string;
}

export class ClaudeAgent {
  private client: WebSocketClient;
  private anthropic: Anthropic;
  private participantId: ParticipantId;
  private sessionId: SessionId | null = null;
  private workingDirectory: string | null = null;
  private localWorkDir: string | null = null;
  private agentName: string;
  private model: string;
  private conversationHistory: MessageParam[] = [];
  private shellToolHandler: ReturnType<typeof createShellToolHandler>;
  private fileToolHandler: ReturnType<typeof createFileToolHandler>;
  private gitCommitToolHandler: ReturnType<typeof createGitCommitToolHandler>;
  private toolProposals: Map<MessageId, { command: ShellCommand; proposalMsg: AnyMessage }> = new Map();
  private fileWriteProposals: Map<MessageId, { path: string; content: string; createDirs: boolean; toolUseId: string }> = new Map();
  private fileEditProposals: Map<MessageId, { path: string; oldText: string; newText: string; occurrence: number; toolUseId: string }> = new Map();
  private gitCommitProposals: Map<MessageId, { args: GitCommitArgs; context: CommitSessionContext; toolUseId: string }> = new Map();
  private toolUseIdToProposalId: Map<MessageId, string> = new Map();
  private currentPromptRef: MessageId | null = null;

  // MCP support
  private mcpManager: MCPManager;
  private mcpToolProposals: Map<MessageId, {
    tool: MCPToolDefinition;
    args: Record<string, unknown>;
    toolUseId: string;
  }> = new Map();

  // Tool batching - Anthropic API requires ALL tool_use blocks to have
  // corresponding tool_result blocks in the next message
  private pendingToolBatch: {
    promptRef: MessageId;
    tools: Map<string, {  // keyed by toolUseId
      toolUseId: string;
      toolName: string;
      proposalId: MessageId | null;
      status: 'pending' | 'resolved';
      result: { success: boolean; output: string; error?: string } | null;
    }>;
  } | null = null;

  constructor(config: ClaudeAgentConfig) {
    this.participantId = ulid();
    this.agentName = config.agentName || "Claude Assistant";
    this.model = config.model || "claude-sonnet-4-5-20250929";
    this.localWorkDir = config.localWorkDir || null;
    // If local working directory is set, use it immediately (don't wait for server context.add)
    if (this.localWorkDir) {
      this.workingDirectory = this.localWorkDir;
    }

    // Initialize Anthropic client
    this.anthropic = new Anthropic({
      apiKey: config.apiKey || process.env.ANTHROPIC_API_KEY,
    });

    // Initialize WebSocket client
    this.client = new WebSocketClient(config.serverUrl, this.participantId);

    // Initialize shell tool handler
    this.shellToolHandler = createShellToolHandler();

    // Initialize file tool handler
    this.fileToolHandler = createFileToolHandler();

    // Initialize git commit tool handler
    this.gitCommitToolHandler = createGitCommitToolHandler();

    // Initialize MCP manager
    this.mcpManager = new MCPManager();

    this.setupEventHandlers();

    if (config.sessionId) {
      this.sessionId = config.sessionId;
    }
  }

  /**
   * Initialize MCP servers from configuration
   */
  async initializeMCP(configs: MCPServerConfig[]): Promise<void> {
    for (const config of configs) {
      try {
        await this.mcpManager.addServer(config);
        logger.info({ server: config.name }, "MCP server initialized");
      } catch (error) {
        logger.error({ error, server: config.name }, "Failed to initialize MCP server");
      }
    }
  }

  private setupEventHandlers(): void {
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

    this.client.on("message", async (message: AnyMessage) => {
      await this.handleMessage(message);
    });
  }

  async connect(): Promise<void> {
    this.client.connect();
  }

  private async joinSession(sessionId: SessionId): Promise<void> {
    this.sessionId = sessionId;

    const joinMsg = createMessage("session.join", sessionId, this.participantId, {
      participant: createParticipantInfo(
        this.participantId,
        this.agentName,
        "agent",
        ["observer"],
        ["prompt"]
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

  private async handleMessage(message: AnyMessage): Promise<void> {
    try {
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
            } else {
              this.workingDirectory = message.payload.content;
              logger.info({ workingDirectory: this.workingDirectory }, "Session working directory set");
            }
          }
          break;

        default:
          // Log other message types for debugging
          logger.debug({ type: message.type }, "Received message");
          break;
      }
    } catch (error) {
      logger.error({ error, messageType: message.type }, "Error handling message");
    }
  }

  private async handlePrompt(message: AnyMessage): Promise<void> {
    if (message.type !== "prompt.submit") return;
    if (!this.sessionId) return;

    const { content } = message.payload;

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

    logger.info(`[${this.agentName}] Processing prompt: ${content.slice(0, 100)}...`);

    // Store prompt ref for tool result responses
    this.currentPromptRef = message.id;

    // Send thinking start
    const thinkingStartMsg = createMessage(
      "thinking.start",
      this.sessionId,
      this.participantId,
      {
        agent: this.participantId,
        prompt_ref: message.id,
        visible_to: "all",
      }
    );
    this.client.send(thinkingStartMsg);

    // Send response start
    const responseStartMsg = createMessage(
      "response.start",
      this.sessionId,
      this.participantId,
      {
        agent: this.participantId,
        prompt_ref: message.id,
      }
    );
    this.client.send(responseStartMsg);

    try {
      // Add user message to history
      this.conversationHistory.push({
        role: "user",
        content: content
      });

      // Call Claude with tool
      const response = await this.anthropic.messages.create({
        model: this.model,
        max_tokens: 4096,
        messages: this.conversationHistory,
        tools: this.getAllTools()
      });

      // Handle response content
      let fullResponse = "";
      const toolUses: ToolUseBlock[] = [];

      for (const block of response.content) {
        if (block.type === "text") {
          fullResponse += block.text;
          const chunkMsg = createMessage(
            "response.chunk",
            this.sessionId,
            this.participantId,
            {
              text: block.text
            }
          );
          this.client.send(chunkMsg);
        } else if (block.type === "tool_use") {
          toolUses.push(block as ToolUseBlock);
        }
      }

      // Add assistant response to history
      this.conversationHistory.push({
        role: "assistant",
        content: response.content
      });

      // Create batch for tool_use blocks - Anthropic requires ALL tool_results together
      if (toolUses.length > 0) {
        this.createToolBatch(message.id, toolUses);
        await this.proposeToolBatch(toolUses);
      }

      // Send thinking end
      const thinkingEndMsg = createMessage(
        "thinking.end",
        this.sessionId,
        this.participantId,
        {
          summary: `Generated ${fullResponse.length} character response with ${toolUses.length} tool requests`,
        }
      );
      this.client.send(thinkingEndMsg);

      // Send response end
      const responseEndMsg = createMessage(
        "response.end",
        this.sessionId,
        this.participantId,
        {
          finish_reason: response.stop_reason === "tool_use" ? "tool_use" : "complete",
        }
      );
      this.client.send(responseEndMsg);

      logger.info(`[${this.agentName}] Response sent (${fullResponse.length} chars, ${toolUses.length} tools)`);
    } catch (error) {
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

  private async handleToolExecution(message: AnyMessage): Promise<void> {
    if (message.type !== "tool.execute") return;
    if (!this.sessionId) return;

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

    // Retrieve the shell tool proposal
    const proposal = this.toolProposals.get(tool_proposal);
    if (!proposal) {
      logger.warn({ toolProposal: tool_proposal }, "Tool proposal not found");
      return;
    }

    logger.info({
      toolProposal: tool_proposal,
      approvers: approved_by,
      command: `${proposal.command.command} ${proposal.command.args.join(" ")}`
    }, "Executing approved shell command");

    // Store tool execution result
    let toolResult: { success: boolean; output: string; error?: string } | null = null;

    try {
      // Execute the shell command with streaming output
      await this.shellToolHandler.executeCommand(
        tool_proposal,
        proposal.command,
        this.sessionId,
        this.participantId,
        (msg: AnyMessage) => {
          this.client.send(msg);

          // Capture tool.result message
          if (msg.type === "tool.result") {
            const result = msg.payload.result as { exitCode?: number; stdout?: string; stderr?: string } | undefined;
            const stdout = result?.stdout || "";
            const stderr = result?.stderr || "";
            const exitCode = result?.exitCode ?? null;

            toolResult = {
              success: msg.payload.success,
              output: `Exit code: ${exitCode}\n${stdout}${stderr ? `\nStderr: ${stderr}` : ""}`.trim(),
              error: msg.payload.error
            };
          }
        },
        this.workingDirectory ?? undefined
      );
    } catch (error) {
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

  private async handleInterrupt(message: AnyMessage): Promise<void> {
    if (message.type !== "interrupt.raise") return;
    if (!this.sessionId) return;

    logger.info(`[${this.agentName}] Interrupt received: ${message.payload.message}`);

    // Acknowledge interrupt
    const ackMsg = createMessage(
      "interrupt.acknowledge",
      this.sessionId,
      this.participantId,
      {
        interrupt: message.id,
        by: this.participantId,
        action_taken: "acknowledged",
      }
    );
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
  private async handleGateRejection(message: AnyMessage): Promise<void> {
    if (message.type !== "gate.reject" && message.type !== "gate.timeout") return;
    if (!this.sessionId) return;

    // Get the gate/proposal ID
    const proposalId = message.payload.gate;

    // Determine the reason for rejection
    const reason = message.type === "gate.reject"
      ? message.payload.reason
      : `Gate timed out (${message.payload.approvals_received}/${message.payload.approvals_required} approvals)`;

    logger.info({ proposalId, reason }, "Gate rejected, sending error to Claude");

    // Check if this is a shell tool proposal
    const shellProposal = this.toolProposals.get(proposalId);
    if (shellProposal) {
      // Clean up proposal tracking
      this.toolProposals.delete(proposalId);

      // Update batch with rejection error (don't send to Claude yet - wait for all tools)
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
      // Clean up proposal tracking
      this.fileWriteProposals.delete(proposalId);

      // Update batch with rejection error
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
      // Clean up proposal tracking
      this.fileEditProposals.delete(proposalId);

      // Update batch with rejection error
      this.updateBatchResult(proposalId, {
        success: false,
        output: "",
        error: `File edit to "${fileEditProposal.path}" rejected by human: ${reason}`,
      });
      return;
    }

    // Check if this is an MCP tool proposal
    const mcpProposal = this.mcpToolProposals.get(proposalId);
    if (mcpProposal) {
      // Clean up proposal tracking
      this.mcpToolProposals.delete(proposalId);

      // Update batch with rejection error
      this.updateBatchResult(proposalId, {
        success: false,
        output: "",
        error: `Tool "${mcpProposal.tool.mcp_tool.name}" rejected by human: ${reason}`,
      });
      return;
    }

    logger.warn({ proposalId }, "Gate rejection received but no matching proposal found");
  }

  /**
   * Send tool execution result back to Claude to continue the conversation
   */
  private async sendToolResultToClaude(
    proposalId: MessageId,
    result: { success: boolean; output: string; error?: string }
  ): Promise<void> {
    if (!this.sessionId) return;

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
      const thinkingStartMsg = createMessage(
        "thinking.start",
        this.sessionId,
        this.participantId,
        {
          agent: this.participantId,
          prompt_ref: this.currentPromptRef || proposalId,
          visible_to: "all",
        }
      );
      this.client.send(thinkingStartMsg);

      // Send response start
      const responseStartMsg = createMessage(
        "response.start",
        this.sessionId,
        this.participantId,
        {
          agent: this.participantId,
          prompt_ref: this.currentPromptRef || proposalId,
        }
      );
      this.client.send(responseStartMsg);

      // Add tool result to conversation history
      this.conversationHistory.push({
        role: "user",
        content: [
          {
            type: "tool_result",
            tool_use_id: toolUseId,
            content: result.error ? `Error: ${result.error}` : result.output,
            is_error: !result.success
          } as ToolResultBlockParam
        ]
      });

      // Call Claude again with the tool result
      const response = await this.anthropic.messages.create({
        model: this.model,
        max_tokens: 4096,
        messages: this.conversationHistory,
        tools: this.getAllTools()
      });

      // Handle Claude's response to the tool result
      let fullResponse = "";
      const toolUses: ToolUseBlock[] = [];

      for (const block of response.content) {
        if (block.type === "text") {
          fullResponse += block.text;
          const chunkMsg = createMessage(
            "response.chunk",
            this.sessionId,
            this.participantId,
            {
              text: block.text
            }
          );
          this.client.send(chunkMsg);
        } else if (block.type === "tool_use") {
          toolUses.push(block as ToolUseBlock);
        }
      }

      // Add Claude's response to history
      this.conversationHistory.push({
        role: "assistant",
        content: response.content
      });

      // Create batch for follow-up tool requests
      if (toolUses.length > 0) {
        this.createToolBatch(this.currentPromptRef || proposalId, toolUses);
        await this.proposeToolBatch(toolUses);
      }

      // Send thinking end
      const thinkingEndMsg = createMessage(
        "thinking.end",
        this.sessionId,
        this.participantId,
        {
          summary: `Processed tool result and generated ${fullResponse.length} character response with ${toolUses.length} additional tool requests`,
        }
      );
      this.client.send(thinkingEndMsg);

      // Send response end
      const responseEndMsg = createMessage(
        "response.end",
        this.sessionId,
        this.participantId,
        {
          finish_reason: response.stop_reason === "tool_use" ? "tool_use" : "complete",
        }
      );
      this.client.send(responseEndMsg);

      logger.info(`[${this.agentName}] Sent tool result to Claude and received response (${fullResponse.length} chars, ${toolUses.length} additional tools)`);
    } catch (error) {
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
   * Get all available tools (shell + MCP) for Claude API
   */
  private getAllTools(): Tool[] {
    const tools: Tool[] = [];

    // Add shell tool
    tools.push({
      name: "execute_shell_command",
      description: "Execute a shell command with safety controls and approval workflows. Commands are categorized by risk (safe/low/medium/high/critical) and may require human approval.",
      input_schema: {
        type: "object",
        properties: {
          command: {
            type: "string",
            description: "The full shell command to execute (e.g., 'ls -la', 'npm install lodash')"
          }
        },
        required: ["command"]
      }
    });

    // Add file_write tool
    tools.push({
      name: "file_write",
      description: "Write content to a file with safety controls. Files are categorized by risk based on path and type. System directories and sensitive files are blocked. Source code files require approval.",
      input_schema: {
        type: "object",
        properties: {
          path: {
            type: "string",
            description: "The file path to write to (absolute or relative to project root)"
          },
          content: {
            type: "string",
            description: "The content to write to the file"
          },
          create_dirs: {
            type: "boolean",
            description: "Whether to create parent directories if they don't exist (default: false)"
          }
        },
        required: ["path", "content"]
      }
    });

    // Add file_edit tool
    tools.push({
      name: "file_edit",
      description: "Edit a file by replacing text. Finds occurrences of old_text and replaces with new_text. Use occurrence=0 to replace all, or specify which occurrence to replace.",
      input_schema: {
        type: "object",
        properties: {
          path: {
            type: "string",
            description: "The file path to edit (absolute or relative to project root)"
          },
          old_text: {
            type: "string",
            description: "The exact text to find and replace"
          },
          new_text: {
            type: "string",
            description: "The text to replace old_text with"
          },
          occurrence: {
            type: "number",
            description: "Which occurrence to replace: 0 = all occurrences, 1 = first, 2 = second, etc. (default: 0)"
          }
        },
        required: ["path", "old_text", "new_text"]
      }
    });

    // Add git_commit tool following PVP Git Commit Protocol
    tools.push({
      name: "git_commit",
      description: "Create a git commit following the PVP Git Commit Protocol with rich decision context. Use conventional commit types and include session/participant tracking via git trailers.",
      input_schema: {
        type: "object",
        properties: {
          type: {
            type: "string",
            enum: ["feat", "fix", "refactor", "explore", "revert", "docs", "test", "chore", "style"],
            description: "Conventional commit type"
          },
          description: {
            type: "string",
            description: "Short description of the change (imperative mood, lowercase)"
          },
          scope: {
            type: "string",
            description: "Optional scope (e.g., component name, module)"
          },
          body: {
            type: "string",
            description: "Optional longer description explaining what and why"
          },
          confidence: {
            type: "number",
            description: "Confidence level 0.0-1.0 in the decision"
          },
          decision_type: {
            type: "string",
            enum: ["implementation", "architecture", "exploration", "correction", "reversion", "merge-resolution"],
            description: "Type of decision this commit represents"
          }
        },
        required: ["type", "description"]
      }
    });

    // Add MCP tools with namespaced names
    for (const mcpTool of this.mcpManager.getAllTools()) {
      tools.push({
        name: mcpTool.namespaced_name,
        description: mcpTool.mcp_tool.description || `Tool from ${mcpTool.server_name}`,
        input_schema: mcpTool.mcp_tool.inputSchema as Tool["input_schema"]
      });
    }

    return tools;
  }

  public async proposeShellCommand(command: string, toolUseId?: string): Promise<MessageId> {
    if (!this.sessionId) {
      throw new Error("Not connected to a session");
    }

    try {
      const shellCmd = categorizeCommand(command);

      // Set working directory if available from session
      if (this.workingDirectory) {
        shellCmd.cwd = this.workingDirectory;
      }

      const proposalMsg = this.shellToolHandler.proposeCommand(
        command,
        this.sessionId,
        this.participantId
      );

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
    } catch (error) {
      logger.error({ error, command }, "Failed to propose shell command");
      throw error;
    }
  }

  /**
   * Resolve a file path relative to the working directory if not absolute
   */
  private resolveFilePath(filePath: string): string {
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
  public async proposeFileWrite(
    filePath: string,
    content: string,
    createDirs: boolean,
    toolUseId: string
  ): Promise<MessageId> {
    if (!this.sessionId) {
      throw new Error("Not connected to a session");
    }

    // Resolve relative paths to working directory
    const resolvedPath = this.resolveFilePath(filePath);

    try {
      const proposalMsg = this.fileToolHandler.proposeFileWrite(
        resolvedPath,
        content,
        createDirs,
        this.sessionId,
        this.participantId
      );

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
    } catch (error) {
      logger.error({ error, path: filePath }, "Failed to propose file write");
      throw error;
    }
  }

  /**
   * Propose a file edit operation through the PVP gate system
   */
  public async proposeFileEdit(
    filePath: string,
    oldText: string,
    newText: string,
    occurrence: number,
    toolUseId: string
  ): Promise<MessageId> {
    if (!this.sessionId) {
      throw new Error("Not connected to a session");
    }

    // Resolve relative paths to working directory
    const resolvedPath = this.resolveFilePath(filePath);

    try {
      const proposalMsg = this.fileToolHandler.proposeFileEdit(
        resolvedPath,
        oldText,
        newText,
        occurrence,
        this.sessionId,
        this.participantId
      );

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
    } catch (error) {
      logger.error({ error, path: filePath }, "Failed to propose file edit");
      throw error;
    }
  }

  /**
   * Propose a git commit through the PVP gate system
   */
  public async proposeGitCommit(
    input: {
      type: string;
      description: string;
      scope?: string;
      body?: string;
      confidence?: number;
      decision_type?: string;
    },
    toolUseId: string
  ): Promise<MessageId> {
    if (!this.sessionId) {
      throw new Error("Not connected to a session");
    }

    const args: GitCommitArgs = {
      type: input.type as GitCommitArgs["type"],
      description: input.description,
      scope: input.scope,
      body: input.body,
      confidence: input.confidence,
      decisionType: input.decision_type as GitCommitArgs["decisionType"],
    };

    // Build session context for commit
    const context: CommitSessionContext = {
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
    } catch (error) {
      logger.error({ error, type: input.type }, "Failed to propose git commit");
      throw error;
    }
  }

  /**
   * Execute an approved git commit
   */
  private async executeGitCommit(proposalId: MessageId): Promise<void> {
    if (!this.sessionId) return;

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
      let result: { success: boolean; output: string; error?: string } | null = null;

      await this.gitCommitToolHandler.executeCommit(
        proposalId,
        args,
        context,
        (msg: AnyMessage) => {
          this.client.send(msg);

          // Capture tool.result message
          if (msg.type === "tool.result") {
            const payload = msg.payload as { success: boolean; result?: unknown; error?: string };
            result = {
              success: payload.success,
              output: typeof payload.result === "string"
                ? payload.result
                : JSON.stringify(payload.result || {}),
              error: payload.error,
            };
          }
        }
      );

      // Clean up
      this.gitCommitProposals.delete(proposalId);

      // Update batch with result
      if (result) {
        this.updateBatchResult(proposalId, result);
      }
    } catch (error) {
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
   * Propose an MCP tool for execution through the PVP gate system
   */
  public async proposeMCPTool(
    namespacedName: string,
    args: Record<string, unknown>,
    toolUseId: string
  ): Promise<MessageId> {
    if (!this.sessionId) {
      throw new Error("Not connected to a session");
    }

    const mcpTool = this.mcpManager.getTool(namespacedName);
    if (!mcpTool) {
      throw new Error(`MCP tool not found: ${namespacedName}`);
    }

    // Create tool proposal message
    const proposalMsg = createMessage(
      "tool.propose",
      this.sessionId,
      this.participantId,
      {
        tool_name: namespacedName,
        arguments: args,
        agent: this.participantId,
        category: mcpTool.category,
        risk_level: mcpTool.risk_level,
        description: mcpTool.mcp_tool.description || `MCP tool from ${mcpTool.server_name}`,
        requires_approval: mcpTool.requires_approval,
      }
    );

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
  private async executeFileWrite(proposalId: MessageId): Promise<void> {
    if (!this.sessionId) return;

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
      const result = await this.fileToolHandler.executeFileWrite(
        proposalId,
        path,
        content,
        createDirs,
        this.sessionId,
        this.participantId,
        (msg: AnyMessage) => this.client.send(msg)
      );

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
    } catch (error) {
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
  private async executeFileEdit(proposalId: MessageId): Promise<void> {
    if (!this.sessionId) return;

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
      const result = await this.fileToolHandler.executeFileEdit(
        proposalId,
        path,
        oldText,
        newText,
        occurrence,
        this.sessionId,
        this.participantId,
        (msg: AnyMessage) => this.client.send(msg)
      );

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
    } catch (error) {
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
  private async executeMCPTool(proposalId: MessageId): Promise<void> {
    if (!this.sessionId) return;

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
      const resultMsg = createMessage(
        "tool.result",
        this.sessionId,
        this.participantId,
        {
          tool_proposal: proposalId,
          success: result.success,
          result: result.content,
          error: result.error,
          duration_ms,
        }
      );
      this.client.send(resultMsg);

      // Clean up
      this.mcpToolProposals.delete(proposalId);

      // Update batch with result (don't send to Claude yet - wait for all tools)
      this.updateBatchResult(proposalId, {
        success: result.success,
        output: JSON.stringify(result.content, null, 2),
        error: result.error,
      });
    } catch (error) {
      const duration_ms = Date.now() - startTime;
      logger.error({ error, proposalId, tool: tool.namespaced_name }, "MCP tool execution failed");

      // Send error result
      const errorMsg = createMessage(
        "tool.result",
        this.sessionId,
        this.participantId,
        {
          tool_proposal: proposalId,
          success: false,
          error: error instanceof Error ? error.message : "Unknown error",
          duration_ms,
        }
      );
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
  private updateBatchResult(
    proposalId: MessageId,
    result: { success: boolean; output: string; error?: string }
  ): void {
    if (!this.pendingToolBatch) {
      logger.warn({ proposalId }, "No pending tool batch, falling back to immediate send");
      this.sendToolResultToClaude(proposalId, result);
      return;
    }

    // Find the batch entry by proposalId
    let foundToolUseId: string | null = null;
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
    const entry = this.pendingToolBatch.tools.get(foundToolUseId)!;
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
  private async checkAndSendBatchResults(): Promise<void> {
    if (!this.pendingToolBatch || !this.sessionId) return;

    const allResolved = Array.from(this.pendingToolBatch.tools.values()).every(
      entry => entry.status === 'resolved'
    );

    if (!allResolved) {
      const pending = Array.from(this.pendingToolBatch.tools.values()).filter(e => e.status === 'pending');
      logger.debug({ pendingCount: pending.length }, "Batch not complete, waiting for more results");
      return;
    }

    logger.info({ batchSize: this.pendingToolBatch.tools.size }, "All tools resolved, sending batch results to Claude");

    // Build tool_result blocks for all tools
    const toolResults: ToolResultBlockParam[] = [];

    for (const [toolUseId, entry] of this.pendingToolBatch.tools) {
      if (!entry.result) continue;

      toolResults.push({
        type: "tool_result",
        tool_use_id: toolUseId,
        content: entry.result.error ? `Error: ${entry.result.error}` : entry.result.output,
        is_error: !entry.result.success,
      });

      // Clean up tracking maps
      if (entry.proposalId) {
        this.toolUseIdToProposalId.delete(entry.proposalId);
      }
    }

    // Clear the batch
    const promptRef = this.pendingToolBatch.promptRef;
    this.pendingToolBatch = null;

    try {
      // Send thinking start for processing tool results
      const thinkingStartMsg = createMessage(
        "thinking.start",
        this.sessionId,
        this.participantId,
        {
          agent: this.participantId,
          prompt_ref: promptRef,
          visible_to: "all",
        }
      );
      this.client.send(thinkingStartMsg);

      // Send response start
      const responseStartMsg = createMessage(
        "response.start",
        this.sessionId,
        this.participantId,
        {
          agent: this.participantId,
          prompt_ref: promptRef,
        }
      );
      this.client.send(responseStartMsg);

      // Add ALL tool results to conversation history in a single message
      this.conversationHistory.push({
        role: "user",
        content: toolResults,
      });

      // Call Claude again with all tool results
      const response = await this.anthropic.messages.create({
        model: this.model,
        max_tokens: 4096,
        messages: this.conversationHistory,
        tools: this.getAllTools(),
      });

      // Handle Claude's response
      let fullResponse = "";
      const toolUses: ToolUseBlock[] = [];

      for (const block of response.content) {
        if (block.type === "text") {
          fullResponse += block.text;
          const chunkMsg = createMessage(
            "response.chunk",
            this.sessionId,
            this.participantId,
            {
              text: block.text,
            }
          );
          this.client.send(chunkMsg);
        } else if (block.type === "tool_use") {
          toolUses.push(block as ToolUseBlock);
        }
      }

      // Add Claude's response to history
      this.conversationHistory.push({
        role: "assistant",
        content: response.content,
      });

      // Create new batch if Claude requests more tools
      if (toolUses.length > 0) {
        this.createToolBatch(promptRef, toolUses);
        await this.proposeToolBatch(toolUses);
      }

      // Send thinking end
      const thinkingEndMsg = createMessage(
        "thinking.end",
        this.sessionId,
        this.participantId,
        {
          summary: `Processed ${toolResults.length} tool results, generated ${fullResponse.length} char response with ${toolUses.length} additional tool requests`,
        }
      );
      this.client.send(thinkingEndMsg);

      // Send response end
      const responseEndMsg = createMessage(
        "response.end",
        this.sessionId,
        this.participantId,
        {
          finish_reason: response.stop_reason === "tool_use" ? "tool_use" : "complete",
        }
      );
      this.client.send(responseEndMsg);

      logger.info(`[${this.agentName}] Sent ${toolResults.length} tool results to Claude (${fullResponse.length} chars, ${toolUses.length} additional tools)`);
    } catch (error) {
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
  private createToolBatch(promptRef: MessageId, toolUses: ToolUseBlock[]): void {
    this.pendingToolBatch = {
      promptRef,
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
  private async proposeToolBatch(toolUses: ToolUseBlock[]): Promise<void> {
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
          const input = toolUse.input as { command: string };
          if (!input.command) {
            logger.error({ toolUseId: toolUse.id }, "Shell command input missing command field");
            this.markToolFailed(toolUse.id, "Missing command field");
            continue;
          }
          logger.info({ command: input.command, toolUseId: toolUse.id }, "Claude requested shell command execution");
          await this.proposeShellCommand(input.command, toolUse.id);
        } else if (toolUse.name === "file_write") {
          const input = toolUse.input as { path: string; content: string; create_dirs?: boolean };
          if (!input.path || input.content === undefined) {
            logger.error({ toolUseId: toolUse.id, hasPath: !!input.path, hasContent: input.content !== undefined }, "File write input missing required fields");
            this.markToolFailed(toolUse.id, "Missing path or content field");
            continue;
          }
          logger.info({ path: input.path, bytes: input.content.length, toolUseId: toolUse.id }, "Claude requested file write");
          await this.proposeFileWrite(input.path, input.content, input.create_dirs || false, toolUse.id);
        } else if (toolUse.name === "file_edit") {
          const input = toolUse.input as { path: string; old_text: string; new_text: string; occurrence?: number };
          if (!input.path || input.old_text === undefined || input.new_text === undefined) {
            logger.error({ toolUseId: toolUse.id }, "File edit input missing required fields");
            this.markToolFailed(toolUse.id, "Missing required fields");
            continue;
          }
          logger.info({ path: input.path, toolUseId: toolUse.id }, "Claude requested file edit");
          await this.proposeFileEdit(input.path, input.old_text, input.new_text, input.occurrence || 0, toolUse.id);
        } else if (toolUse.name === "git_commit") {
          const input = toolUse.input as {
            type: string;
            description: string;
            scope?: string;
            body?: string;
            confidence?: number;
            decision_type?: string;
          };
          if (!input.type || !input.description) {
            logger.error({ toolUseId: toolUse.id }, "Git commit input missing required fields");
            this.markToolFailed(toolUse.id, "Missing type or description");
            continue;
          }
          logger.info({ type: input.type, description: input.description, toolUseId: toolUse.id }, "Claude requested git commit");
          await this.proposeGitCommit(input, toolUse.id);
        } else if (this.mcpManager.isMCPTool(toolUse.name)) {
          logger.info({ tool: toolUse.name, toolUseId: toolUse.id }, "Claude requested MCP tool execution");
          await this.proposeMCPTool(toolUse.name, toolUse.input as Record<string, unknown>, toolUse.id);
        } else {
          logger.warn({ toolName: toolUse.name, toolUseId: toolUse.id }, "Unknown tool type");
          this.markToolFailed(toolUse.id, `Unknown tool: ${toolUse.name}`);
        }
      } catch (error) {
        logger.error({ error, toolUseId: toolUse.id, toolName: toolUse.name }, "Error proposing tool");
        this.markToolFailed(toolUse.id, `Error proposing tool: ${error}`);
      }
    }
  }

  /**
   * Mark a tool as failed in the pending batch
   */
  private markToolFailed(toolUseId: string, errorMessage: string): void {
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
  private recoverFromCorruptedHistory(): void {
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
        const hasToolUse = msg.content.some(
          (block: { type: string }) => block.type === "tool_use"
        );
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

  async disconnect(): Promise<void> {
    await this.mcpManager.shutdown();
    this.client.close();
  }
}
