import { createMessage } from "../../protocol/messages.js";
import { categorizeCommand, executeShellCommand, isCommandBlocked, } from "./shell-executor.js";
/**
 * Creates shell tool proposal messages for PVP protocol
 */
export function createShellToolHandler() {
    return {
        proposeCommand(command, sessionId, agentId) {
            const shellCmd = categorizeCommand(command);
            const blockCheck = isCommandBlocked(shellCmd);
            if (blockCheck.blocked) {
                throw new Error(`Command blocked: ${blockCheck.reason}`);
            }
            // Map internal risk levels to protocol risk levels
            const protocolRiskLevel = shellCmd.riskLevel === "safe"
                ? "low"
                : shellCmd.riskLevel === "critical"
                    ? "critical"
                    : shellCmd.riskLevel;
            return createMessage("tool.propose", sessionId, agentId, {
                tool_name: "shell",
                arguments: {
                    command: shellCmd.command,
                    args: shellCmd.args,
                    full_command: command,
                },
                agent: agentId,
                risk_level: protocolRiskLevel,
                description: `Execute shell command: ${command}`,
                requires_approval: shellCmd.requiresApproval,
                category: "shell_execute",
            });
        },
        async executeCommand(toolProposalId, shellCmd, sessionId, agentId, broadcast) {
            const startTime = Date.now();
            let success = false;
            let errorMsg;
            const callbacks = {
                onStdout: (data) => {
                    // Stream stdout to all participants
                    const outputMsg = createMessage("tool.output", sessionId, agentId, {
                        tool_proposal: toolProposalId,
                        stream: "stdout",
                        text: data,
                        complete: false,
                    });
                    broadcast(outputMsg);
                },
                onStderr: (data) => {
                    // Stream stderr to all participants
                    const outputMsg = createMessage("tool.output", sessionId, agentId, {
                        tool_proposal: toolProposalId,
                        stream: "stderr",
                        text: data,
                        complete: false,
                    });
                    broadcast(outputMsg);
                },
                onExit: (code) => {
                    success = code === 0;
                    if (code !== 0 && code !== null) {
                        errorMsg = `Process exited with code ${code}`;
                    }
                },
                onError: (error) => {
                    success = false;
                    errorMsg = error.message;
                },
            };
            try {
                const result = await executeShellCommand(shellCmd, {}, callbacks);
                // Send completion marker
                const completeMsg = createMessage("tool.output", sessionId, agentId, {
                    tool_proposal: toolProposalId,
                    stream: "stdout",
                    text: "",
                    complete: true,
                });
                broadcast(completeMsg);
                // Send final result
                const resultMsg = createMessage("tool.result", sessionId, agentId, {
                    tool_proposal: toolProposalId,
                    success: result.exitCode === 0,
                    result: {
                        exitCode: result.exitCode,
                        stdout: result.stdout,
                        stderr: result.stderr,
                    },
                    error: errorMsg,
                    duration_ms: Date.now() - startTime,
                });
                broadcast(resultMsg);
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
            }
        },
    };
}
