/**
 * Tool Handler Type Definitions
 *
 * Defines unified interfaces for all tool handlers in the PVP agent.
 * Tools follow a propose-approve-execute pattern for safety.
 */

import type { MessageId, ParticipantId, SessionId } from "../../protocol/types.js";

// ===========================================================================
// Core Result Types
// ===========================================================================

/**
 * Standard execution result shared across all tool handlers.
 */
export interface ToolExecutionResult {
  success: boolean;
  output?: string;
  error?: string;
  executionTime?: number;
}

/**
 * Proposal result when a tool requests approval.
 */
export interface ToolProposalResult {
  proposalId: MessageId;
  toolName: string;
  description: string;
  riskLevel: ToolRiskLevel;
  requiresApproval: boolean;
}

// ===========================================================================
// Risk Assessment
// ===========================================================================

/**
 * Risk levels for tool operations.
 */
export type ToolRiskLevel = "safe" | "low" | "medium" | "high" | "critical" | "blocked";

/**
 * Category classification for tool operations.
 */
export type ToolCategory =
  | "read-only"
  | "write-safe"
  | "write-dangerous"
  | "system-modify"
  | "network"
  | "destructive";

/**
 * Operation configuration for risk assessment.
 */
export interface ToolOperationConfig {
  category: ToolCategory;
  riskLevel: ToolRiskLevel;
  requiresApproval: boolean;
  timeout?: number;
}

// ===========================================================================
// Handler Context
// ===========================================================================

/**
 * Context provided to tool handlers for execution.
 */
export interface ToolHandlerContext {
  /** Current working directory */
  workingDirectory: string | null;
  /** Current session ID */
  sessionId: SessionId | null;
  /** Participant ID of the agent */
  participantId: ParticipantId;
  /** Whether strict mode is enabled */
  strictMode: boolean;
}

/**
 * Broadcast function type for sending protocol messages.
 */
export type BroadcastFn = (
  messageType: string,
  payload: Record<string, unknown>,
  options?: { ref?: MessageId }
) => Promise<MessageId>;

// ===========================================================================
// Base Tool Handler Interface
// ===========================================================================

/**
 * Base interface that all tool handlers should implement.
 * Each tool handler has at least a propose and execute method.
 */
export interface BaseToolHandler<TArgs, TResult extends ToolExecutionResult = ToolExecutionResult> {
  /**
   * Tool name matching the definition in tool-definitions.ts
   */
  readonly toolName: string;

  /**
   * Execute the tool operation (after approval if required).
   */
  execute(args: TArgs, context: ToolHandlerContext): Promise<TResult>;
}

/**
 * Extended interface for tools that require approval workflow.
 */
export interface ApprovableToolHandler<
  TArgs,
  TResult extends ToolExecutionResult = ToolExecutionResult
> extends BaseToolHandler<TArgs, TResult> {
  /**
   * Check if the operation requires approval.
   */
  requiresApproval(args: TArgs): boolean;

  /**
   * Get risk assessment for the operation.
   */
  assessRisk(args: TArgs): ToolOperationConfig;

  /**
   * Create a proposal for approval.
   */
  createProposal(
    args: TArgs,
    toolUseId: string,
    context: ToolHandlerContext
  ): Promise<ToolProposalResult>;
}

/**
 * Interface for tools that maintain state across the session.
 */
export interface StatefulToolHandler<TState> {
  /**
   * Get current state for persistence.
   */
  getState(): TState;

  /**
   * Restore state from persistence.
   */
  restoreState(state: TState): void;

  /**
   * Serialize state for protocol transmission.
   */
  serializeState(): string;
}

// ===========================================================================
// Tool Registry Types
// ===========================================================================

/**
 * Pending tool information tracked by the agent.
 */
export interface PendingToolInfo {
  toolUseId: string;
  toolName: string;
  proposalId: MessageId | null;
  status: "pending" | "resolved";
  result: ToolExecutionResult | null;
}

/**
 * Tool batch for Anthropic API compliance.
 * All tool_use blocks must have corresponding tool_result in next message.
 */
export interface ToolBatch {
  promptRef: MessageId;
  hadRejection: boolean;
  tools: Map<string, PendingToolInfo>;
}

// ===========================================================================
// Specific Tool Handler Types
// ===========================================================================

/**
 * Shell command execution result.
 */
export interface ShellExecutionResult extends ToolExecutionResult {
  exitCode: number;
  stdout: string;
  stderr: string;
  command: string;
}

/**
 * File operation result.
 */
export interface FileOperationResult extends ToolExecutionResult {
  path: string;
  bytesWritten?: number;
  linesChanged?: number;
}

/**
 * Git commit result.
 */
export interface GitCommitResult extends ToolExecutionResult {
  commitHash?: string;
  branch?: string;
  filesChanged?: number;
}

/**
 * Notebook execution result.
 */
export interface NotebookExecutionResult extends ToolExecutionResult {
  notebookPath: string;
  outputFormat: string;
  outputPath?: string;
  outputContent?: string;
}

/**
 * NPM operation result.
 */
export interface NpmOperationResult extends ToolExecutionResult {
  operation: string;
  stdout: string;
  stderr: string;
  exitCode: number;
}

/**
 * Tasks operation result.
 */
export interface TasksOperationResult extends ToolExecutionResult {
  operation: string;
  result?: unknown;
}
