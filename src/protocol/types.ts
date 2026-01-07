/**
 * Pair Vibecoding Protocol (PVP) - Type Definitions
 * Version: 1.0.0-draft
 */

// =============================================================================
// CORE IDENTIFIERS
// =============================================================================

export type ParticipantId = string;
export type SessionId = string;
export type MessageId = string;
export type ForkId = string;
export type ContentHash = string;

// =============================================================================
// MESSAGE ENVELOPE
// =============================================================================

export type MessageEnvelope<T extends PrimitiveType = PrimitiveType> = {
  v: 1;
  id: MessageId;
  ts: string;
  session: SessionId;
  sender: ParticipantId;
  type: T;
  ref?: MessageId;
  seq?: number;
  causal_refs?: MessageId[];
  fork?: ForkId;
  payload: PayloadFor<T>;
};

// =============================================================================
// PRIMITIVE TYPES
// =============================================================================

export type PrimitiveType =
  | "session.create"
  | "session.join"
  | "session.leave"
  | "session.end"
  | "session.config_update"
  | "participant.announce"
  | "participant.role_change"
  | "heartbeat.ping"
  | "heartbeat.pong"
  | "presence.update"
  | "context.add"
  | "context.update"
  | "context.remove"
  | "secret.share"
  | "secret.revoke"
  | "prompt.draft"
  | "prompt.submit"
  | "prompt.amend"
  | "thinking.start"
  | "thinking.chunk"
  | "thinking.end"
  | "response.start"
  | "response.chunk"
  | "response.end"
  | "tool.propose"
  | "tool.approve"
  | "tool.reject"
  | "tool.execute"
  | "tool.output"
  | "tool.result"
  | "gate.request"
  | "gate.approve"
  | "gate.reject"
  | "gate.timeout"
  | "interrupt.raise"
  | "interrupt.acknowledge"
  | "fork.create"
  | "fork.switch"
  | "merge.propose"
  | "merge.execute"
  | "error";

// =============================================================================
// PAYLOAD TYPE MAPPING
// =============================================================================

export type PayloadFor<T extends PrimitiveType> =
  T extends "session.create" ? SessionCreatePayload :
  T extends "session.join" ? SessionJoinPayload :
  T extends "session.leave" ? SessionLeavePayload :
  T extends "session.end" ? SessionEndPayload :
  T extends "session.config_update" ? SessionConfigUpdatePayload :
  T extends "participant.announce" ? ParticipantAnnouncePayload :
  T extends "participant.role_change" ? ParticipantRoleChangePayload :
  T extends "heartbeat.ping" ? HeartbeatPingPayload :
  T extends "heartbeat.pong" ? HeartbeatPongPayload :
  T extends "presence.update" ? PresenceUpdatePayload :
  T extends "context.add" ? ContextAddPayload :
  T extends "context.update" ? ContextUpdatePayload :
  T extends "context.remove" ? ContextRemovePayload :
  T extends "secret.share" ? SecretSharePayload :
  T extends "secret.revoke" ? SecretRevokePayload :
  T extends "prompt.draft" ? PromptDraftPayload :
  T extends "prompt.submit" ? PromptSubmitPayload :
  T extends "prompt.amend" ? PromptAmendPayload :
  T extends "thinking.start" ? ThinkingStartPayload :
  T extends "thinking.chunk" ? ThinkingChunkPayload :
  T extends "thinking.end" ? ThinkingEndPayload :
  T extends "response.start" ? ResponseStartPayload :
  T extends "response.chunk" ? ResponseChunkPayload :
  T extends "response.end" ? ResponseEndPayload :
  T extends "tool.propose" ? ToolProposePayload :
  T extends "tool.approve" ? ToolApprovePayload :
  T extends "tool.reject" ? ToolRejectPayload :
  T extends "tool.execute" ? ToolExecutePayload :
  T extends "tool.output" ? ToolOutputPayload :
  T extends "tool.result" ? ToolResultPayload :
  T extends "gate.request" ? GateRequestPayload :
  T extends "gate.approve" ? GateApprovePayload :
  T extends "gate.reject" ? GateRejectPayload :
  T extends "gate.timeout" ? GateTimeoutPayload :
  T extends "interrupt.raise" ? InterruptRaisePayload :
  T extends "interrupt.acknowledge" ? InterruptAcknowledgePayload :
  T extends "fork.create" ? ForkCreatePayload :
  T extends "fork.switch" ? ForkSwitchPayload :
  T extends "merge.propose" ? MergeProposePayload :
  T extends "merge.execute" ? MergeExecutePayload :
  T extends "error" ? ErrorPayload :
  never;

// =============================================================================
// SESSION PAYLOADS
// =============================================================================

export type SessionCreatePayload = {
  name?: string;
  config: SessionConfig;
};

export type SessionConfig = {
  require_approval_for: ToolCategory[];
  default_gate_quorum: QuorumRule;
  allow_forks: boolean;
  max_participants: number;
  ordering_mode: "causal" | "total";
  on_participant_timeout: "wait" | "skip" | "pause_session";
  heartbeat_interval_seconds: number;
  idle_timeout_seconds: number;
  away_timeout_seconds: number;
};

export type ToolCategory =
  | "file_read"
  | "file_write"
  | "file_delete"
  | "shell_execute"
  | "network_request"
  | "deploy"
  | "database"
  | "secret_access"
  | "external_api"
  | "all";

export type SessionJoinPayload = {
  participant: ParticipantAnnouncePayload;
  token?: string;
  supported_versions: number[];
};

export type SessionLeavePayload = {
  reason?: string;
};

export type SessionEndPayload = {
  reason: string;
  final_state: "completed" | "aborted" | "timeout";
};

export type SessionConfigUpdatePayload = {
  changes: Partial<SessionConfig>;
  reason: string;
};

// =============================================================================
// PARTICIPANT PAYLOADS
// =============================================================================

export type ParticipantAnnouncePayload = {
  id: ParticipantId;
  name: string;
  type: "human" | "agent";
  roles: Role[];
  capabilities?: Capability[];
  transport: TransportType;
  metadata?: Record<string, unknown>;
};

export type Role =
  | "driver"
  | "navigator"
  | "adversary"
  | "observer"
  | "approver"
  | "admin";

export type Capability =
  | "prompt"
  | "approve"
  | "interrupt"
  | "fork"
  | "add_context"
  | "manage_participants"
  | "end_session";

export type TransportType =
  | "websocket"
  | "mcp"
  | "t140"
  | "http"
  | "stdio";

export type ParticipantRoleChangePayload = {
  participant: ParticipantId;
  old_roles: Role[];
  new_roles: Role[];
  changed_by: ParticipantId;
  reason?: string;
};

// =============================================================================
// PRESENCE & HEARTBEAT PAYLOADS
// =============================================================================

export type HeartbeatPingPayload = Record<string, never>;

export type HeartbeatPongPayload = Record<string, never>;

export type PresenceUpdatePayload = {
  participant: ParticipantId;
  status: PresenceStatus;
  last_active: string;
};

export type PresenceStatus =
  | "active"
  | "idle"
  | "away"
  | "disconnected";

// =============================================================================
// CONTEXT PAYLOADS
// =============================================================================

export type ContextAddPayload = {
  key: string;
  content_type: ContextContentType;
  content?: string | object;
  content_ref?: ContentRef;
  visible_to?: ParticipantId[];
  source?: string;
  tags?: string[];
};

export type ContextContentType =
  | "text"
  | "file"
  | "reference"
  | "structured"
  | "image"
  | "audio_transcript";

export type ContentRef = {
  hash: ContentHash;
  size_bytes: number;
  mime_type: string;
  storage: "inline" | "local" | "s3" | "ipfs";
  uri?: string;
};

export type ContextUpdatePayload = {
  key: string;
  diff?: string;
  new_content?: string | object;
  new_content_ref?: ContentRef;
  reason: string;
};

export type ContextRemovePayload = {
  key: string;
  reason: string;
};

// =============================================================================
// SECRET PAYLOADS
// =============================================================================

export type SecretSharePayload = {
  key: string;
  scope: ParticipantId[];
  expires_at?: string;
  value_ref: string;
  secret_type?: "api_key" | "database_url" | "token" | "credential" | "other";
};

export type SecretRevokePayload = {
  key: string;
  reason: string;
};

// =============================================================================
// PROMPT PAYLOADS
// =============================================================================

export type PromptDraftPayload = {
  content: string;
  target_agent?: ParticipantId;
  contributors: ParticipantId[];
};

export type PromptSubmitPayload = {
  content: string;
  target_agent: ParticipantId;
  contributors: ParticipantId[];
  context_keys: string[];
  config?: PromptConfig;
};

export type PromptConfig = {
  temperature?: number;
  max_tokens?: number;
  tools_allowed?: string[];
  model?: string;
  provider_params?: Record<string, unknown>;
};

export type PromptAmendPayload = {
  original_prompt: MessageId;
  amendment: string;
  reason: string;
};

// =============================================================================
// THINKING PAYLOADS
// =============================================================================

export type ThinkingStartPayload = {
  agent: ParticipantId;
  prompt_ref: MessageId;
  visible_to: ParticipantId[] | "all" | "approvers_only";
};

export type ThinkingChunkPayload = {
  text: string;
};

export type ThinkingEndPayload = {
  summary?: string;
  duration_ms?: number;
};

// =============================================================================
// RESPONSE PAYLOADS
// =============================================================================

export type ResponseStartPayload = {
  agent: ParticipantId;
  prompt_ref: MessageId;
};

export type ResponseChunkPayload = {
  text: string;
};

export type ResponseEndPayload = {
  finish_reason: FinishReason;
  usage?: UsageStats;
};

export type FinishReason =
  | "complete"
  | "interrupted"
  | "error"
  | "max_tokens"
  | "tool_use";

export type UsageStats = {
  input_tokens: number;
  output_tokens: number;
  thinking_tokens?: number;
  cost_usd?: number;
  model?: string;
  latency_ms?: number;
};

// =============================================================================
// TOOL PAYLOADS
// =============================================================================

export type ToolProposePayload = {
  tool_name: string;
  arguments: Record<string, unknown>;
  agent: ParticipantId;
  risk_level: RiskLevel;
  description: string;
  requires_approval: boolean;
  suggested_approvers?: ParticipantId[];
  category: ToolCategory;
};

export type RiskLevel =
  | "low"
  | "medium"
  | "high"
  | "critical";

export type ToolApprovePayload = {
  tool_proposal: MessageId;
  approver: ParticipantId;
  comment?: string;
};

export type ToolRejectPayload = {
  tool_proposal: MessageId;
  rejector: ParticipantId;
  reason: string;
  suggestion?: string;
};

export type ToolExecutePayload = {
  tool_proposal: MessageId;
  approved_by: ParticipantId[];
};

export type ToolOutputPayload = {
  tool_proposal: MessageId;
  stream: "stdout" | "stderr";
  text: string;
  complete: boolean;
};

export type ToolResultPayload = {
  tool_proposal: MessageId;
  success: boolean;
  result?: unknown;
  error?: string;
  duration_ms: number;
};

// =============================================================================
// GATE PAYLOADS
// =============================================================================

export type GateRequestPayload = {
  action_type: GateActionType;
  action_ref: MessageId;
  quorum: QuorumRule;
  timeout_seconds: number;
  message: string;
};

export type GateActionType =
  | "tool"
  | "deploy"
  | "prompt"
  | "context_change"
  | "session_config"
  | "participant_add"
  | "fork"
  | "merge";

export type QuorumRule =
  | { type: "any"; count: number }
  | { type: "all" }
  | { type: "role"; role: Role; count: number }
  | { type: "specific"; participants: ParticipantId[] }
  | { type: "majority" };

export type GateApprovePayload = {
  gate: MessageId;
  approver: ParticipantId;
  comment?: string;
};

export type GateRejectPayload = {
  gate: MessageId;
  rejector: ParticipantId;
  reason: string;
};

export type GateTimeoutPayload = {
  gate: MessageId;
  approvals_received: number;
  approvals_required: number;
  resolution: "rejected" | "auto_approved" | "escalated";
};

// =============================================================================
// INTERRUPT PAYLOADS
// =============================================================================

export type InterruptRaisePayload = {
  target?: ParticipantId;
  urgency: InterruptUrgency;
  message: string;
  inject_context?: string;
  inject_context_ref?: ContentRef;
};

export type InterruptUrgency =
  | "pause"
  | "stop"
  | "emergency";

export type InterruptAcknowledgePayload = {
  interrupt: MessageId;
  by: ParticipantId;
  action_taken: "paused" | "stopped" | "acknowledged" | "ignored";
  ignore_reason?: string;
};

// =============================================================================
// FORK & MERGE PAYLOADS
// =============================================================================

export type ForkCreatePayload = {
  name: string;
  from_point: MessageId;
  reason: string;
  participants: ParticipantId[];
  copy_context: boolean;
};

export type ForkSwitchPayload = {
  target_fork: ForkId;
};

export type MergeProposePayload = {
  source_fork: ForkId;
  target_fork: ForkId;
  strategy: MergeStrategy;
  summary: string;
};

export type MergeStrategy =
  | "replace"
  | "append"
  | "interleave"
  | "manual";

export type MergeExecutePayload = {
  merge_proposal: MessageId;
  resolved_conflicts?: ConflictResolution[];
};

export type ConflictResolution = {
  conflict_id: string;
  resolution: "use_source" | "use_target" | "custom";
  custom_value?: unknown;
};

// =============================================================================
// ERROR PAYLOAD
// =============================================================================

export type ErrorPayload = {
  code: ErrorCode;
  message: string;
  recoverable: boolean;
  details?: Record<string, unknown>;
  related_to?: MessageId;
};

export type ErrorCode =
  | "INVALID_MESSAGE"
  | "UNAUTHORIZED"
  | "SESSION_NOT_FOUND"
  | "PARTICIPANT_NOT_FOUND"
  | "GATE_FAILED"
  | "TIMEOUT"
  | "RATE_LIMITED"
  | "CONTEXT_TOO_LARGE"
  | "INVALID_STATE"
  | "TRANSPORT_ERROR"
  | "AGENT_ERROR"
  | "INTERNAL_ERROR";

// =============================================================================
// HELPER TYPES
// =============================================================================

export type Message<T extends PrimitiveType> = MessageEnvelope<T>;
export type AnyMessage = { [T in PrimitiveType]: MessageEnvelope<T> }[PrimitiveType];

// =============================================================================
// STATE INTERFACES
// =============================================================================

export interface SessionState {
  id: SessionId;
  name?: string;
  config: SessionConfig;
  participants: Map<ParticipantId, ParticipantState>;
  context: Map<string, ContextItem>;
  forks: Map<ForkId, ForkState>;
  currentFork: ForkId | null;
  messageLog: AnyMessage[];
  pendingGates: Map<MessageId, GateState>;
  createdAt: string;
  seq: number;
  workingDirectory: string;
}

export interface ParticipantState {
  info: ParticipantAnnouncePayload;
  presence: PresenceStatus;
  lastHeartbeat: string;
  lastActive: string;
}

export interface ContextItem {
  key: string;
  content_type: ContextContentType;
  content?: string | object;
  content_ref?: ContentRef;
  visible_to?: ParticipantId[];
  added_by: ParticipantId;
  added_at: string;
  updated_at: string;
}

export interface ForkState {
  id: ForkId;
  name: string;
  from_point: MessageId;
  created_at: string;
  created_by: ParticipantId;
  participants: ParticipantId[];
}

export interface GateState {
  request: GateRequestPayload;
  approvals: ParticipantId[];
  rejections: ParticipantId[];
  created_at: string;
  expires_at: string | null;
}
