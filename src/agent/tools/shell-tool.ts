import { createMessage } from "../../protocol/messages.js";
import {
  categorizeCommand,
  executeShellCommand,
  isCommandBlocked,
  type ShellCommand,
  type StreamingOutput,
} from "./shell-executor.js";
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
} from "../../protocol/types.js";

export interface ShellToolHandler {
  proposeCommand(
    command: string,
    sessionId: SessionId,
    agentId: ParticipantId
  ): AnyMessage;

  executeCommand(
    toolProposalId: MessageId,
    shellCmd: ShellCommand,
    sessionId: SessionId,
    agentId: ParticipantId,
    broadcast: (msg: AnyMessage) => void,
    workingDir?: string
  ): Promise<void>;
}

/**
 * Creates shell tool proposal messages for PVP protocol
 */
export function createShellToolHandler(): ShellToolHandler {
  return {
    proposeCommand(command: string, sessionId: SessionId, agentId: ParticipantId): AnyMessage {
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

    async executeCommand(
      toolProposalId: MessageId,
      shellCmd: ShellCommand,
      sessionId: SessionId,
      agentId: ParticipantId,
      broadcast: (msg: AnyMessage) => void,
      workingDir?: string
    ): Promise<void> {
      const startTime = Date.now();
      let success = false;
      let errorMsg: string | undefined;

      // Snapshot files before execution to detect changes
      const effectiveWorkDir = workingDir || shellCmd.cwd || process.cwd();
      const beforeSnapshot = await snapshotDirectory(effectiveWorkDir);

      const callbacks: StreamingOutput = {
        onStdout: (data: string) => {
          // Stream stdout to all participants
          const outputMsg = createMessage("tool.output", sessionId, agentId, {
            tool_proposal: toolProposalId,
            stream: "stdout" as const,
            text: data,
            complete: false,
          });
          broadcast(outputMsg);
        },

        onStderr: (data: string) => {
          // Stream stderr to all participants
          const outputMsg = createMessage("tool.output", sessionId, agentId, {
            tool_proposal: toolProposalId,
            stream: "stderr" as const,
            text: data,
            complete: false,
          });
          broadcast(outputMsg);
        },

        onExit: (code: number | null) => {
          success = code === 0;
          if (code !== 0 && code !== null) {
            errorMsg = `Process exited with code ${code}`;
          }
        },

        onError: (error: Error) => {
          success = false;
          errorMsg = error.message;
        },
      };

      try {
        const result = await executeShellCommand(shellCmd, {}, callbacks);

        // Send completion marker
        const completeMsg = createMessage("tool.output", sessionId, agentId, {
          tool_proposal: toolProposalId,
          stream: "stdout" as const,
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

        // Detect and broadcast file changes (regardless of success/failure)
        const changes = await detectChanges(beforeSnapshot, effectiveWorkDir);
        const changeMessages = createFileChangeMessages(
          changes,
          sessionId,
          agentId,
          `shell: ${shellCmd.command}`
        );
        for (const msg of changeMessages) {
          broadcast(msg);
        }

      } catch (error) {
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
        const changeMessages = createFileChangeMessages(
          changes,
          sessionId,
          agentId,
          `shell: ${shellCmd.command}`
        );
        for (const msg of changeMessages) {
          broadcast(msg);
        }
      }
    },
  };
}
