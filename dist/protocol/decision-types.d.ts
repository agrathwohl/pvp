/**
 * PVP Decision Tracking Protocol - Git Integration Types
 *
 * This module extends the Pair Vibecoding Protocol (PVP) to enable
 * git-based decision tracking. It creates a bidirectional mapping between
 * PVP's message-based conversation protocol and git's commit-based
 * version control system.
 *
 * Key Design Principles:
 * 1. Every git commit can link back to the PVP conversation that produced it
 * 2. Decision trees map to git branches, enabling exploration replay
 * 3. Tool executions are captured for auditability and learning
 * 4. Confidence scores enable post-hoc analysis of AI decision quality
 */
import type { MessageId, SessionId, ParticipantId, ForkId, ContentHash, ToolCategory, RiskLevel, MergeStrategy, ConflictResolution } from './types.js';
/** 40-character hexadecimal git commit SHA */
export type GitSha = string & {
    readonly __brand: 'GitSha';
};
/** Git branch name (refs/heads/...) */
export type GitBranchRef = string & {
    readonly __brand: 'GitBranchRef';
};
/** Git tag name (refs/tags/...) */
export type GitTagRef = string & {
    readonly __brand: 'GitTagRef';
};
/** Decision commit identifier - unique within a repository */
export type DecisionCommitId = string & {
    readonly __brand: 'DecisionCommitId';
};
/** Decision tree identifier - links PVP session to git history */
export type DecisionTreeId = string & {
    readonly __brand: 'DecisionTreeId';
};
/** Conversation thread identifier */
export type ConversationThreadId = string & {
    readonly __brand: 'ConversationThreadId';
};
/**
 * Categorizes the type of decision that led to a commit.
 * Maps to conventional commit types with AI-specific additions.
 */
export type DecisionType = 'implementation' | 'refactor' | 'bugfix' | 'exploration' | 'revert' | 'documentation' | 'test' | 'configuration' | 'dependency' | 'optimization';
/**
 * Confidence levels for AI decision-making.
 * Used to track uncertainty and enable post-hoc quality analysis.
 */
export type ConfidenceLevel = 'very_low' | 'low' | 'medium' | 'high' | 'very_high';
/**
 * A DecisionCommit links a git commit to the PVP conversation that produced it.
 *
 * This is the core type for git integration - it captures:
 * - The git commit SHA (the "what")
 * - The PVP messages that led to the commit (the "why")
 * - AI reasoning and alternatives (the "how")
 * - Tool executions (the "proof of work")
 */
export interface DecisionCommit {
    /** Unique identifier for this decision commit */
    id: DecisionCommitId;
    /** Version for schema evolution */
    schema_version: 1;
    /** Timestamp when decision was recorded */
    created_at: string;
    /** The git commit SHA this decision produced */
    git_sha: GitSha;
    /** Branch this commit was made on */
    git_branch: GitBranchRef;
    /** Parent commit SHA(s) - supports merge commits */
    git_parents: GitSha[];
    /** Git author information at commit time */
    git_author: {
        name: string;
        email: string;
        timestamp: string;
    };
    /** Session where this decision was made */
    pvp_session: SessionId;
    /** Fork within the session (if using forks) */
    pvp_fork?: ForkId;
    /** Message IDs that contributed to this decision (causal chain) */
    pvp_messages: MessageId[];
    /** The prompt.submit message that initiated the work */
    initiating_prompt: MessageId;
    /** The response.end message that concluded the work */
    concluding_response?: MessageId;
    /** Human-readable summary of what this commit accomplishes */
    decision_summary: string;
    /** Detailed rationale for the decision */
    decision_rationale?: string;
    /** Category of change */
    decision_type: DecisionType;
    /** Semantic labels for filtering/searching */
    tags?: string[];
    /**
     * Confidence score from 0.0 to 1.0
     * - 0.0-0.2: Very uncertain, exploratory
     * - 0.2-0.4: Low confidence, needs validation
     * - 0.4-0.6: Moderate confidence, standard case
     * - 0.6-0.8: High confidence, well-understood
     * - 0.8-1.0: Very high confidence, routine operation
     */
    confidence_score: number;
    /** Categorical confidence level derived from score */
    confidence_level: ConfidenceLevel;
    /** Factors that contributed to confidence assessment */
    confidence_factors?: ConfidenceFactor[];
    /** Alternative approaches that were considered but not taken */
    alternatives_considered: AlternativeApproach[];
    /** Assumptions made during decision-making */
    assumptions?: Assumption[];
    /** Known risks or potential issues */
    risks?: Risk[];
    /** All tool executions that contributed to this commit */
    tool_executions: ToolExecution[];
    /** Aggregate statistics about tool usage */
    tool_stats?: ToolExecutionStats;
    /** Human approvals collected for this decision */
    approvals?: Approval[];
    /** Automated checks run on this decision */
    automated_checks?: AutomatedCheck[];
    /** Files modified by this commit */
    files_changed: FileChange[];
}
/** Factors that influenced confidence scoring */
export interface ConfidenceFactor {
    factor: string;
    impact: 'positive' | 'negative' | 'neutral';
    weight: number;
    explanation?: string;
}
/** An alternative approach that was considered */
export interface AlternativeApproach {
    description: string;
    reason_rejected: string;
    confidence_if_chosen?: number;
    trade_offs?: string[];
}
/** An assumption made during decision-making */
export interface Assumption {
    assumption: string;
    validation_status: 'validated' | 'unvalidated' | 'invalidated';
    validation_method?: string;
    impact_if_wrong?: string;
}
/** A risk identified during decision-making */
export interface Risk {
    description: string;
    severity: RiskLevel;
    likelihood: 'unlikely' | 'possible' | 'likely' | 'certain';
    mitigation?: string;
    acceptance_rationale?: string;
}
/** Record of a tool execution */
export interface ToolExecution {
    /** Reference to the tool.propose message */
    tool_proposal_ref: MessageId;
    /** Name of the tool executed */
    tool: string;
    /** Tool category for filtering */
    category: ToolCategory;
    /** Input provided to the tool (may be summarized for large inputs) */
    input: string;
    /** Full input hash for verification */
    input_hash?: ContentHash;
    /** Output summary (truncated for large outputs) */
    output_summary: string;
    /** Full output hash for verification */
    output_hash?: ContentHash;
    /** Whether execution succeeded */
    success: boolean;
    /** Error message if failed */
    error?: string;
    /** Execution duration in milliseconds */
    duration_ms: number;
    /** Whether human approval was required */
    required_approval: boolean;
    /** Participants who approved (if approval required) */
    approved_by?: ParticipantId[];
}
/** Aggregate statistics about tool usage in a decision */
export interface ToolExecutionStats {
    total_executions: number;
    successful_executions: number;
    failed_executions: number;
    total_duration_ms: number;
    tools_used: string[];
    categories_used: ToolCategory[];
    approvals_requested: number;
    approvals_granted: number;
}
/** A human approval for a decision */
export interface Approval {
    approver: ParticipantId;
    approved_at: string;
    comment?: string;
    gate_ref?: MessageId;
}
/** An automated check result */
export interface AutomatedCheck {
    check_type: 'lint' | 'typecheck' | 'test' | 'build' | 'security' | 'custom';
    check_name: string;
    passed: boolean;
    output_summary?: string;
    duration_ms?: number;
}
/** Record of a file change in a commit */
export interface FileChange {
    path: string;
    change_type: 'added' | 'modified' | 'deleted' | 'renamed' | 'copied';
    old_path?: string;
    additions: number;
    deletions: number;
    is_binary: boolean;
}
/**
 * A DecisionTree represents the branching decision history of a PVP session.
 *
 * This maps the conceptual relationship between:
 * - PVP sessions -> git repositories (or working directories)
 * - PVP forks -> git branches
 * - PVP messages -> git commits (many-to-one)
 * - PVP merge.execute -> git merge commits
 */
export interface DecisionTree {
    /** Unique identifier for this decision tree */
    id: DecisionTreeId;
    /** Schema version for evolution */
    schema_version: 1;
    /** The PVP session this tree represents */
    pvp_session: SessionId;
    /** Root commit (initial state before any decisions) */
    root_commit: GitSha;
    /** The default/primary branch */
    trunk_branch: GitBranchRef;
    /** All branches in this tree */
    branches: DecisionBranch[];
    /** All merge points in the tree */
    merge_points: DecisionMerge[];
    /** Mapping from PVP forks to git branches */
    fork_branch_map: Map<ForkId, GitBranchRef>;
    /** Mapping from PVP messages to decision commits */
    message_commit_map: Map<MessageId, DecisionCommitId>;
    /** Decision commits in topological order */
    commits: DecisionCommitId[];
    /** Tree statistics */
    stats: DecisionTreeStats;
    /** Tree metadata */
    metadata: {
        created_at: string;
        updated_at: string;
        total_decisions: number;
        active_branches: number;
    };
}
/** A branch in the decision tree */
export interface DecisionBranch {
    /** Git branch reference */
    git_ref: GitBranchRef;
    /** PVP fork this corresponds to (if any) */
    pvp_fork?: ForkId;
    /** Branch display name */
    name: string;
    /** What this branch is exploring */
    purpose: string;
    /** Commit where this branch diverged */
    branch_point: GitSha;
    /** Current head commit */
    head_commit: GitSha;
    /** Branch status */
    status: 'active' | 'merged' | 'abandoned' | 'archived';
    /** Parent branch (the branch this was created from) */
    parent_branch?: GitBranchRef;
    /** Who created this branch */
    created_by: ParticipantId;
    /** When the branch was created */
    created_at: string;
    /** Commits on this branch (excluding inherited from parent) */
    own_commits: GitSha[];
}
/** A merge point in the decision tree */
export interface DecisionMerge {
    /** The merge commit SHA */
    merge_commit: GitSha;
    /** The PVP merge.execute message (if any) */
    pvp_merge_ref?: MessageId;
    /** Source branch that was merged */
    source_branch: GitBranchRef;
    /** Target branch that received the merge */
    target_branch: GitBranchRef;
    /** Merge strategy used */
    strategy: MergeStrategy;
    /** How conflicts were resolved */
    conflict_resolutions?: ConflictResolution[];
    /** Whether the merge was a fast-forward */
    fast_forward: boolean;
    /** Summary of what the merge accomplished */
    merge_summary: string;
    /** Who performed the merge */
    merged_by: ParticipantId;
    /** When the merge occurred */
    merged_at: string;
}
/** Statistics about the decision tree */
export interface DecisionTreeStats {
    total_commits: number;
    total_branches: number;
    total_merges: number;
    active_branches: number;
    average_confidence: number;
    decision_type_distribution: Record<DecisionType, number>;
    total_tool_executions: number;
    total_approvals: number;
    time_span: {
        first_commit: string;
        last_commit: string;
        duration_hours: number;
    };
}
/**
 * A ConversationThread is a serializable, queryable format for storing
 * the conversation that led to a commit.
 *
 * This can be stored in:
 * - Git notes (git notes add -m "..." <sha>)
 * - Commit trailers (PVP-Thread: <base64>)
 * - External storage with git references
 */
export interface ConversationThread {
    /** Unique identifier for this thread */
    id: ConversationThreadId;
    /** Schema version */
    schema_version: 1;
    /** The decision commit this thread belongs to */
    decision_commit: DecisionCommitId;
    /** Git commit this is attached to */
    git_sha: GitSha;
    /** Compact representation of the conversation */
    messages: CompactMessage[];
    /** Participants who contributed to this thread */
    participants: ThreadParticipant[];
    /** Thread metadata for indexing/querying */
    metadata: ThreadMetadata;
    /** Storage format and location */
    storage: ThreadStorage;
}
/** Compact message format for thread storage */
export interface CompactMessage {
    /** Position in thread (0-indexed) */
    index: number;
    /** Original PVP message ID */
    pvp_id: MessageId;
    /** Message timestamp */
    ts: string;
    /** Sender identifier */
    sender: ParticipantId;
    /** Simplified message type */
    type: CompactMessageType;
    /** Message content (truncated for large messages) */
    content: string;
    /** Full content hash for verification */
    content_hash?: ContentHash;
    /** Reference to another message in thread */
    reply_to?: number;
    /** Tool execution summary (for tool messages) */
    tool_summary?: {
        tool: string;
        success: boolean;
        duration_ms: number;
    };
}
/** Simplified message types for compact storage */
export type CompactMessageType = 'prompt' | 'response' | 'thinking' | 'tool' | 'approval' | 'rejection' | 'interrupt' | 'context' | 'system';
/** Participant info for thread storage */
export interface ThreadParticipant {
    id: ParticipantId;
    name: string;
    type: 'human' | 'agent';
    message_count: number;
}
/** Thread metadata for indexing */
export interface ThreadMetadata {
    /** Total message count */
    message_count: number;
    /** Human message count */
    human_messages: number;
    /** Agent message count */
    agent_messages: number;
    /** Tool execution count */
    tool_executions: number;
    /** Total tokens (approximate) */
    estimated_tokens?: number;
    /** Key topics/entities mentioned */
    topics?: string[];
    /** Files discussed in thread */
    files_discussed?: string[];
    /** Thread duration */
    duration_seconds: number;
    /** Start timestamp */
    started_at: string;
    /** End timestamp */
    ended_at: string;
}
/** Storage location and format for thread */
export interface ThreadStorage {
    /** Storage method */
    method: 'git_notes' | 'trailer' | 'external';
    /** For external storage: URI to retrieve full thread */
    external_uri?: string;
    /** Whether thread is compressed */
    compressed: boolean;
    /** Compression algorithm if compressed */
    compression?: 'gzip' | 'zstd' | 'brotli';
    /** Total size in bytes */
    size_bytes: number;
    /** Whether full messages are stored or just summaries */
    detail_level: 'full' | 'summary' | 'minimal';
}
/**
 * Query parameters for searching decision commits.
 * Enables filtering across the decision history.
 */
export interface DecisionQuery {
    /** Filter by session */
    session?: SessionId;
    /** Filter by branch */
    branch?: GitBranchRef;
    /** Filter by decision type */
    decision_types?: DecisionType[];
    /** Filter by confidence range */
    confidence_range?: {
        min: number;
        max: number;
    };
    /** Filter by participant involvement */
    participants?: ParticipantId[];
    /** Filter by time range */
    time_range?: {
        after?: string;
        before?: string;
    };
    /** Filter by tools used */
    tools_used?: string[];
    /** Filter by tags */
    tags?: string[];
    /** Full text search in summaries */
    text_search?: string;
    /** Filter by files changed */
    files_changed?: string[];
    /** Pagination */
    limit?: number;
    offset?: number;
    /** Sort order */
    sort_by?: 'time' | 'confidence' | 'impact';
    sort_order?: 'asc' | 'desc';
}
/**
 * Index entry for fast decision lookup.
 * Stored separately from full decision commits for query performance.
 */
export interface DecisionIndex {
    /** Index identifier */
    id: DecisionCommitId;
    /** Git SHA for direct lookup */
    git_sha: GitSha;
    /** Branch for filtering */
    branch: GitBranchRef;
    /** Decision type for filtering */
    decision_type: DecisionType;
    /** Confidence for range queries */
    confidence_score: number;
    /** Timestamp for time-based queries */
    timestamp: string;
    /** Summary for text search */
    summary: string;
    /** Tags for label filtering */
    tags: string[];
    /** Participants for filtering */
    participants: ParticipantId[];
    /** Files changed for path filtering */
    files: string[];
    /** Tool categories used */
    tool_categories: ToolCategory[];
}
/**
 * Git trailer format for embedding decision references in commits.
 *
 * Example commit message:
 * ```
 * feat: implement user authentication
 *
 * Detailed description here...
 *
 * PVP-Session: ses_abc123
 * PVP-Decision: dec_xyz789
 * PVP-Confidence: 0.75
 * PVP-Type: implementation
 * ```
 */
export interface GitTrailers {
    'PVP-Session': SessionId;
    'PVP-Decision': DecisionCommitId;
    'PVP-Confidence': string;
    'PVP-Type': DecisionType;
    'PVP-Thread'?: string;
    'PVP-Tools'?: string;
    'PVP-Approvers'?: string;
}
/**
 * Git notes namespace for PVP data.
 * Notes are stored under refs/notes/pvp
 */
export interface GitNotesContent {
    /** Full conversation thread (JSON) */
    thread?: ConversationThread;
    /** Full decision commit (JSON) */
    decision?: DecisionCommit;
    /** Additional metadata */
    metadata?: Record<string, unknown>;
}
/** Validate a string is a valid GitSha */
export declare function isGitSha(value: string): value is GitSha;
/** Validate a string is a valid GitBranchRef */
export declare function isGitBranchRef(value: string): value is GitBranchRef;
/** Convert confidence score to confidence level */
export declare function scoreToConfidenceLevel(score: number): ConfidenceLevel;
/** Generate a DecisionCommitId */
export declare function generateDecisionCommitId(): DecisionCommitId;
/** Generate a ConversationThreadId */
export declare function generateConversationThreadId(): ConversationThreadId;
/** Generate a DecisionTreeId */
export declare function generateDecisionTreeId(): DecisionTreeId;
/**
 * Serialize a conversation thread to git-notes compatible format.
 * Uses JSON with optional compression.
 */
export interface SerializationOptions {
    /** Whether to compress output */
    compress?: boolean;
    /** Compression algorithm */
    compression?: 'gzip' | 'zstd' | 'brotli';
    /** Detail level for thread messages */
    detail_level?: 'full' | 'summary' | 'minimal';
    /** Maximum size in bytes (truncates if exceeded) */
    max_size?: number;
    /** Whether to include thinking messages */
    include_thinking?: boolean;
}
/**
 * Deserialization result with metadata about what was recovered.
 */
export interface DeserializationResult<T> {
    /** The deserialized data */
    data: T;
    /** Whether any data was truncated */
    truncated: boolean;
    /** Original size before compression */
    original_size: number;
    /** Schema version of the source */
    source_version: number;
    /** Any warnings during deserialization */
    warnings?: string[];
}
