/**
 * Tool Handlers Module
 *
 * Exports handler interfaces and types for PVP agent tools.
 */

export type {
  // Core result types
  ToolExecutionResult,
  ToolProposalResult,

  // Risk assessment
  ToolRiskLevel,
  ToolCategory,
  ToolOperationConfig,

  // Handler context
  ToolHandlerContext,
  BroadcastFn,

  // Base interfaces
  BaseToolHandler,
  ApprovableToolHandler,
  StatefulToolHandler,

  // Registry types
  PendingToolInfo,
  ToolBatch,

  // Specific result types
  ShellExecutionResult,
  FileOperationResult,
  GitCommitResult,
  NotebookExecutionResult,
  NpmOperationResult,
  TasksOperationResult,
} from "./types.js";

// Tool Registry
export {
  ToolRegistry,
  createToolRegistry,
  validateToolInput,
  isBuiltinTool,
  type ToolRegistryConfig,
  type ToolUseRequest,
  type ToolCallHandler,
  type MCPToolChecker,
  type ShellCommandInput,
  type FileWriteInput,
  type FileEditInput,
  type GitCommitInput,
  type NotebookExecuteInput,
  type NpmInput,
  type TasksInput,
  type ToolInput,
  type ValidationResult,
} from "./tool-registry.js";

// Tool Batch Manager
export {
  ToolBatchManager,
  createToolBatchManager,
  type PendingTool,
  type ToolResultBlock,
  type BatchState,
  type BatchCompletionResult,
} from "./tool-batch-manager.js";
