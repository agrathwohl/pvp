/**
 * File Tool Handler - PVP protocol integration for file operations
 *
 * Provides file_write and file_edit tool handlers following the
 * shell-tool.ts handler pattern with:
 * - Proposal message creation
 * - Execution with streaming output
 * - Result broadcasting
 */
import { createMessage } from "../../protocol/messages.js";
import { categorizeFilePath, isPathBlocked, writeFile, editFile, } from "./file-executor.js";
/**
 * Creates file tool handlers for PVP protocol
 */
export function createFileToolHandler() {
    return {
        proposeFileWrite(filePath, content, createDirs, sessionId, agentId) {
            const fileCmd = categorizeFilePath(filePath, "file_write");
            const blockCheck = isPathBlocked(filePath);
            if (blockCheck.blocked) {
                throw new Error(`Path blocked: ${blockCheck.reason}`);
            }
            // Map internal risk levels to protocol risk levels
            const protocolRiskLevel = fileCmd.riskLevel === "safe"
                ? "low"
                : fileCmd.riskLevel === "critical"
                    ? "critical"
                    : fileCmd.riskLevel;
            // Generate description with content preview
            const contentPreview = content.length > 100
                ? `${content.slice(0, 100)}...`
                : content;
            const description = `Write ${content.length} bytes to ${filePath}`;
            return createMessage("tool.propose", sessionId, agentId, {
                tool_name: "file_write",
                arguments: {
                    path: fileCmd.path,
                    content: content,
                    create_dirs: createDirs,
                    content_preview: contentPreview,
                    bytes: content.length,
                },
                agent: agentId,
                risk_level: protocolRiskLevel,
                description,
                requires_approval: fileCmd.requiresApproval,
                category: "file_write",
            });
        },
        async executeFileWrite(toolProposalId, filePath, content, createDirs, sessionId, agentId, broadcast) {
            const startTime = Date.now();
            // Broadcast operation start
            const startMsg = createMessage("tool.output", sessionId, agentId, {
                tool_proposal: toolProposalId,
                stream: "stdout",
                text: `Writing ${content.length} bytes to ${filePath}...\n`,
                complete: false,
            });
            broadcast(startMsg);
            try {
                const result = await writeFile(filePath, content, { createDirs });
                // Broadcast completion
                const completeMsg = createMessage("tool.output", sessionId, agentId, {
                    tool_proposal: toolProposalId,
                    stream: "stdout",
                    text: result.success
                        ? `✓ Successfully wrote ${result.bytesWritten} bytes\n`
                        : `✗ Failed: ${result.error}\n`,
                    complete: true,
                });
                broadcast(completeMsg);
                // Send final result
                const resultMsg = createMessage("tool.result", sessionId, agentId, {
                    tool_proposal: toolProposalId,
                    success: result.success,
                    result: {
                        path: result.path,
                        bytesWritten: result.bytesWritten,
                    },
                    error: result.error,
                    duration_ms: Date.now() - startTime,
                });
                broadcast(resultMsg);
                return result;
            }
            catch (error) {
                const errorMsg = error instanceof Error ? error.message : "Unknown error";
                // Broadcast error
                const errorOutput = createMessage("tool.output", sessionId, agentId, {
                    tool_proposal: toolProposalId,
                    stream: "stderr",
                    text: `Error: ${errorMsg}\n`,
                    complete: true,
                });
                broadcast(errorOutput);
                // Send error result
                const resultMsg = createMessage("tool.result", sessionId, agentId, {
                    tool_proposal: toolProposalId,
                    success: false,
                    error: errorMsg,
                    duration_ms: Date.now() - startTime,
                });
                broadcast(resultMsg);
                return {
                    success: false,
                    path: filePath,
                    error: errorMsg,
                };
            }
        },
        proposeFileEdit(filePath, oldText, newText, occurrence, sessionId, agentId) {
            const fileCmd = categorizeFilePath(filePath, "file_write");
            const blockCheck = isPathBlocked(filePath);
            if (blockCheck.blocked) {
                throw new Error(`Path blocked: ${blockCheck.reason}`);
            }
            // Map internal risk levels to protocol risk levels
            const protocolRiskLevel = fileCmd.riskLevel === "safe"
                ? "low"
                : fileCmd.riskLevel === "critical"
                    ? "critical"
                    : fileCmd.riskLevel;
            // Generate description
            const occurrenceDesc = occurrence === 0 ? "all occurrences" : `occurrence ${occurrence}`;
            const oldPreview = oldText.length > 50 ? `${oldText.slice(0, 50)}...` : oldText;
            const newPreview = newText.length > 50 ? `${newText.slice(0, 50)}...` : newText;
            const description = `Edit ${filePath}: replace ${occurrenceDesc}`;
            return createMessage("tool.propose", sessionId, agentId, {
                tool_name: "file_edit",
                arguments: {
                    path: fileCmd.path,
                    old_text: oldText,
                    new_text: newText,
                    occurrence,
                    old_preview: oldPreview,
                    new_preview: newPreview,
                },
                agent: agentId,
                risk_level: protocolRiskLevel,
                description,
                requires_approval: fileCmd.requiresApproval,
                category: "file_write", // Edits are a form of file_write
            });
        },
        async executeFileEdit(toolProposalId, filePath, oldText, newText, occurrence, sessionId, agentId, broadcast) {
            const startTime = Date.now();
            // Broadcast operation start
            const occurrenceDesc = occurrence === 0 ? "all occurrences" : `occurrence ${occurrence}`;
            const startMsg = createMessage("tool.output", sessionId, agentId, {
                tool_proposal: toolProposalId,
                stream: "stdout",
                text: `Editing ${filePath}: replacing ${occurrenceDesc}...\n`,
                complete: false,
            });
            broadcast(startMsg);
            try {
                const result = await editFile(filePath, oldText, newText, occurrence);
                // Broadcast completion
                const completeMsg = createMessage("tool.output", sessionId, agentId, {
                    tool_proposal: toolProposalId,
                    stream: "stdout",
                    text: result.success
                        ? `✓ Replaced ${result.replacements} of ${result.matchCount} occurrences\n`
                        : `✗ Failed: ${result.error}\n`,
                    complete: true,
                });
                broadcast(completeMsg);
                // Send final result
                const resultMsg = createMessage("tool.result", sessionId, agentId, {
                    tool_proposal: toolProposalId,
                    success: result.success,
                    result: {
                        path: result.path,
                        matchCount: result.matchCount,
                        replacements: result.replacements,
                        bytesWritten: result.bytesWritten,
                    },
                    error: result.error,
                    duration_ms: Date.now() - startTime,
                });
                broadcast(resultMsg);
                return result;
            }
            catch (error) {
                const errorMsg = error instanceof Error ? error.message : "Unknown error";
                // Broadcast error
                const errorOutput = createMessage("tool.output", sessionId, agentId, {
                    tool_proposal: toolProposalId,
                    stream: "stderr",
                    text: `Error: ${errorMsg}\n`,
                    complete: true,
                });
                broadcast(errorOutput);
                // Send error result
                const resultMsg = createMessage("tool.result", sessionId, agentId, {
                    tool_proposal: toolProposalId,
                    success: false,
                    error: errorMsg,
                    duration_ms: Date.now() - startTime,
                });
                broadcast(resultMsg);
                return {
                    success: false,
                    path: filePath,
                    error: errorMsg,
                };
            }
        },
    };
}
