import { createMessage } from "../../protocol/messages.js";
import { executeNushellCommand, isNushellCommandBlocked, } from "./nushell-executor.js";
import { snapshotDirectory, detectChanges, createFileChangeMessages, } from "./file-change-detector.js";
/**
 * Creates nushell tool proposal and execution handlers for PVP protocol
 */
export function createNushellToolHandler() {
    return {
        proposeCommand(nuCmd, sessionId, agentId) {
            const blockCheck = isNushellCommandBlocked(nuCmd);
            if (blockCheck.blocked) {
                throw new Error(`Command blocked: ${blockCheck.reason}`);
            }
            // Map internal risk levels to protocol risk levels
            const protocolRiskLevel = nuCmd.riskLevel === "safe"
                ? "low"
                : nuCmd.riskLevel === "critical"
                    ? "critical"
                    : nuCmd.riskLevel;
            return createMessage("tool.propose", sessionId, agentId, {
                tool_name: "nushell",
                arguments: {
                    command: nuCmd.command,
                    raw_output: nuCmd.rawOutput,
                    full_command: nuCmd.command,
                },
                agent: agentId,
                risk_level: protocolRiskLevel,
                description: `Execute nushell command: ${nuCmd.command}`,
                requires_approval: nuCmd.requiresApproval,
                category: "shell_execute",
            });
        },
        async executeCommand(toolProposalId, nuCmd, nuPath, sessionId, agentId, broadcast, workingDir) {
            const startTime = Date.now();
            // Snapshot files before execution to detect changes
            const effectiveWorkDir = workingDir || nuCmd.cwd || process.cwd();
            const beforeSnapshot = await snapshotDirectory(effectiveWorkDir);
            const callbacks = {
                onStdout: (data) => {
                    const outputMsg = createMessage("tool.output", sessionId, agentId, {
                        tool_proposal: toolProposalId,
                        stream: "stdout",
                        text: data,
                        complete: false,
                    });
                    broadcast(outputMsg);
                },
                onStderr: (data) => {
                    const outputMsg = createMessage("tool.output", sessionId, agentId, {
                        tool_proposal: toolProposalId,
                        stream: "stderr",
                        text: data,
                        complete: false,
                    });
                    broadcast(outputMsg);
                },
                onExit: (_code) => {
                    // Handled after executeNushellCommand returns
                },
                onError: (_error) => {
                    // Handled in catch block
                },
            };
            try {
                const result = await executeNushellCommand(nuPath, nuCmd, {}, callbacks);
                // Send completion marker
                const completeMsg = createMessage("tool.output", sessionId, agentId, {
                    tool_proposal: toolProposalId,
                    stream: "stdout",
                    text: "",
                    complete: true,
                });
                broadcast(completeMsg);
                // Send final result with structured data
                const resultMsg = createMessage("tool.result", sessionId, agentId, {
                    tool_proposal: toolProposalId,
                    success: result.exitCode === 0,
                    result: {
                        exitCode: result.exitCode,
                        stdout: result.stdout,
                        stderr: result.stderr,
                        structured: result.structured,
                    },
                    error: result.exitCode !== 0 ? result.stderr || `Process exited with code ${result.exitCode}` : undefined,
                    duration_ms: Date.now() - startTime,
                });
                broadcast(resultMsg);
                // Detect and broadcast file changes
                const changes = await detectChanges(beforeSnapshot, effectiveWorkDir);
                const changeMessages = createFileChangeMessages(changes, sessionId, agentId, `nushell: ${nuCmd.command}`);
                for (const msg of changeMessages) {
                    broadcast(msg);
                }
                return result;
            }
            catch (error) {
                // Send error result
                const resultMsg = createMessage("tool.result", sessionId, agentId, {
                    tool_proposal: toolProposalId,
                    success: false,
                    error: error instanceof Error ? error.message : "Unknown error",
                    duration_ms: Date.now() - startTime,
                });
                broadcast(resultMsg);
                // Still detect file changes even on error
                const changes = await detectChanges(beforeSnapshot, effectiveWorkDir);
                const changeMessages = createFileChangeMessages(changes, sessionId, agentId, `nushell: ${nuCmd.command}`);
                for (const msg of changeMessages) {
                    broadcast(msg);
                }
                throw error;
            }
        },
    };
}
