/**
 * Tool Registry
 *
 * Central registry for tool handlers with dispatch logic.
 * Provides unified routing for tool calls to their respective handlers.
 */

import { logger } from "../../utils/logger.js";
import { TOOL_NAMES, type BuiltinToolName } from "../tools/tool-definitions.js";
import type {
  ToolExecutionResult,
  ToolRiskLevel,
  ToolOperationConfig,
} from "./types.js";

// ===========================================================================
// Tool Input Types
// ===========================================================================

export interface ShellCommandInput {
  command: string;
}

export interface FileWriteInput {
  path: string;
  content: string;
  create_dirs?: boolean;
}

export interface FileEditInput {
  path: string;
  old_text: string;
  new_text: string;
  occurrence?: number;
}

export interface GitCommitInput {
  type: string;
  description: string;
  scope?: string;
  body?: string;
  confidence?: number;
  decision_type?: string;
}

export interface NotebookExecuteInput {
  notebook_path: string;
  output_format?: "notebook" | "html" | "markdown" | "pdf";
}

export interface NpmInput {
  operation: string;
  args?: string[];
  package_manager?: "npm" | "yarn" | "bun" | "pnpm";
}

export interface TasksInput {
  operation: string;
  title?: string;
  description?: string;
  task_id?: string;
  status?: string;
  priority?: string;
  goal?: string;
}

export type ToolInput =
  | ShellCommandInput
  | FileWriteInput
  | FileEditInput
  | GitCommitInput
  | NotebookExecuteInput
  | NpmInput
  | TasksInput
  | Record<string, unknown>;

// ===========================================================================
// Validation
// ===========================================================================

export interface ValidationResult {
  valid: boolean;
  error?: string;
}

/**
 * Validate tool input has required fields.
 */
export function validateToolInput(toolName: string, input: unknown): ValidationResult {
  if (!input) {
    return { valid: false, error: "Tool input was undefined" };
  }

  const data = input as Record<string, unknown>;

  switch (toolName) {
    case TOOL_NAMES.SHELL:
      if (!data.command) {
        return { valid: false, error: "Missing command field" };
      }
      break;

    case TOOL_NAMES.FILE_WRITE:
      if (!data.path || data.content === undefined) {
        return { valid: false, error: "Missing path or content field" };
      }
      break;

    case TOOL_NAMES.FILE_EDIT:
      if (!data.path || data.old_text === undefined || data.new_text === undefined) {
        return { valid: false, error: "Missing required fields (path, old_text, new_text)" };
      }
      break;

    case TOOL_NAMES.GIT_COMMIT:
      if (!data.type || !data.description) {
        return { valid: false, error: "Missing type or description" };
      }
      break;

    case TOOL_NAMES.NOTEBOOK_EXECUTE:
      if (!data.notebook_path) {
        return { valid: false, error: "Missing notebook_path" };
      }
      break;

    case TOOL_NAMES.NPM:
      if (!data.operation) {
        return { valid: false, error: "Missing operation" };
      }
      break;

    case TOOL_NAMES.TASKS:
      if (!data.operation) {
        return { valid: false, error: "Missing operation" };
      }
      break;
  }

  return { valid: true };
}

/**
 * Check if a tool name is a builtin tool.
 */
export function isBuiltinTool(toolName: string): toolName is BuiltinToolName {
  return Object.values(TOOL_NAMES).includes(toolName as BuiltinToolName);
}

// ===========================================================================
// Tool Registry
// ===========================================================================

/**
 * Tool call handler function type.
 * Each handler takes the tool input and toolUseId, returns a promise.
 */
export type ToolCallHandler = (
  input: ToolInput,
  toolUseId: string
) => Promise<void>;

/**
 * MCP tool checker function type.
 */
export type MCPToolChecker = (toolName: string) => boolean;

/**
 * Registry configuration.
 */
export interface ToolRegistryConfig {
  /** Handler for shell commands */
  onShellCommand: (input: ShellCommandInput, toolUseId: string) => Promise<void>;
  /** Handler for file writes */
  onFileWrite: (input: FileWriteInput, toolUseId: string) => Promise<void>;
  /** Handler for file edits */
  onFileEdit: (input: FileEditInput, toolUseId: string) => Promise<void>;
  /** Handler for git commits */
  onGitCommit: (input: GitCommitInput, toolUseId: string) => Promise<void>;
  /** Handler for notebook execution */
  onNotebookExecute: (input: NotebookExecuteInput, toolUseId: string) => Promise<void>;
  /** Handler for npm operations */
  onNpmOperation: (input: NpmInput, toolUseId: string) => Promise<void>;
  /** Handler for tasks operations */
  onTasksOperation: (input: TasksInput, toolUseId: string) => Promise<void>;
  /** Handler for MCP tools */
  onMCPTool: (toolName: string, input: Record<string, unknown>, toolUseId: string) => Promise<void>;
  /** Checker for MCP tool names */
  isMCPTool: MCPToolChecker;
  /** Handler for tool failures */
  onToolFailed: (toolUseId: string, error: string) => void;
}

/**
 * Tool use request from Claude API.
 */
export interface ToolUseRequest {
  id: string;
  name: string;
  input: unknown;
}

/**
 * ToolRegistry manages routing of tool calls to appropriate handlers.
 */
export class ToolRegistry {
  private config: ToolRegistryConfig;

  constructor(config: ToolRegistryConfig) {
    this.config = config;
  }

  /**
   * Dispatch a single tool call to its handler.
   * Handles validation and error handling.
   */
  async dispatch(toolUse: ToolUseRequest): Promise<void> {
    const { id: toolUseId, name: toolName, input } = toolUse;

    try {
      // Validate input
      const validation = validateToolInput(toolName, input);
      if (!validation.valid) {
        logger.error({ toolUseId, toolName, error: validation.error }, "Tool input validation failed");
        this.config.onToolFailed(toolUseId, validation.error || "Validation failed");
        return;
      }

      // Route to appropriate handler
      switch (toolName) {
        case TOOL_NAMES.SHELL: {
          const shellInput = input as ShellCommandInput;
          logger.info({ command: shellInput.command, toolUseId }, "Dispatching shell command");
          await this.config.onShellCommand(shellInput, toolUseId);
          break;
        }

        case TOOL_NAMES.FILE_WRITE: {
          const fileInput = input as FileWriteInput;
          logger.info({ path: fileInput.path, bytes: fileInput.content.length, toolUseId }, "Dispatching file write");
          await this.config.onFileWrite(fileInput, toolUseId);
          break;
        }

        case TOOL_NAMES.FILE_EDIT: {
          const editInput = input as FileEditInput;
          logger.info({ path: editInput.path, toolUseId }, "Dispatching file edit");
          await this.config.onFileEdit(editInput, toolUseId);
          break;
        }

        case TOOL_NAMES.GIT_COMMIT: {
          const gitInput = input as GitCommitInput;
          logger.info({ type: gitInput.type, description: gitInput.description, toolUseId }, "Dispatching git commit");
          await this.config.onGitCommit(gitInput, toolUseId);
          break;
        }

        case TOOL_NAMES.NOTEBOOK_EXECUTE: {
          const nbInput = input as NotebookExecuteInput;
          logger.info({ notebookPath: nbInput.notebook_path, outputFormat: nbInput.output_format || "notebook", toolUseId }, "Dispatching notebook execution");
          await this.config.onNotebookExecute(nbInput, toolUseId);
          break;
        }

        case TOOL_NAMES.NPM: {
          const npmInput = input as NpmInput;
          logger.info({ operation: npmInput.operation, args: npmInput.args, packageManager: npmInput.package_manager, toolUseId }, "Dispatching npm operation");
          await this.config.onNpmOperation(npmInput, toolUseId);
          break;
        }

        case TOOL_NAMES.TASKS: {
          const tasksInput = input as TasksInput;
          logger.info({ operation: tasksInput.operation, toolUseId }, "Dispatching tasks operation");
          await this.config.onTasksOperation(tasksInput, toolUseId);
          break;
        }

        default:
          // Check for MCP tools
          if (this.config.isMCPTool(toolName)) {
            logger.info({ tool: toolName, toolUseId }, "Dispatching MCP tool");
            await this.config.onMCPTool(toolName, input as Record<string, unknown>, toolUseId);
          } else {
            logger.warn({ toolName, toolUseId }, "Unknown tool type");
            this.config.onToolFailed(toolUseId, `Unknown tool: ${toolName}`);
          }
      }
    } catch (error) {
      logger.error({ error, toolUseId, toolName }, "Error dispatching tool");
      this.config.onToolFailed(toolUseId, `Error dispatching tool: ${error}`);
    }
  }

  /**
   * Dispatch multiple tool calls.
   */
  async dispatchAll(toolUses: ToolUseRequest[]): Promise<void> {
    for (const toolUse of toolUses) {
      await this.dispatch(toolUse);
    }
  }
}

/**
 * Create a tool registry with the given configuration.
 */
export function createToolRegistry(config: ToolRegistryConfig): ToolRegistry {
  return new ToolRegistry(config);
}
