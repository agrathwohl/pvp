/**
 * Tool Registry
 *
 * Central registry for tool handlers with dispatch logic.
 * Provides unified routing for tool calls to their respective handlers.
 */
import { logger } from "../../utils/logger.js";
import { TOOL_NAMES } from "../tools/tool-definitions.js";
/**
 * Validate tool input has required fields.
 */
export function validateToolInput(toolName, input) {
    if (!input) {
        return { valid: false, error: "Tool input was undefined" };
    }
    const data = input;
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
export function isBuiltinTool(toolName) {
    return Object.values(TOOL_NAMES).includes(toolName);
}
/**
 * ToolRegistry manages routing of tool calls to appropriate handlers.
 */
export class ToolRegistry {
    config;
    constructor(config) {
        this.config = config;
    }
    /**
     * Dispatch a single tool call to its handler.
     * Handles validation and error handling.
     */
    async dispatch(toolUse) {
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
                    const shellInput = input;
                    logger.info({ command: shellInput.command, toolUseId }, "Dispatching shell command");
                    await this.config.onShellCommand(shellInput, toolUseId);
                    break;
                }
                case TOOL_NAMES.FILE_WRITE: {
                    const fileInput = input;
                    logger.info({ path: fileInput.path, bytes: fileInput.content.length, toolUseId }, "Dispatching file write");
                    await this.config.onFileWrite(fileInput, toolUseId);
                    break;
                }
                case TOOL_NAMES.FILE_EDIT: {
                    const editInput = input;
                    logger.info({ path: editInput.path, toolUseId }, "Dispatching file edit");
                    await this.config.onFileEdit(editInput, toolUseId);
                    break;
                }
                case TOOL_NAMES.GIT_COMMIT: {
                    const gitInput = input;
                    logger.info({ type: gitInput.type, description: gitInput.description, toolUseId }, "Dispatching git commit");
                    await this.config.onGitCommit(gitInput, toolUseId);
                    break;
                }
                case TOOL_NAMES.NOTEBOOK_EXECUTE: {
                    const nbInput = input;
                    logger.info({ notebookPath: nbInput.notebook_path, outputFormat: nbInput.output_format || "notebook", toolUseId }, "Dispatching notebook execution");
                    await this.config.onNotebookExecute(nbInput, toolUseId);
                    break;
                }
                case TOOL_NAMES.NPM: {
                    const npmInput = input;
                    logger.info({ operation: npmInput.operation, args: npmInput.args, packageManager: npmInput.package_manager, toolUseId }, "Dispatching npm operation");
                    await this.config.onNpmOperation(npmInput, toolUseId);
                    break;
                }
                case TOOL_NAMES.TASKS: {
                    const tasksInput = input;
                    logger.info({ operation: tasksInput.operation, toolUseId }, "Dispatching tasks operation");
                    await this.config.onTasksOperation(tasksInput, toolUseId);
                    break;
                }
                default:
                    // Check for MCP tools
                    if (this.config.isMCPTool(toolName)) {
                        logger.info({ tool: toolName, toolUseId }, "Dispatching MCP tool");
                        await this.config.onMCPTool(toolName, input, toolUseId);
                    }
                    else {
                        logger.warn({ toolName, toolUseId }, "Unknown tool type");
                        this.config.onToolFailed(toolUseId, `Unknown tool: ${toolName}`);
                    }
            }
        }
        catch (error) {
            logger.error({ error, toolUseId, toolName }, "Error dispatching tool");
            this.config.onToolFailed(toolUseId, `Error dispatching tool: ${error}`);
        }
    }
    /**
     * Dispatch multiple tool calls.
     */
    async dispatchAll(toolUses) {
        for (const toolUse of toolUses) {
            await this.dispatch(toolUse);
        }
    }
}
/**
 * Create a tool registry with the given configuration.
 */
export function createToolRegistry(config) {
    return new ToolRegistry(config);
}
