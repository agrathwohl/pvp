/**
 * Tool Registry
 *
 * Central registry for tool handlers with dispatch logic.
 * Provides unified routing for tool calls to their respective handlers.
 */
import { type BuiltinToolName } from "../tools/tool-definitions.js";
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
export type ToolInput = ShellCommandInput | FileWriteInput | FileEditInput | GitCommitInput | NotebookExecuteInput | NpmInput | TasksInput | Record<string, unknown>;
export interface ValidationResult {
    valid: boolean;
    error?: string;
}
/**
 * Validate tool input has required fields with proper types.
 */
export declare function validateToolInput(toolName: string, input: unknown): ValidationResult;
/**
 * Check if a tool name is a builtin tool.
 */
export declare function isBuiltinTool(toolName: string): toolName is BuiltinToolName;
/**
 * Tool call handler function type.
 * Each handler takes the tool input and toolUseId, returns a promise.
 */
export type ToolCallHandler = (input: ToolInput, toolUseId: string) => Promise<void>;
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
export declare class ToolRegistry {
    private config;
    constructor(config: ToolRegistryConfig);
    /**
     * Dispatch a single tool call to its handler.
     * Handles validation and error handling.
     */
    dispatch(toolUse: ToolUseRequest): Promise<void>;
    /**
     * Dispatch multiple tool calls.
     */
    dispatchAll(toolUses: ToolUseRequest[]): Promise<void>;
}
/**
 * Create a tool registry with the given configuration.
 */
export declare function createToolRegistry(config: ToolRegistryConfig): ToolRegistry;
