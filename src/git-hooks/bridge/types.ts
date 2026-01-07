/**
 * PVP Git Bridge Service - Type Definitions
 * Interfaces for the local daemon that maintains session state
 * and provides API for git hooks to query
 */

import type {
  SessionId,
  ParticipantId,
  MessageId,
  AnyMessage,
  PrimitiveType,
} from "../../protocol/types.js";

// =============================================================================
// CONFIGURATION
// =============================================================================

export interface PvpGitConfig {
  /** Unix socket path for hook communication */
  socket_path: string;

  /** Alternative HTTP port (fallback) */
  http_port: number;

  /** State file path for persistence */
  state_file: string;

  /** Git notes reference for extended metadata */
  notes_ref: string;

  /** Webhooks to trigger on commit */
  webhooks: WebhookConfig[];

  /** Enforcement settings */
  enforcement: EnforcementConfig;

  /** Message filtering for commit context */
  message_filter: MessageFilterConfig;

  /** Auto-summarization settings */
  summarization: SummarizationConfig;
}

export interface WebhookConfig {
  /** Webhook URL */
  url: string;

  /** Events to trigger on */
  events: ("commit" | "push" | "session_end")[];

  /** Optional secret for HMAC signing */
  secret?: string;

  /** Timeout in ms */
  timeout_ms: number;
}

export interface EnforcementConfig {
  /** Require PVP metadata on commits */
  enforce_metadata: boolean;

  /** Minimum PVP coverage percentage for push */
  min_pvp_coverage: number;

  /** Allow push with warning instead of rejection */
  warn_only: boolean;
}

export interface MessageFilterConfig {
  /** Message types to include in commit context */
  include_types: PrimitiveType[];

  /** Message types to exclude */
  exclude_types: PrimitiveType[];

  /** Max messages to include in context */
  max_messages: number;

  /** Max age of messages (seconds) */
  max_age_seconds: number;
}

export interface SummarizationConfig {
  /** Enable AI-powered summarization */
  enabled: boolean;

  /** Max tokens for summary */
  max_tokens: number;

  /** Summarization style */
  style: "brief" | "detailed" | "technical";
}

// =============================================================================
// SESSION STATE
// =============================================================================

export interface GitSessionState {
  /** Current PVP session ID */
  session_id: SessionId | null;

  /** Active participants */
  active_participants: ParticipantInfo[];

  /** Last commit SHA */
  last_commit: string | null;

  /** Messages since last commit */
  messages_since_last_commit: number;

  /** Relevant messages for commit context */
  relevant_messages: CommitContextMessage[];

  /** Tool executions since last commit */
  tool_executions: ToolExecutionSummary[];

  /** Prompt/response pairs since last commit */
  prompts_count: number;

  /** Approvals since last commit */
  approvals_count: number;

  /** Session start time */
  session_started_at: string | null;

  /** Last activity time */
  last_activity_at: string | null;

  /** Generated decision summary */
  decision_summary: string | null;
}

export interface ParticipantInfo {
  id: ParticipantId;
  name: string;
  type: "human" | "agent";
  role: string;
}

export interface CommitContextMessage {
  id: MessageId;
  type: PrimitiveType;
  sender: ParticipantId;
  timestamp: string;
  summary: string;
}

export interface ToolExecutionSummary {
  tool_name: string;
  execution_count: number;
  last_executed: string;
  success_rate: number;
}

// =============================================================================
// BRIDGE API
// =============================================================================

export interface BridgeRequest {
  action: BridgeAction;
  data?: Record<string, unknown>;
}

export type BridgeAction =
  | "get_commit_context"
  | "get_extended_metadata"
  | "get_commits"
  | "commit_created"
  | "session_started"
  | "session_ended"
  | "message_received"
  | "get_status"
  | "reset_context";

export interface BridgeResponse {
  success: boolean;
  data?: CommitContext | ExtendedMetadata | BridgeStatus | RecentCommit[];
  error?: string;
}

export interface CommitContext {
  session_id: SessionId | null;
  last_commit: string | null;
  messages_since_last_commit: number;
  active_participants: string;
  decision_summary: string | null;
  tool_executions: string;
  prompts_count: number;
  approvals_count: number;
}

export interface ExtendedMetadata {
  session_id: SessionId | null;
  session_name: string | null;
  participants: ParticipantInfo[];
  messages: CommitContextMessage[];
  tools: ToolExecutionSummary[];
  context_keys: string[];
  forks: string[];
  gates_processed: number;
  total_token_usage: number;
}

export interface BridgeStatus {
  running: boolean;
  session_active: boolean;
  session_id: SessionId | null;
  uptime_seconds: number;
  messages_processed: number;
  commits_tracked: number;
}

// =============================================================================
// EVENT TYPES
// =============================================================================

export interface GitEvent {
  type: "commit" | "push" | "pull";
  timestamp: string;
  sha: string;
  ref?: string;
  metadata?: Record<string, unknown>;
}

export interface SessionEvent {
  type: "started" | "ended" | "participant_joined" | "participant_left";
  timestamp: string;
  session_id: SessionId;
  data?: Record<string, unknown>;
}

// =============================================================================
// PERSISTENCE
// =============================================================================

export interface PersistentState {
  version: number;
  current_session: GitSessionState | null;
  recent_commits: RecentCommit[];
  config_hash: string;
}

export interface RecentCommit {
  sha: string;
  timestamp: string;
  session_id: SessionId | null;
  had_pvp_metadata: boolean;
  participants: string[];
  message_count: number;
}
