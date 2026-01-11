/**
 * Notebook Tool Handler - PVP protocol integration for Jupyter notebook execution
 *
 * Provides notebook execution and HTML conversion following the
 * shell-tool.ts handler pattern with:
 * - Proposal message creation
 * - Execution with streaming output via jupyter nbconvert
 * - Result broadcasting including context.update with rendered HTML
 * - File change detection for modified notebooks and outputs
 * - Integration with pvp.codes for notebook rendering
 */
import type { SessionId, ParticipantId, MessageId, AnyMessage } from "../../protocol/types.js";
export type NotebookOutputFormat = "notebook" | "html" | "markdown" | "pdf";
export interface NotebookExecutionResult {
    success: boolean;
    notebookPath: string;
    outputPath?: string;
    outputFormat: NotebookOutputFormat;
    outputContent?: string;
    error?: string;
    executionTime?: number;
}
export interface NotebookToolHandler {
    /**
     * Create a proposal for executing a notebook
     * Requires approval due to arbitrary code execution risk
     */
    proposeNotebookExecute(notebookPath: string, outputFormat: NotebookOutputFormat, sessionId: SessionId, agentId: ParticipantId): AnyMessage;
    /**
     * Execute a notebook and convert to specified format
     * Emits context.update with rendered HTML for pvp.codes consumption
     */
    executeNotebook(toolProposalId: MessageId, notebookPath: string, outputFormat: NotebookOutputFormat, sessionId: SessionId, agentId: ParticipantId, broadcast: (msg: AnyMessage) => void, workingDir?: string): Promise<NotebookExecutionResult>;
}
export declare function createNotebookToolHandler(): NotebookToolHandler;
