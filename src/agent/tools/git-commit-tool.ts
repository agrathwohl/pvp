/**
 * Git Commit Tool - Structured commit creation following PVP Git Commit Protocol
 *
 * Creates git commits with rich PVP decision context including:
 * - Conventional commit types (feat, fix, refactor, etc.)
 * - Session and participant tracking
 * - Confidence levels and decision types
 * - Git trailers for machine parsing
 */

import { createMessage } from "../../protocol/messages.js";
import {
  executeShellCommand,
  type ShellCommand,
  type StreamingOutput,
} from "./shell-executor.js";
import type {
  SessionId,
  ParticipantId,
  MessageId,
  AnyMessage,
} from "../../protocol/types.js";

// Commit type prefixes per PVP Git Commit Protocol
export type CommitType =
  | "feat"
  | "fix"
  | "refactor"
  | "explore"
  | "revert"
  | "docs"
  | "test"
  | "chore"
  | "style";

// Decision types for PVP trailers
export type DecisionType =
  | "implementation"
  | "architecture"
  | "exploration"
  | "correction"
  | "reversion"
  | "merge-resolution";

// Participant info for Decision-By trailer
export interface CommitParticipant {
  type: "human" | "ai" | "agent";
  identifier: string;
}

// Git commit arguments
export interface GitCommitArgs {
  type: CommitType;
  description: string;
  scope?: string;
  body?: string;
  confidence?: number; // 0.0-1.0
  decisionType?: DecisionType;
  messageRefs?: string[]; // PVP message IDs related to this commit
}

// Session context provided by agent
export interface CommitSessionContext {
  sessionId: SessionId;
  agentId: ParticipantId;
  participants: CommitParticipant[];
  workingDirectory: string;
}

export interface GitCommitToolHandler {
  proposeCommit(
    args: GitCommitArgs,
    context: CommitSessionContext
  ): AnyMessage;

  executeCommit(
    toolProposalId: MessageId,
    args: GitCommitArgs,
    context: CommitSessionContext,
    broadcast: (msg: AnyMessage) => void
  ): Promise<void>;
}

/**
 * Format a participant for git trailer
 */
function formatParticipant(p: CommitParticipant): string {
  return `${p.type}:${p.identifier}`;
}

/**
 * Build the commit message following PVP Git Commit Protocol
 */
function buildCommitMessage(
  args: GitCommitArgs,
  context: CommitSessionContext
): string {
  const lines: string[] = [];

  // Header: <type>(<scope>): <description> [pvp:<ref>]
  let header = args.scope
    ? `${args.type}(${args.scope}): ${args.description}`
    : `${args.type}: ${args.description}`;

  // Add PVP reference if message refs provided
  if (args.messageRefs && args.messageRefs.length > 0) {
    const ref = args.messageRefs[0].substring(0, 12); // Short ref
    header += ` [pvp:${ref}]`;
  }

  // Truncate header to 72 chars
  if (header.length > 72) {
    header = header.substring(0, 69) + "...";
  }

  lines.push(header);

  // Body (optional)
  if (args.body) {
    lines.push(""); // Blank line after header
    // Wrap body at 72 chars
    const words = args.body.split(" ");
    let currentLine = "";
    for (const word of words) {
      if (currentLine.length + word.length + 1 > 72) {
        lines.push(currentLine);
        currentLine = word;
      } else {
        currentLine = currentLine ? `${currentLine} ${word}` : word;
      }
    }
    if (currentLine) {
      lines.push(currentLine);
    }
  }

  // Confidence in body if provided
  if (args.confidence !== undefined) {
    if (!args.body) lines.push(""); // Blank line if no body
    const level =
      args.confidence >= 0.8 ? "high" : args.confidence >= 0.5 ? "medium" : "low";
    lines.push("");
    lines.push(`Confidence: ${level} (${args.confidence.toFixed(2)})`);
  }

  // Trailers
  lines.push(""); // Blank line before trailers

  // PVP-Session
  lines.push(`PVP-Session: ${context.sessionId}`);

  // PVP-Messages (if any)
  if (args.messageRefs && args.messageRefs.length > 0) {
    lines.push(`PVP-Messages: ${args.messageRefs.join(",")}`);
  }

  // PVP-Confidence
  if (args.confidence !== undefined) {
    lines.push(`PVP-Confidence: ${args.confidence.toFixed(2)}`);
  }

  // PVP-Decision-Type
  if (args.decisionType) {
    lines.push(`PVP-Decision-Type: ${args.decisionType}`);
  }

  // Decision-By (all participants)
  if (context.participants.length > 0) {
    const participants = context.participants.map(formatParticipant).join(",");
    lines.push(`Decision-By: ${participants}`);
  }

  return lines.join("\n");
}

/**
 * Creates git commit tool handler for PVP protocol
 */
export function createGitCommitToolHandler(): GitCommitToolHandler {
  return {
    proposeCommit(args: GitCommitArgs, context: CommitSessionContext): AnyMessage {
      const commitMessage = buildCommitMessage(args, context);

      // Determine risk based on commit type
      const riskLevel =
        args.type === "revert" || args.type === "explore"
          ? "medium"
          : args.type === "feat" || args.type === "fix"
          ? "low"
          : "low";

      return createMessage("tool.propose", context.sessionId, context.agentId, {
        tool_name: "git_commit",
        arguments: {
          type: args.type,
          scope: args.scope,
          description: args.description,
          body: args.body,
          confidence: args.confidence,
          decisionType: args.decisionType,
          messageRefs: args.messageRefs,
          commitMessage, // Pre-built for transparency
        },
        agent: context.agentId,
        risk_level: riskLevel,
        description: `Git commit: ${args.type}${args.scope ? `(${args.scope})` : ""}: ${args.description}`,
        requires_approval: false, // Git commits are low risk
        category: "shell_execute",
      });
    },

    async executeCommit(
      toolProposalId: MessageId,
      args: GitCommitArgs,
      context: CommitSessionContext,
      broadcast: (msg: AnyMessage) => void
    ): Promise<void> {
      const startTime = Date.now();
      let errorMsg: string | undefined;

      const commitMessage = buildCommitMessage(args, context);

      // Build shell command for git commit
      const shellCmd: ShellCommand = {
        command: "git",
        args: ["commit", "-m", commitMessage],
        category: "write",
        riskLevel: "low",
        requiresApproval: false,
        cwd: context.workingDirectory,
      };

      const callbacks: StreamingOutput = {
        onStdout: (data: string) => {
          broadcast(
            createMessage("tool.output", context.sessionId, context.agentId, {
              tool_proposal: toolProposalId,
              stream: "stdout" as const,
              text: data,
              complete: false,
            })
          );
        },

        onStderr: (data: string) => {
          broadcast(
            createMessage("tool.output", context.sessionId, context.agentId, {
              tool_proposal: toolProposalId,
              stream: "stderr" as const,
              text: data,
              complete: false,
            })
          );
        },

        onExit: (code: number | null) => {
          if (code !== 0 && code !== null) {
            errorMsg = `Git commit exited with code ${code}`;
          }
        },

        onError: (error: Error) => {
          errorMsg = error.message;
        },
      };

      try {
        const result = await executeShellCommand(shellCmd, {}, callbacks);

        // Send completion marker
        broadcast(
          createMessage("tool.output", context.sessionId, context.agentId, {
            tool_proposal: toolProposalId,
            stream: "stdout" as const,
            text: "",
            complete: true,
          })
        );

        // Send final result
        broadcast(
          createMessage("tool.result", context.sessionId, context.agentId, {
            tool_proposal: toolProposalId,
            success: result.exitCode === 0,
            result: {
              exitCode: result.exitCode,
              stdout: result.stdout,
              stderr: result.stderr,
              commitMessage,
            },
            error: errorMsg,
            duration_ms: Date.now() - startTime,
          })
        );
      } catch (error) {
        broadcast(
          createMessage("tool.result", context.sessionId, context.agentId, {
            tool_proposal: toolProposalId,
            success: false,
            error: error instanceof Error ? error.message : "Unknown error",
            duration_ms: Date.now() - startTime,
          })
        );
      }
    },
  };
}
