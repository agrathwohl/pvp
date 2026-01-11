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

import * as fs from "fs/promises";
import * as path from "path";
import { createMessage } from "../../protocol/messages.js";
import { executeShellCommand, type ShellCommand } from "./shell-executor.js";
import { isPathBlocked } from "./file-executor.js";
import {
  snapshotDirectory,
  detectChanges,
  createFileChangeMessages,
} from "./file-change-detector.js";
import type {
  SessionId,
  ParticipantId,
  MessageId,
  AnyMessage,
  RiskLevel,
} from "../../protocol/types.js";

// Configuration constants
const NOTEBOOK_EXECUTION_TIMEOUT = 300_000; // 5 minutes for long-running notebooks
const NOTEBOOK_MAX_BUFFER = 50 * 1024 * 1024; // 50MB for notebooks with large outputs

// Common venv jupyter paths to check (in order of preference)
const VENV_JUPYTER_PATHS = [
  ".venv/bin/jupyter",
  "venv/bin/jupyter",
  ".venv/Scripts/jupyter.exe",  // Windows
  "venv/Scripts/jupyter.exe",   // Windows
];

// "notebook" = executed .ipynb with outputs (DEFAULT - works with notebook-viewer.tsx)
// "html" | "markdown" | "pdf" = converted standalone files
export type NotebookOutputFormat = "notebook" | "html" | "markdown" | "pdf";

export interface NotebookExecutionResult {
  success: boolean;
  notebookPath: string;
  outputPath?: string;
  outputFormat: NotebookOutputFormat;
  outputContent?: string;  // Executed notebook JSON or converted content
  error?: string;
  executionTime?: number;
}

export interface NotebookToolHandler {
  /**
   * Create a proposal for executing a notebook
   * Requires approval due to arbitrary code execution risk
   */
  proposeNotebookExecute(
    notebookPath: string,
    outputFormat: NotebookOutputFormat,
    sessionId: SessionId,
    agentId: ParticipantId
  ): AnyMessage;

  /**
   * Execute a notebook and convert to specified format
   * Emits context.update with rendered HTML for pvp.codes consumption
   */
  executeNotebook(
    toolProposalId: MessageId,
    notebookPath: string,
    outputFormat: NotebookOutputFormat,
    sessionId: SessionId,
    agentId: ParticipantId,
    broadcast: (msg: AnyMessage) => void,
    workingDir?: string
  ): Promise<NotebookExecutionResult>;
}

/**
 * Validate that the file is a Jupyter notebook
 */
function isNotebookFile(filePath: string): boolean {
  return filePath.endsWith(".ipynb");
}

/**
 * Find the jupyter executable - checks venv paths first, then falls back to system PATH
 */
async function findJupyterExecutable(workingDir: string): Promise<string> {
  for (const venvPath of VENV_JUPYTER_PATHS) {
    const fullPath = path.join(workingDir, venvPath);
    try {
      await fs.access(fullPath, fs.constants.X_OK);
      return fullPath;  // Found executable jupyter in venv
    } catch {
      // Not found or not executable, try next
    }
  }
  // Fall back to system PATH
  return "jupyter";
}

/**
 * Get the output file path based on notebook path and format
 */
function getOutputPath(notebookPath: string, format: NotebookOutputFormat): string {
  if (format === "notebook") {
    // Output executed notebook with _executed suffix to preserve original
    return notebookPath.replace(/\.ipynb$/, "_executed.ipynb");
  }
  const ext = format === "markdown" ? "md" : format;
  return notebookPath.replace(/\.ipynb$/, `.${ext}`);
}

/**
 * Create a ShellCommand for jupyter nbconvert execution
 */
function createNbconvertCommand(
  jupyterPath: string,
  notebookPath: string,
  outputFormat: NotebookOutputFormat,
  outputPath: string,
  workingDir?: string
): ShellCommand {
  const args = [
    "nbconvert",
    "--execute",
    "--to", outputFormat,
    "--allow-errors", // Continue execution even if cells error
  ];

  // For notebook format, specify output filename to avoid overwriting original
  if (outputFormat === "notebook") {
    const outputBasename = path.basename(outputPath, ".ipynb");
    args.push("--output", outputBasename);
  }

  args.push(notebookPath);

  return {
    command: jupyterPath,
    args,
    category: "write",
    riskLevel: "high",
    requiresApproval: true,
    cwd: workingDir,
    timeout: NOTEBOOK_EXECUTION_TIMEOUT,
    maxBuffer: NOTEBOOK_MAX_BUFFER,
  };
}

/**
 * Helper to broadcast error completion and result messages
 * Reduces duplication across error handling paths
 */
function broadcastError(
  toolProposalId: MessageId,
  sessionId: SessionId,
  agentId: ParticipantId,
  broadcast: (msg: AnyMessage) => void,
  errorMessage: string,
  errorDetail: string,
  executionTime: number
): void {
  // Broadcast completion with error
  const completeMsg = createMessage("tool.output", sessionId, agentId, {
    tool_proposal: toolProposalId,
    stream: "stderr" as const,
    text: `\n✗ ${errorMessage}\n`,
    complete: true,
  });
  broadcast(completeMsg);

  // Send error result
  const resultMsg = createMessage("tool.result", sessionId, agentId, {
    tool_proposal: toolProposalId,
    success: false,
    error: errorDetail,
    duration_ms: executionTime,
  });
  broadcast(resultMsg);
}

export function createNotebookToolHandler(): NotebookToolHandler {
  return {
    proposeNotebookExecute(
      notebookPath: string,
      outputFormat: NotebookOutputFormat,
      sessionId: SessionId,
      agentId: ParticipantId
    ): AnyMessage {
      // Validate notebook file extension
      if (!isNotebookFile(notebookPath)) {
        throw new Error(`Invalid notebook file: ${notebookPath}. Must be a .ipynb file.`);
      }

      // Security: Check for path traversal and blocked paths
      const blockCheck = isPathBlocked(notebookPath);
      if (blockCheck.blocked) {
        throw new Error(`Path blocked: ${blockCheck.reason}`);
      }

      const riskLevel: RiskLevel = "high"; // Notebooks execute arbitrary code
      const outputPath = getOutputPath(notebookPath, outputFormat);

      return createMessage("tool.propose", sessionId, agentId, {
        tool_name: "notebook_execute",
        arguments: {
          notebook_path: notebookPath,
          output_format: outputFormat,
          output_path: outputPath,
        },
        agent: agentId,
        risk_level: riskLevel,
        description: `Execute notebook ${path.basename(notebookPath)} and convert to ${outputFormat}`,
        requires_approval: true,
        category: "shell_execute", // Categorized as shell_execute since it runs arbitrary code
      });
    },

    async executeNotebook(
      toolProposalId: MessageId,
      notebookPath: string,
      outputFormat: NotebookOutputFormat,
      sessionId: SessionId,
      agentId: ParticipantId,
      broadcast: (msg: AnyMessage) => void,
      workingDir?: string
    ): Promise<NotebookExecutionResult> {
      const startTime = Date.now();
      const effectiveWorkDir = workingDir || process.cwd();
      const resolvedNotebookPath = path.isAbsolute(notebookPath)
        ? notebookPath
        : path.resolve(effectiveWorkDir, notebookPath);
      const outputPath = getOutputPath(resolvedNotebookPath, outputFormat);

      // Snapshot files before execution to detect changes (like shell-tool.ts)
      const beforeSnapshot = await snapshotDirectory(effectiveWorkDir);

      // Find jupyter executable (check venv first, then system PATH)
      const jupyterPath = await findJupyterExecutable(effectiveWorkDir);

      // Broadcast execution start
      const startMsg = createMessage("tool.output", sessionId, agentId, {
        tool_proposal: toolProposalId,
        stream: "stdout" as const,
        text: `Executing notebook: ${notebookPath}\nUsing jupyter: ${jupyterPath}\nOutput format: ${outputFormat}\n`,
        complete: false,
      });
      broadcast(startMsg);

      // Create the shell command
      const shellCmd = createNbconvertCommand(jupyterPath, resolvedNotebookPath, outputFormat, outputPath, effectiveWorkDir);

      let exitCode: number | null = null;
      let stdout = "";
      let stderr = "";

      try {
        // Execute jupyter nbconvert with streaming
        const result = await executeShellCommand(
          shellCmd,
          {},
          {
            onStdout: (data: string) => {
              stdout += data;
              const outputMsg = createMessage("tool.output", sessionId, agentId, {
                tool_proposal: toolProposalId,
                stream: "stdout" as const,
                text: data,
                complete: false,
              });
              broadcast(outputMsg);
            },
            onStderr: (data: string) => {
              stderr += data;
              const outputMsg = createMessage("tool.output", sessionId, agentId, {
                tool_proposal: toolProposalId,
                stream: "stderr" as const,
                text: data,
                complete: false,
              });
              broadcast(outputMsg);
            },
            onExit: (code: number | null) => {
              exitCode = code;
            },
            onError: (error: Error) => {
              stderr += `\nExecution error: ${error.message}`;
            },
          }
        );

        exitCode = result.exitCode;
        const executionTime = Date.now() - startTime;

        // Detect and broadcast file changes (regardless of success/failure)
        const changes = await detectChanges(beforeSnapshot, effectiveWorkDir);
        const changeMessages = createFileChangeMessages(
          changes,
          sessionId,
          agentId,
          `notebook: ${path.basename(notebookPath)}`
        );
        for (const msg of changeMessages) {
          broadcast(msg);
        }

        // Check if execution succeeded
        if (exitCode !== 0) {
          const errorDetail = `Notebook execution failed with exit code ${exitCode}: ${stderr}`;
          broadcastError(
            toolProposalId, sessionId, agentId, broadcast,
            `Notebook execution failed (exit code ${exitCode})`,
            errorDetail,
            executionTime
          );

          return {
            success: false,
            notebookPath: resolvedNotebookPath,
            outputFormat,
            error: errorDetail,
            executionTime,
          };
        }

        // Read the generated output file
        let outputContent: string | undefined;
        try {
          outputContent = await fs.readFile(outputPath, "utf-8");
        } catch (readError) {
          const error = readError instanceof Error ? readError.message : "Unknown read error";
          const errorDetail = `Failed to read output file: ${error}`;
          broadcastError(
            toolProposalId, sessionId, agentId, broadcast,
            `Failed to read output file: ${outputPath}`,
            errorDetail,
            executionTime
          );

          return {
            success: false,
            notebookPath: resolvedNotebookPath,
            outputFormat,
            error: errorDetail,
            executionTime,
          };
        }

        // Success! Broadcast completion
        const completeMsg = createMessage("tool.output", sessionId, agentId, {
          tool_proposal: toolProposalId,
          stream: "stdout" as const,
          text: `\n✓ Notebook executed successfully\nOutput: ${outputPath} (${outputContent.length} bytes)\n`,
          complete: true,
        });
        broadcast(completeMsg);

        // CRITICAL: Emit context.add with the executed notebook content
        // This allows pvp.codes notebook-viewer.tsx to render the output
        // NOTE: Must use context.add (not context.update) because this creates NEW context
        const isNotebookFormat = outputFormat === "notebook";
        const notebookKey = isNotebookFormat
          ? `notebook:executed:${path.basename(notebookPath)}`  // For notebook-viewer.tsx
          : `notebook:rendered:${path.basename(outputPath)}`;   // For HTML/PDF/MD viewers

        const contextAddContentMsg = createMessage("context.add", sessionId, agentId, {
          key: notebookKey,
          content_type: isNotebookFormat ? "structured" : "file",  // .ipynb is JSON
          content: isNotebookFormat ? JSON.parse(outputContent) : outputContent,
          source: "notebook_execute",
          tags: ["notebook", isNotebookFormat ? "executed" : "rendered", outputFormat],
        });
        broadcast(contextAddContentMsg);

        // Also emit the output file path for reference
        const contextAddPathMsg = createMessage("context.add", sessionId, agentId, {
          key: `notebook:output_path:${path.basename(notebookPath)}`,
          content_type: "text",
          content: outputPath,
          source: "notebook_execute",
          tags: ["notebook", "output_path", outputFormat],
        });
        broadcast(contextAddPathMsg);

        // Send success result
        const resultMsg = createMessage("tool.result", sessionId, agentId, {
          tool_proposal: toolProposalId,
          success: true,
          result: {
            notebookPath: resolvedNotebookPath,
            outputPath,
            outputFormat,
            outputSize: outputContent.length,
            executionTime,
          },
          duration_ms: executionTime,
        });
        broadcast(resultMsg);

        return {
          success: true,
          notebookPath: resolvedNotebookPath,
          outputPath,
          outputFormat,
          outputContent,
          executionTime,
        };

      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : "Unknown error";
        const executionTime = Date.now() - startTime;

        // Still detect file changes even on error
        const changes = await detectChanges(beforeSnapshot, effectiveWorkDir);
        const changeMessages = createFileChangeMessages(
          changes,
          sessionId,
          agentId,
          `notebook: ${path.basename(notebookPath)}`
        );
        for (const msg of changeMessages) {
          broadcast(msg);
        }

        broadcastError(
          toolProposalId, sessionId, agentId, broadcast,
          `Error: ${errorMsg}`,
          errorMsg,
          executionTime
        );

        return {
          success: false,
          notebookPath: resolvedNotebookPath,
          outputFormat,
          error: errorMsg,
          executionTime,
        };
      }
    },
  };
}
