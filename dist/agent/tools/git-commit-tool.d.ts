/**
 * Git Commit Tool - Structured commit creation following PVP Git Commit Protocol
 *
 * Creates git commits with rich PVP decision context including:
 * - Conventional commit types (feat, fix, refactor, etc.)
 * - Session and participant tracking
 * - Confidence levels and decision types
 * - Git trailers for machine parsing
 */
import type { SessionId, ParticipantId, MessageId, AnyMessage } from "../../protocol/types.js";
export type CommitType = "feat" | "fix" | "refactor" | "explore" | "revert" | "docs" | "test" | "chore" | "style";
export type DecisionType = "implementation" | "architecture" | "exploration" | "correction" | "reversion" | "merge-resolution";
export interface CommitParticipant {
    type: "human" | "ai" | "agent";
    identifier: string;
}
export interface GitCommitArgs {
    type: CommitType;
    description: string;
    scope?: string;
    body?: string;
    confidence?: number;
    decisionType?: DecisionType;
    messageRefs?: string[];
}
export interface CommitSessionContext {
    sessionId: SessionId;
    agentId: ParticipantId;
    participants: CommitParticipant[];
    workingDirectory: string;
}
export interface GitCommitToolHandler {
    proposeCommit(args: GitCommitArgs, context: CommitSessionContext): AnyMessage;
    executeCommit(toolProposalId: MessageId, args: GitCommitArgs, context: CommitSessionContext, broadcast: (msg: AnyMessage) => void): Promise<void>;
}
/**
 * Creates git commit tool handler for PVP protocol
 */
export declare function createGitCommitToolHandler(): GitCommitToolHandler;
