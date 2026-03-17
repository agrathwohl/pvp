import { createMessage } from "../../protocol/messages.js";
import {
  categorizeNushellCommand,
  executeNushellCommand,
  isNushellCommandBlocked,
  type NushellCommand,
  type NushellResult,
  type StreamingOutput,
} from "./nushell-executor.js";
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

export interface NushellToolHandler {
  proposeCommand(
    nuCmd: NushellCommand,
    sessionId: SessionId,
    agentId: ParticipantId
  ): AnyMessage;

  executeCommand(
    toolProposalId: MessageId,
    nuCmd: NushellCommand,
    nuPath: string,
    sessionId: SessionId,
    agentId: ParticipantId,
    broadcast: (msg: AnyMessage) => void,
    workingDir?: string
  ): Promise<NushellResult>;
}

/**
 * Creates nushell tool proposal and execution handlers for PVP protocol
 */
export function createNushellToolHandler(): NushellToolHandler {
  return {
    proposeCommand(
      nuCmd: NushellCommand,
      sessionId: SessionId,
      agentId: ParticipantId
    ): AnyMessage {
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

    async executeCommand(
      toolProposalId: MessageId,
      nuCmd: NushellCommand,
      nuPath: string,
      sessionId: SessionId,
      agentId: ParticipantId,
      broadcast: (msg: AnyMessage) => void,
      workingDir?: string
    ): Promise<NushellResult> {
      const startTime = Date.now();

      // Snapshot files before execution to detect changes
      const effectiveWorkDir = workingDir || nuCmd.cwd || process.cwd();
      const beforeSnapshot = await snapshotDirectory(effectiveWorkDir);

      const callbacks: StreamingOutput = {
        onStdout: (data: string) => {
          const outputMsg = createMessage("tool.output", sessionId, agentId, {
            tool_proposal: toolProposalId,
            stream: "stdout" as const,
            text: data,
            complete: false,
          });
          broadcast(outputMsg);
        },

        onStderr: (data: string) => {
          const outputMsg = createMessage("tool.output", sessionId, agentId, {
            tool_proposal: toolProposalId,
            stream: "stderr" as const,
            text: data,
            complete: false,
          });
          broadcast(outputMsg);
        },

        onExit: (_code: number | null) => {
          // Handled after executeNushellCommand returns
        },

        onError: (_error: Error) => {
          // Handled in catch block
        },
      };

      try {
        const result = await executeNushellCommand(nuPath, nuCmd, {}, callbacks);

        // Send completion marker
        const completeMsg = createMessage("tool.output", sessionId, agentId, {
          tool_proposal: toolProposalId,
          stream: "stdout" as const,
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
        const changeMessages = createFileChangeMessages(
          changes,
          sessionId,
          agentId,
          `nushell: ${nuCmd.command}`
        );
        for (const msg of changeMessages) {
          broadcast(msg);
        }

        return result;

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
          `nushell: ${nuCmd.command}`
        );
        for (const msg of changeMessages) {
          broadcast(msg);
        }

        throw error;
      }
    },
  };
}
