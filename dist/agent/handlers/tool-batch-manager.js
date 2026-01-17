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
// ===========================================================================
// Tool Batch Manager
// ===========================================================================
/**
 * Manages batching of tool calls for providers that require all results together.
 */
export class ToolBatchManager {
    pendingBatch = null;
    /**
     * Check if there's an active batch.
     */
    hasPendingBatch() {
        return this.pendingBatch !== null;
    }
    /**
     * Get the current batch state (for debugging/inspection).
     */
    getBatchState() {
        return this.pendingBatch;
    }
    /**
     * Start a new tool batch.
     * @param promptRef - Reference to the prompt that triggered these tools
     */
    startBatch(promptRef) {
        if (this.pendingBatch) {
            logger.warn({ existingBatchSize: this.pendingBatch.tools.size }, "Starting new batch while previous batch still pending");
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
    addTool(toolUseId, toolName) {
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
    setProposalId(toolUseId, proposalId) {
        if (!this.pendingBatch)
            return;
        const entry = this.pendingBatch.tools.get(toolUseId);
        if (entry) {
            entry.proposalId = proposalId;
            logger.debug({ toolUseId, proposalId }, "Set proposal ID for tool");
        }
    }
    /**
     * Get the proposal ID for a tool.
     */
    getProposalId(toolUseId) {
        return this.pendingBatch?.tools.get(toolUseId)?.proposalId ?? null;
    }
    /**
     * Mark a tool as rejected (user denied approval).
     * This sets the hadRejection flag which will stop the agent after batch completion.
     */
    markRejected() {
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
    resolveSuccess(toolUseId, result) {
        if (!this.pendingBatch)
            return;
        const entry = this.pendingBatch.tools.get(toolUseId);
        if (entry) {
            entry.status = "resolved";
            entry.result = result;
            logger.info({
                toolUseId,
                success: result.success,
                batchSize: this.pendingBatch.tools.size,
                resolved: this.getResolvedCount(),
            }, "Resolved tool in batch");
        }
    }
    /**
     * Mark a tool as failed with an error.
     * @param toolUseId - Tool invocation ID
     * @param errorMessage - Error description
     */
    resolveFailed(toolUseId, errorMessage) {
        if (!this.pendingBatch)
            return;
        const entry = this.pendingBatch.tools.get(toolUseId);
        if (entry) {
            entry.status = "resolved";
            entry.result = {
                success: false,
                output: "",
                error: errorMessage,
            };
            logger.info({
                toolUseId,
                errorMessage,
                batchSize: this.pendingBatch.tools.size,
                resolved: this.getResolvedCount(),
            }, "Marked tool as failed in batch");
        }
    }
    /**
     * Find a tool entry by its proposal ID.
     * @param proposalId - The approval proposal ID
     * @returns The tool use ID if found
     */
    findByProposalId(proposalId) {
        if (!this.pendingBatch)
            return null;
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
    getTool(toolUseId) {
        return this.pendingBatch?.tools.get(toolUseId);
    }
    /**
     * Get count of resolved tools.
     */
    getResolvedCount() {
        if (!this.pendingBatch)
            return 0;
        return Array.from(this.pendingBatch.tools.values()).filter((e) => e.status === "resolved").length;
    }
    /**
     * Get count of pending tools.
     */
    getPendingCount() {
        if (!this.pendingBatch)
            return 0;
        return Array.from(this.pendingBatch.tools.values()).filter((e) => e.status === "pending").length;
    }
    /**
     * Get total tool count in batch.
     */
    getTotalCount() {
        return this.pendingBatch?.tools.size ?? 0;
    }
    /**
     * Check if all tools in the batch are resolved.
     */
    isComplete() {
        if (!this.pendingBatch)
            return false;
        return Array.from(this.pendingBatch.tools.values()).every((entry) => entry.status === "resolved");
    }
    /**
     * Complete the batch and get the results.
     * Clears the pending batch state.
     * @returns Batch completion result or null if not complete
     */
    completeBatch() {
        if (!this.pendingBatch || !this.isComplete()) {
            return null;
        }
        const results = [];
        const proposalIds = [];
        for (const [toolUseId, entry] of this.pendingBatch.tools) {
            if (!entry.result)
                continue;
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
        const completion = {
            promptRef: this.pendingBatch.promptRef,
            hadRejection: this.pendingBatch.hadRejection,
            results,
        };
        logger.info({
            promptRef: completion.promptRef,
            hadRejection: completion.hadRejection,
            resultCount: results.length,
        }, "Batch completed");
        // Clear the batch
        this.pendingBatch = null;
        return completion;
    }
    /**
     * Clear the current batch (e.g., during error recovery).
     */
    clearBatch() {
        if (this.pendingBatch) {
            logger.info({ batchSize: this.pendingBatch.tools.size }, "Clearing pending tool batch");
            this.pendingBatch = null;
        }
    }
    /**
     * Check if there are pending (unresolved) tools.
     */
    hasPendingTools() {
        if (!this.pendingBatch)
            return false;
        return Array.from(this.pendingBatch.tools.values()).some((e) => e.status === "pending");
    }
}
/**
 * Create a new tool batch manager.
 */
export function createToolBatchManager() {
    return new ToolBatchManager();
}
