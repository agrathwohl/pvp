import { type LLMProvider } from "./providers/index.js";
import { type NotebookOutputFormat } from "./tools/notebook-tool.js";
import { type NpmOperation, type PackageManager } from "./tools/npm-tool.js";
import { type TaskOperationArgs } from "./tools/tasks-tool.js";
import { type MCPServerConfig } from "./mcp/index.js";
import type { SessionId, MessageId } from "../protocol/types.js";
export interface ClaudeAgentConfig {
    serverUrl: string;
    sessionId?: SessionId;
    agentName?: string;
    model?: string;
    apiKey?: string;
    /** Local working directory path. If set, ignores server-provided path (for remote connections) */
    localWorkDir?: string;
    /**
     * Strict mode: requires all prompts and tool executions to align with session tasks.
     * When enabled, the agent will validate that work is in pursuit of defined tasks/goals.
     */
    strictMode?: boolean;
    /**
     * LLM provider instance. Defaults to AnthropicProvider if not specified.
     * Enables support for different LLM backends (OpenAI, Ollama, etc.)
     */
    provider?: LLMProvider;
}
export declare class ClaudeAgent {
    private client;
    private anthropic;
    private provider;
    private participantId;
    private sessionId;
    private workingDirectory;
    private localWorkDir;
    private workspaceInitialized;
    private agentName;
    private model;
    private conversationHistory;
    private shellToolHandler;
    private fileToolHandler;
    private gitCommitToolHandler;
    private toolProposals;
    private fileWriteProposals;
    private fileEditProposals;
    private gitCommitProposals;
    private notebookToolHandler;
    private notebookProposals;
    private npmToolHandler;
    private npmProposals;
    private tasksToolHandler;
    private tasksProposals;
    private strictMode;
    private toolUseIdToProposalId;
    private sessionParticipants;
    private currentPromptRef;
    private mcpManager;
    private mcpToolProposals;
    private pendingToolBatch;
    constructor(config: ClaudeAgentConfig);
    /**
     * BLOCKING INITIALIZATION - Must complete before ANY message processing.
     * Creates working directory and initializes git repo if needed.
     */
    private initializeWorkspace;
    /**
     * Initialize MCP servers from configuration
     */
    initializeMCP(configs: MCPServerConfig[]): Promise<void>;
    private setupEventHandlers;
    connect(): Promise<void>;
    private joinSession;
    private handleMessage;
    private handlePrompt;
    private handleToolExecution;
    private handleInterrupt;
    /**
     * Handle gate rejection - send error result back to Claude
     */
    private handleGateRejection;
    /**
     * Send tool execution result back to Claude to continue the conversation
     */
    private sendToolResultToClaude;
    /**
     * Get all available tools (shell + MCP) for Claude API
     */
    private getAllTools;
    proposeShellCommand(command: string, toolUseId?: string): Promise<MessageId>;
    /**
     * Resolve a file path relative to the working directory if not absolute
     */
    private resolveFilePath;
    /**
     * Propose a file write operation through the PVP gate system
     */
    proposeFileWrite(filePath: string, content: string, createDirs: boolean, toolUseId: string): Promise<MessageId>;
    /**
     * Propose a file edit operation through the PVP gate system
     */
    proposeFileEdit(filePath: string, oldText: string, newText: string, occurrence: number, toolUseId: string): Promise<MessageId>;
    /**
     * Propose a git commit through the PVP gate system
     */
    proposeGitCommit(input: {
        type: string;
        description: string;
        scope?: string;
        body?: string;
        confidence?: number;
        decision_type?: string;
    }, toolUseId: string): Promise<MessageId>;
    /**
     * Execute an approved git commit
     */
    private executeGitCommit;
    /**
     * Propose a notebook execution to the session
     */
    proposeNotebookExecute(notebookPath: string, outputFormat?: NotebookOutputFormat, toolUseId?: string): Promise<MessageId>;
    /**
     * Execute a notebook after approval
     */
    private executeNotebook;
    /**
     * Propose an npm operation to the session
     */
    proposeNpmOperation(operation: NpmOperation, args?: string[], packageManager?: PackageManager, toolUseId?: string): Promise<MessageId>;
    /**
     * Execute an npm operation after approval
     */
    private executeNpm;
    /**
     * Get the current session tasks and goals context summary
     * Returns a markdown-formatted string describing the session objective and task status
     */
    getTasksContextSummary(): string;
    /**
     * Handle a new participant joining the session.
     * Notifies the LLM about the new participant so it can respond intelligently.
     */
    private handleParticipantJoined;
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
    private checkMentionRouting;
    /**
     * Check if strict mode is enabled
     */
    isStrictMode(): boolean;
    /**
     * Validate that work aligns with session tasks (for strict mode)
     * Returns validation result with reason
     */
    validateAgainstTasks(): {
        valid: boolean;
        reason: string;
    };
    /**
     * Get strict mode context for system prompt injection
     * Returns context that helps Claude understand and work within strict mode constraints
     */
    getStrictModeContext(): string | null;
    /**
     * Propose a tasks operation for session goal/task management
     */
    proposeTasksOperation(args: TaskOperationArgs, toolUseId?: string): Promise<MessageId>;
    /**
     * Execute an approved tasks operation
     */
    private executeTasks;
    /**
     * Propose an MCP tool for execution through the PVP gate system
     */
    proposeMCPTool(namespacedName: string, args: Record<string, unknown>, toolUseId: string): Promise<MessageId>;
    /**
     * Execute an approved file write operation
     */
    private executeFileWrite;
    /**
     * Execute an approved file edit operation
     */
    private executeFileEdit;
    /**
     * Execute an approved MCP tool
     */
    private executeMCPTool;
    /**
     * Update a tool's result in the pending batch and check if batch is complete
     */
    private updateBatchResult;
    /**
     * Check if all tools in the batch are resolved and send results to Claude
     */
    private checkAndSendBatchResults;
    /**
     * Create a new tool batch for tracking parallel tool_use blocks
     */
    private createToolBatch;
    /**
     * Propose all tools in a batch
     */
    private proposeToolBatch;
    /**
     * Mark a tool as failed in the pending batch
     */
    private markToolFailed;
    /**
     * Recover from corrupted conversation history caused by missing tool_result blocks.
     * This removes the last assistant message if it contains tool_use blocks without
     * corresponding tool_result, and clears any pending tool batches.
     */
    private recoverFromCorruptedHistory;
    disconnect(): Promise<void>;
}
