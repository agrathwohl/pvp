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

import { logger } from "../../utils/logger.js";
import type { MessageId } from "../../protocol/types.js";
import type { ToolExecutionResult } from "./types.js";

// ===========================================================================
// Types
// ===========================================================================

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

// ===========================================================================
// Tool Batch Manager
// ===========================================================================

/**
 * Manages batching of tool calls for providers that require all results together.
 */
export class ToolBatchManager {
  private pendingBatch: BatchState | null = null;

  /**
   * Check if there's an active batch.
   */
  hasPendingBatch(): boolean {
    return this.pendingBatch !== null;
  }

  /**
   * Get the current batch state (for debugging/inspection).
   */
  getBatchState(): BatchState | null {
    return this.pendingBatch;
  }

  /**
   * Start a new tool batch.
   * @param promptRef - Reference to the prompt that triggered these tools
   */
  startBatch(promptRef: MessageId): void {
    if (this.pendingBatch) {
      logger.warn(
        { existingBatchSize: this.pendingBatch.tools.size },
        "Starting new batch while previous batch still pending"
      );
    }

    this.pendingBatch = {
      promptRef,
      hadRejection: false,
      tools: new Map(),
    };

    logger.debug({ promptRef }, "Started new tool batch");
  }

  /**
   * Add a tool to the current batch.
   * @param toolUseId - Unique ID for this tool invocation
   * @param toolName - Name of the tool
   */
  addTool(toolUseId: string, toolName: string): void {
    if (!this.pendingBatch) {
      logger.error({ toolUseId, toolName }, "Attempted to add tool without active batch");
      return;
    }

    this.pendingBatch.tools.set(toolUseId, {
      toolUseId,
      toolName,
      proposalId: null,
      status: "pending",
      result: null,
    });

    logger.debug({ toolUseId, toolName, batchSize: this.pendingBatch.tools.size }, "Added tool to batch");
  }

  /**
   * Set the proposal ID for a tool (when approval is needed).
   * @param toolUseId - Tool invocation ID
   * @param proposalId - ID of the approval proposal
   */
  setProposalId(toolUseId: string, proposalId: MessageId): void {
    if (!this.pendingBatch) return;

    const entry = this.pendingBatch.tools.get(toolUseId);
    if (entry) {
      entry.proposalId = proposalId;
      logger.debug({ toolUseId, proposalId }, "Set proposal ID for tool");
    }
  }

  /**
   * Get the proposal ID for a tool.
   */
  getProposalId(toolUseId: string): MessageId | null {
    return this.pendingBatch?.tools.get(toolUseId)?.proposalId ?? null;
  }

  /**
   * Mark a tool as rejected (user denied approval).
   * This sets the hadRejection flag which will stop the agent after batch completion.
   */
  markRejected(): void {
    if (this.pendingBatch) {
      this.pendingBatch.hadRejection = true;
      logger.info("Marked batch as having rejection");
    }
  }

  /**
   * Resolve a tool with its result.
   * @param toolUseId - Tool invocation ID
   * @param result - Execution result
   */
  resolveSuccess(toolUseId: string, result: ToolExecutionResult): void {
    if (!this.pendingBatch) return;

    const entry = this.pendingBatch.tools.get(toolUseId);
    if (entry) {
      entry.status = "resolved";
      entry.result = result;

      logger.info(
        {
          toolUseId,
          success: result.success,
          batchSize: this.pendingBatch.tools.size,
          resolved: this.getResolvedCount(),
        },
        "Resolved tool in batch"
      );
    }
  }

  /**
   * Mark a tool as failed with an error.
   * @param toolUseId - Tool invocation ID
   * @param errorMessage - Error description
   */
  resolveFailed(toolUseId: string, errorMessage: string): void {
    if (!this.pendingBatch) return;

    const entry = this.pendingBatch.tools.get(toolUseId);
    if (entry) {
      entry.status = "resolved";
      entry.result = {
        success: false,
        output: "",
        error: errorMessage,
      };

      logger.info(
        {
          toolUseId,
          errorMessage,
          batchSize: this.pendingBatch.tools.size,
          resolved: this.getResolvedCount(),
        },
        "Marked tool as failed in batch"
      );
    }
  }

  /**
   * Find a tool entry by its proposal ID.
   * @param proposalId - The approval proposal ID
   * @returns The tool use ID if found
   */
  findByProposalId(proposalId: MessageId): string | null {
    if (!this.pendingBatch) return null;

    for (const [toolUseId, entry] of this.pendingBatch.tools) {
      if (entry.proposalId === proposalId) {
        return toolUseId;
      }
    }
    return null;
  }

  /**
   * Get a tool entry by tool use ID.
   */
  getTool(toolUseId: string): PendingTool | undefined {
    return this.pendingBatch?.tools.get(toolUseId);
  }

  /**
   * Get count of resolved tools.
   */
  getResolvedCount(): number {
    if (!this.pendingBatch) return 0;
    return Array.from(this.pendingBatch.tools.values()).filter(
      (e) => e.status === "resolved"
    ).length;
  }

  /**
   * Get count of pending tools.
   */
  getPendingCount(): number {
    if (!this.pendingBatch) return 0;
    return Array.from(this.pendingBatch.tools.values()).filter(
      (e) => e.status === "pending"
    ).length;
  }

  /**
   * Get total tool count in batch.
   */
  getTotalCount(): number {
    return this.pendingBatch?.tools.size ?? 0;
  }

  /**
   * Check if all tools in the batch are resolved.
   */
  isComplete(): boolean {
    if (!this.pendingBatch) return false;
    return Array.from(this.pendingBatch.tools.values()).every(
      (entry) => entry.status === "resolved"
    );
  }

  /**
   * Complete the batch and get the results.
   * Clears the pending batch state.
   * @returns Batch completion result or null if not complete
   */
  completeBatch(): BatchCompletionResult | null {
    if (!this.pendingBatch || !this.isComplete()) {
      return null;
    }

    const results: ToolResultBlock[] = [];
    const proposalIds: MessageId[] = [];

    for (const [toolUseId, entry] of this.pendingBatch.tools) {
      if (!entry.result) continue;

      results.push({
        toolUseId,
        content: entry.result.error
          ? `Error: ${entry.result.error}`
          : entry.result.output || "",
        isError: !entry.result.success,
      });

      if (entry.proposalId) {
        proposalIds.push(entry.proposalId);
      }
    }

    const completion: BatchCompletionResult = {
      promptRef: this.pendingBatch.promptRef,
      hadRejection: this.pendingBatch.hadRejection,
      results,
    };

    logger.info(
      {
        promptRef: completion.promptRef,
        hadRejection: completion.hadRejection,
        resultCount: results.length,
      },
      "Batch completed"
    );

    // Clear the batch
    this.pendingBatch = null;

    return completion;
  }

  /**
   * Clear the current batch (e.g., during error recovery).
   */
  clearBatch(): void {
    if (this.pendingBatch) {
      logger.info(
        { batchSize: this.pendingBatch.tools.size },
        "Clearing pending tool batch"
      );
      this.pendingBatch = null;
    }
  }

  /**
   * Check if there are pending (unresolved) tools.
   */
  hasPendingTools(): boolean {
    if (!this.pendingBatch) return false;
    return Array.from(this.pendingBatch.tools.values()).some(
      (e) => e.status === "pending"
    );
  }
}

/**
 * Create a new tool batch manager.
 */
export function createToolBatchManager(): ToolBatchManager {
  return new ToolBatchManager();
}
