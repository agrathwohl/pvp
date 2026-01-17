/**
 * Tool Batch Manager
 *
 * Manages tool batching for providers that require all tool results
 * to be sent together (like Anthropic).
 *
 * The Anthropic API requires that ALL tool_use blocks from an assistant
 * message have corresponding tool_result blocks in the next user message.
 * This manager tracks pending tools and ensures batch completion.
 */
import type { MessageId } from "../../protocol/types.js";
import type { ToolExecutionResult } from "./types.js";
/**
 * Information about a pending tool in the batch.
 */
export interface PendingTool {
    toolUseId: string;
    toolName: string;
    proposalId: MessageId | null;
    status: "pending" | "resolved";
    result: ToolExecutionResult | null;
}
/**
 * Result block for sending to LLM.
 */
export interface ToolResultBlock {
    toolUseId: string;
    content: string;
    isError: boolean;
}
/**
 * Batch state snapshot.
 */
export interface BatchState {
    promptRef: MessageId;
    hadRejection: boolean;
    tools: Map<string, PendingTool>;
}
/**
 * Batch completion result.
 */
export interface BatchCompletionResult {
    promptRef: MessageId;
    hadRejection: boolean;
    results: ToolResultBlock[];
}
/**
 * Manages batching of tool calls for providers that require all results together.
 */
export declare class ToolBatchManager {
    private pendingBatch;
    /**
     * Check if there's an active batch.
     */
    hasPendingBatch(): boolean;
    /**
     * Get the current batch state (for debugging/inspection).
     */
    getBatchState(): BatchState | null;
    /**
     * Start a new tool batch.
     * @param promptRef - Reference to the prompt that triggered these tools
     */
    startBatch(promptRef: MessageId): void;
    /**
     * Add a tool to the current batch.
     * @param toolUseId - Unique ID for this tool invocation
     * @param toolName - Name of the tool
     */
    addTool(toolUseId: string, toolName: string): void;
    /**
     * Set the proposal ID for a tool (when approval is needed).
     * @param toolUseId - Tool invocation ID
     * @param proposalId - ID of the approval proposal
     */
    setProposalId(toolUseId: string, proposalId: MessageId): void;
    /**
     * Get the proposal ID for a tool.
     */
    getProposalId(toolUseId: string): MessageId | null;
    /**
     * Mark a tool as rejected (user denied approval).
     * This sets the hadRejection flag which will stop the agent after batch completion.
     */
    markRejected(): void;
    /**
     * Resolve a tool with its result.
     * @param toolUseId - Tool invocation ID
     * @param result - Execution result
     */
    resolveSuccess(toolUseId: string, result: ToolExecutionResult): void;
    /**
     * Mark a tool as failed with an error.
     * @param toolUseId - Tool invocation ID
     * @param errorMessage - Error description
     */
    resolveFailed(toolUseId: string, errorMessage: string): void;
    /**
     * Find a tool entry by its proposal ID.
     * @param proposalId - The approval proposal ID
     * @returns The tool use ID if found
     */
    findByProposalId(proposalId: MessageId): string | null;
    /**
     * Get a tool entry by tool use ID.
     */
    getTool(toolUseId: string): PendingTool | undefined;
    /**
     * Get count of resolved tools.
     */
    getResolvedCount(): number;
    /**
     * Get count of pending tools.
     */
    getPendingCount(): number;
    /**
     * Get total tool count in batch.
     */
    getTotalCount(): number;
    /**
     * Check if all tools in the batch are resolved.
     */
    isComplete(): boolean;
    /**
     * Complete the batch and get the results.
     * Clears the pending batch state.
     * @returns Batch completion result or null if not complete
     */
    completeBatch(): BatchCompletionResult | null;
    /**
     * Clear the current batch (e.g., during error recovery).
     */
    clearBatch(): void;
    /**
     * Check if there are pending (unresolved) tools.
     */
    hasPendingTools(): boolean;
}
/**
 * Create a new tool batch manager.
 */
export declare function createToolBatchManager(): ToolBatchManager;
