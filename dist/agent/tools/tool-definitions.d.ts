/**
 * Tool Definitions for PVP Agent
 *
 * Static tool definitions for all built-in tools. These schemas define
 * the interface Claude uses to invoke tools with proper parameters.
 */
import type { ToolDefinition } from "../providers/types.js";
export declare const SHELL_TOOL_DEFINITION: ToolDefinition;
export declare const FILE_WRITE_TOOL_DEFINITION: ToolDefinition;
export declare const FILE_EDIT_TOOL_DEFINITION: ToolDefinition;
export declare const GIT_COMMIT_TOOL_DEFINITION: ToolDefinition;
export declare const NOTEBOOK_EXECUTE_TOOL_DEFINITION: ToolDefinition;
export declare const NPM_TOOL_DEFINITION: ToolDefinition;
export declare const TASKS_TOOL_DEFINITION: ToolDefinition;
/**
 * All built-in tool definitions.
 * MCP tools are added dynamically by the agent.
 */
export declare const BUILTIN_TOOL_DEFINITIONS: ToolDefinition[];
/**
 * Tool names for quick lookup
 */
export declare const TOOL_NAMES: {
    readonly SHELL: "execute_shell_command";
    readonly FILE_WRITE: "file_write";
    readonly FILE_EDIT: "file_edit";
    readonly GIT_COMMIT: "git_commit";
    readonly NOTEBOOK_EXECUTE: "notebook_execute";
    readonly NPM: "npm";
    readonly TASKS: "tasks";
};
export type BuiltinToolName = typeof TOOL_NAMES[keyof typeof TOOL_NAMES];
