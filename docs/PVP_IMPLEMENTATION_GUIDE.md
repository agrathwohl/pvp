# Pair Vibecoding Protocol (PVP) - Implementation Guide

## Overview

You are implementing a **multiplayer, role-based coordination protocol for human-AI collaborative development**. This is NOT a chatbot. It's a coordination layer where multiple humans and AI agents collaborate in real-time to shape intent, gate actions, and steer AI execution.

**Core concept**: Humans don't review code anymore — they shape prompts collaboratively, observe AI reasoning, and gate actions before they execute. The code is a side effect; the real artifact is the recorded, auditable stream of human decisions mediated by AI execution.

## Project Name

`pvp` - Pair Vibecoding Protocol

## Repository Structure

```
pvp/
├── package.json
├── tsconfig.json
├── README.md
├── src/
│   ├── protocol/
│   │   ├── types.ts              # Protocol type definitions (provided below)
│   │   ├── messages.ts           # Message creation and validation utilities
│   │   └── validation.ts         # Schema validation (zod)
│   ├── server/
│   │   ├── index.ts              # Server entry point
│   │   ├── session.ts            # Session state management
│   │   ├── participant.ts        # Participant management
│   │   ├── gates.ts              # Gate/approval logic
│   │   ├── context.ts            # Context storage and retrieval
│   │   ├── forks.ts              # Fork/merge handling
│   │   └── router.ts             # Message routing logic
│   ├── transports/
│   │   ├── base.ts               # Base transport interface
│   │   ├── websocket.ts          # WebSocket transport for TUI clients
│   │   └── t140.ts               # T.140/RTP transport adapter
│   ├── tui/
│   │   ├── index.ts              # TUI entry point
│   │   ├── app.tsx               # Main Ink application
│   │   ├── components/
│   │   │   ├── SessionView.tsx   # Main session display
│   │   │   ├── MessageStream.tsx # Streaming messages display
│   │   │   ├── PromptInput.tsx   # Prompt composition
│   │   │   ├── ParticipantList.tsx # Who's in the session
│   │   │   ├── GatePrompt.tsx    # Approval prompts
│   │   │   ├── ContextPanel.tsx  # Context display
│   │   │   ├── ThinkingView.tsx  # Agent reasoning display
│   │   │   └── StatusBar.tsx     # Connection status, session info
│   │   ├── hooks/
│   │   │   ├── useSession.ts     # Session state hook
│   │   │   ├── useTransport.ts   # WebSocket connection hook
│   │   │   └── useInput.ts       # Input handling hook
│   │   └── store.ts              # Zustand store for TUI state
│   ├── storage/
│   │   ├── sqlite.ts             # SQLite blob storage for content
│   │   └── memory.ts             # In-memory storage for MVP
│   └── utils/
│       ├── ulid.ts               # ULID generation
│       ├── hash.ts               # SHA-256 hashing for content addressing
│       └── logger.ts             # Structured logging
├── tests/
│   ├── protocol/
│   │   └── messages.test.ts
│   ├── server/
│   │   ├── session.test.ts
│   │   └── gates.test.ts
│   └── integration/
│       └── flow.test.ts
└── examples/
    ├── basic-session.ts          # Simple session example
    └── multi-participant.ts      # Multiple humans example
```

## Dependencies

```json
{
  "name": "pvp",
  "version": "0.1.0",
  "type": "module",
  "scripts": {
    "build": "tsc",
    "server": "tsx src/server/index.ts",
    "tui": "tsx src/tui/index.ts",
    "dev": "tsx watch src/server/index.ts",
    "test": "vitest"
  },
  "dependencies": {
    "ws": "^8.16.0",
    "zod": "^3.22.4",
    "ulid": "^2.3.0",
    "ink": "^4.4.1",
    "ink-text-input": "^5.0.1",
    "react": "^18.2.0",
    "zustand": "^4.5.0",
    "better-sqlite3": "^9.4.3",
    "t140llm": "^0.0.12",
    "pino": "^8.19.0",
    "pino-pretty": "^10.3.1",
    "commander": "^12.0.0"
  },
  "devDependencies": {
    "@types/node": "^20.11.0",
    "@types/ws": "^8.5.10",
    "@types/better-sqlite3": "^7.6.9",
    "@types/react": "^18.2.0",
    "typescript": "^5.3.3",
    "tsx": "^4.7.0",
    "vitest": "^1.2.0"
  }
}
```

## tsconfig.json

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "esModuleInterop": true,
    "strict": true,
    "outDir": "dist",
    "rootDir": "src",
    "declaration": true,
    "jsx": "react-jsx",
    "skipLibCheck": true
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist"]
}
```

---

## STEP 1: Protocol Types and Server Scaffold

### 1.1 Protocol Types (`src/protocol/types.ts`)

Use the complete protocol definition below. This is the source of truth for all message types:

```typescript
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
```

### 1.2 Message Utilities (`src/protocol/messages.ts`)

Implement the following utilities:

```typescript
import { ulid } from "ulid";
import type { 
  AnyMessage, 
  MessageEnvelope, 
  PrimitiveType, 
  PayloadFor,
  SessionId,
  ParticipantId,
  MessageId,
  ForkId
} from "./types.js";

export function createMessage<T extends PrimitiveType>(
  type: T,
  session: SessionId,
  sender: ParticipantId,
  payload: PayloadFor<T>,
  options?: {
    ref?: MessageId;
    seq?: number;
    causal_refs?: MessageId[];
    fork?: ForkId;
  }
): MessageEnvelope<T> {
  return {
    v: 1,
    id: ulid(),
    ts: new Date().toISOString(),
    session,
    sender,
    type,
    payload,
    ...options,
  };
}

export function isMessageType<T extends PrimitiveType>(
  message: AnyMessage,
  type: T
): message is MessageEnvelope<T> {
  return message.type === type;
}

export function serializeMessage(message: AnyMessage): string {
  return JSON.stringify(message);
}

export function deserializeMessage(data: string): AnyMessage {
  return JSON.parse(data) as AnyMessage;
}
```

### 1.3 Session Manager (`src/server/session.ts`)

The session manager holds all state for a single session:

**Requirements:**
- Store session configuration
- Track all participants and their state
- Maintain message log (in memory for MVP)
- Track context items
- Manage pending gates
- Handle forks (store separately, track current fork)
- Increment sequence numbers for total ordering mode
- Provide methods: `addParticipant`, `removeParticipant`, `addMessage`, `getState`, `updatePresence`

**Key behaviors:**
- When a participant joins, broadcast `participant.announce` to all others
- When presence changes, broadcast `presence.update`
- Log every message to the message log
- In "total" ordering mode, assign incrementing sequence numbers

### 1.4 Gate Manager (`src/server/gates.ts`)

Handles approval gates:

**Requirements:**
- Create gate from `gate.request` message
- Track approvals and rejections
- Evaluate quorum rules:
  - `any`: N approvals from anyone
  - `all`: everyone with `approver` role
  - `role`: N approvals from specific role
  - `specific`: specific participants must approve
  - `majority`: >50% of approvers
- Set timeout timers
- Emit `gate.timeout` when timeout expires
- Resolve gate when quorum met (approved) or rejection received (rejected)

**Key behaviors:**
- When gate is created, broadcast to all participants with `approver` capability
- When approved/rejected, notify all participants
- On timeout, resolve based on session config (reject, auto-approve, or escalate)

### 1.5 Message Router (`src/server/router.ts`)

Routes incoming messages to appropriate handlers:

**Requirements:**
- Validate message structure
- Check sender has permission for message type
- Route to appropriate handler based on message type
- Broadcast messages to appropriate participants
- Handle errors gracefully

**Permission rules:**
- `prompt.submit`: requires `prompt` capability or `driver` role
- `gate.approve`/`gate.reject`: requires `approver` role or capability
- `interrupt.raise`: requires `interrupt` capability
- `fork.create`: requires `fork` capability and `allow_forks` in config
- `context.add`: requires `add_context` capability
- `session.end`: requires `admin` role or `end_session` capability

### 1.6 Server Entry Point (`src/server/index.ts`)

**Requirements:**
- Parse CLI arguments: `--port`, `--host`
- Initialize session storage (Map of sessions)
- Start WebSocket server
- Handle new connections
- Route messages to sessions
- Heartbeat management (ping clients, track pongs)
- Graceful shutdown

**CLI interface:**
```
pvp-server --port 3000 --host 0.0.0.0
```

---

## STEP 2: WebSocket Transport

### 2.1 Base Transport Interface (`src/transports/base.ts`)

```typescript
import type { AnyMessage, ParticipantId } from "../protocol/types.js";

export interface Transport {
  readonly participantId: ParticipantId;
  
  send(message: AnyMessage): Promise<void>;
  onMessage(handler: (message: AnyMessage) => void): void;
  onClose(handler: () => void): void;
  close(): void;
  isConnected(): boolean;
}

export interface TransportServer {
  onConnection(handler: (transport: Transport) => void): void;
  broadcast(message: AnyMessage, filter?: (id: ParticipantId) => boolean): void;
  close(): void;
}
```

### 2.2 WebSocket Transport (`src/transports/websocket.ts`)

**Server-side requirements:**
- Wrap `ws` WebSocket server
- Create Transport instance for each connection
- Handle connection lifecycle
- Serialize/deserialize messages as JSON
- Implement ping/pong for connection health
- Track participant ID after `session.join` message

**Client-side requirements:**
- Connect to server URL
- Reconnection logic with exponential backoff
- Send/receive JSON messages
- Heartbeat responses

**Message flow:**
1. Client connects via WebSocket
2. Client sends `session.join` or `session.create`
3. Server assigns participant ID (or uses provided one)
4. All subsequent messages include participant ID in envelope

---

## STEP 3: TUI Client

### 3.1 Architecture

Use **Ink** (React for CLI) with **Zustand** for state management.

The TUI has these views/modes:
- **Session view**: Main view showing message stream, participants, context
- **Prompt composition**: Multi-line input for composing prompts
- **Gate response**: When approval is requested, show prompt to approve/reject
- **Thinking view**: Show agent reasoning as it streams

### 3.2 Store (`src/tui/store.ts`)

Zustand store holding:
```typescript
interface TUIState {
  // Connection
  connected: boolean;
  sessionId: string | null;
  participantId: string | null;
  
  // Session data
  participants: Map<ParticipantId, ParticipantState>;
  messages: AnyMessage[];
  context: Map<string, ContextItem>;
  pendingGates: GateState[];
  
  // UI state
  mode: "stream" | "compose" | "gate" | "thinking";
  draftPrompt: string;
  currentThinking: string;
  currentResponse: string;
  
  // Actions
  connect(url: string): void;
  disconnect(): void;
  sendMessage(message: AnyMessage): void;
  setMode(mode: TUIState["mode"]): void;
  updateDraft(content: string): void;
  submitPrompt(): void;
  approveGate(gateId: MessageId, comment?: string): void;
  rejectGate(gateId: MessageId, reason: string): void;
  raiseInterrupt(urgency: InterruptUrgency, message: string): void;
}
```

### 3.3 Main App (`src/tui/app.tsx`)

**Layout:**
```
┌─────────────────────────────────────────────────────────────┐
│ PVP Session: {name}                    [{participant_count}] │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  [Human1 → Claude]: Build a login form                      │
│                                                             │
│  [Claude thinking...]                                       │
│  > Considering security requirements...                     │
│  > Need to handle OAuth...                                  │
│                                                             │
│  [Claude]: I'll create a login form with the following...   │
│  ...response streams here...                                │
│                                                             │
│  ⚠️  GATE: Claude wants to write to auth.ts                 │
│  [a]pprove  [r]eject  [v]iew details                       │
│                                                             │
├─────────────────────────────────────────────────────────────┤
│ Participants: Human1(driver) Human2(navigator) Claude(agent)│
├─────────────────────────────────────────────────────────────┤
│ > Type prompt here... (Ctrl+Enter to send, Esc to cancel)  │
└─────────────────────────────────────────────────────────────┘
```

### 3.4 Components

**SessionView.tsx**
- Renders message stream
- Shows streaming thinking/response chunks
- Highlights gates needing attention

**MessageStream.tsx**
- Virtual scrolling for long sessions
- Different rendering for different message types:
  - `prompt.submit`: Show as "[Sender → Target]: content"
  - `response.chunk`: Accumulate and show streaming text
  - `thinking.chunk`: Show in dimmed/italic style
  - `gate.request`: Show prominent alert
  - `interrupt.raise`: Show warning banner

**PromptInput.tsx**
- Multi-line text input
- Shows current contributors
- Target agent selector
- Ctrl+Enter to submit
- Esc to cancel

**GatePrompt.tsx**
- Shows when gate needs response
- Displays: action type, description, who's requesting
- Keyboard shortcuts: a=approve, r=reject, v=view details
- Comment input for approval/rejection

**ParticipantList.tsx**
- List all participants
- Show role badges
- Show presence status (●=active, ○=idle, ◌=away)

**ThinkingView.tsx**
- Shows agent reasoning in a collapsible panel
- Can be toggled visible/hidden
- Scrolls automatically

**StatusBar.tsx**
- Connection status
- Session name
- Current fork (if any)
- Pending gate count

### 3.5 Keybindings

| Key | Mode | Action |
|-----|------|--------|
| `p` | stream | Start composing prompt |
| `Enter` | stream | Focus input |
| `Ctrl+Enter` | compose | Submit prompt |
| `Esc` | compose | Cancel composition |
| `a` | gate | Approve gate |
| `r` | gate | Reject gate (prompts for reason) |
| `v` | gate | View gate details |
| `i` | stream | Raise interrupt |
| `t` | stream | Toggle thinking panel |
| `Ctrl+c` | any | Exit |

### 3.6 TUI Entry Point (`src/tui/index.ts`)

**CLI interface:**
```
pvp --server ws://localhost:3000 --name "Alice" --role driver
pvp --server ws://localhost:3000 --session abc123 --name "Bob" --role navigator
```

**Arguments:**
- `--server`: WebSocket URL
- `--session`: Session ID to join (omit to create new)
- `--name`: Participant display name
- `--role`: Initial role (driver, navigator, adversary, observer)

---

## STEP 4: T.140 Transport Adapter

### 4.1 Purpose

The T.140 transport allows audio streams (e.g., from a meeting) to feed into a PVP session. This uses the `t140llm` library.

### 4.2 Architecture

```
┌─────────────────┐      ┌─────────────────┐      ┌─────────────┐
│  Audio Source   │─────▶│  STT Service    │─────▶│ T.140 RTP   │
│  (Google Meet)  │      │  (Whisper, etc) │      │  Stream     │
└─────────────────┘      └─────────────────┘      └──────┬──────┘
                                                         │
                                                         ▼
                                                  ┌─────────────┐
                                                  │ PVP Server  │
                                                  │ (T.140      │
                                                  │  Listener)  │
                                                  └─────────────┘
```

### 4.3 T.140 Transport Implementation (`src/transports/t140.ts`)

**Requirements:**
- Listen for incoming T.140 RTP packets on configurable port
- Use `t140llm` demultiplexer to handle multiple streams
- Map T.140 streams to PVP participants
- Convert incoming text to `context.add` messages (type: `audio_transcript`)
- Support speaker identification if available in stream metadata

**Configuration:**
```typescript
interface T140TransportConfig {
  listenPort: number;
  listenAddress: string;
  // How to handle incoming streams
  streamMapping: "auto" | "manual";
  // Default participant role for audio sources
  defaultRole: Role;
  // Whether to require approval to add transcript to context
  gateTranscripts: boolean;
}
```

**Key behaviors:**
- When new T.140 stream detected:
  1. Create virtual participant for the audio source
  2. Send `participant.announce` with transport: "t140"
  3. As text arrives, accumulate into reasonable chunks
  4. Send `context.add` with `content_type: "audio_transcript"`
  
- Chunking strategy:
  - Buffer incoming characters
  - Flush on sentence boundaries (., !, ?)
  - Flush after N seconds of no input
  - Flush when buffer exceeds size threshold

### 4.4 Integration Example

```typescript
import { createT140Transport } from "./transports/t140.js";
import { PVPServer } from "./server/index.js";

const server = new PVPServer({ port: 3000 });

const t140 = createT140Transport({
  listenPort: 5004,
  listenAddress: "0.0.0.0",
  streamMapping: "auto",
  defaultRole: "navigator",
  gateTranscripts: false,
});

// Connect T.140 transport to a specific session
t140.attachToSession(server, "session_123");

// Now any T.140 RTP packets on port 5004 will be:
// 1. Demultiplexed by stream ID
// 2. Converted to context.add messages
// 3. Broadcast to all session participants
```

---

## Testing Requirements

### Unit Tests

**Protocol tests (`tests/protocol/messages.test.ts`):**
- Message creation produces valid structure
- Serialization/deserialization roundtrips correctly
- Type guards work correctly

**Session tests (`tests/server/session.test.ts`):**
- Adding/removing participants
- Message logging
- Presence updates
- Sequence number assignment

**Gate tests (`tests/server/gates.test.ts`):**
- Each quorum type evaluates correctly
- Timeouts fire appropriately
- Approval/rejection resolves gate

### Integration Tests

**Flow test (`tests/integration/flow.test.ts`):**
1. Start server
2. Connect two clients
3. One sends `session.create`
4. Other sends `session.join`
5. First sends `prompt.submit`
6. Simulate agent `response.start`, `response.chunk`, `response.end`
7. Agent sends `tool.propose`
8. Gate is created
9. Human approves
10. Tool executes
11. Verify all messages logged correctly

---

## Example Flows

### Basic Session Creation and Join

```typescript
// Client 1 creates session
{
  v: 1,
  type: "session.create",
  payload: {
    name: "Project Kickoff",
    config: {
      require_approval_for: ["file_write", "shell_execute"],
      default_gate_quorum: { type: "any", count: 1 },
      allow_forks: true,
      max_participants: 10,
      ordering_mode: "causal",
      on_participant_timeout: "skip",
      heartbeat_interval_seconds: 30,
      idle_timeout_seconds: 120,
      away_timeout_seconds: 300
    }
  }
}

// Server responds with session.join confirmation including session ID
// Client 1 is now in session with driver role

// Client 2 joins
{
  v: 1,
  type: "session.join",
  payload: {
    participant: {
      id: "human_02",
      name: "Bob",
      type: "human",
      roles: ["navigator"],
      transport: "websocket"
    },
    supported_versions: [1]
  }
}
```

### Prompt with Gate

```typescript
// Human submits prompt
{
  type: "prompt.submit",
  payload: {
    content: "Create a user authentication module",
    target_agent: "claude_01",
    contributors: ["human_01", "human_02"],
    context_keys: ["requirements", "existing_auth_code"]
  }
}

// Agent streams thinking
{ type: "thinking.start", payload: { agent: "claude_01", prompt_ref: "..." } }
{ type: "thinking.chunk", ref: "...", payload: { text: "Analyzing requirements..." } }
{ type: "thinking.end", ref: "..." }

// Agent streams response
{ type: "response.start", payload: { agent: "claude_01", prompt_ref: "..." } }
{ type: "response.chunk", ref: "...", payload: { text: "I'll create..." } }
{ type: "response.end", ref: "...", payload: { finish_reason: "tool_use" } }

// Agent proposes tool use
{
  type: "tool.propose",
  payload: {
    tool_name: "write_file",
    arguments: { path: "src/auth.ts", content: "..." },
    agent: "claude_01",
    risk_level: "medium",
    description: "Write authentication module",
    requires_approval: true,
    category: "file_write"
  }
}

// Server creates gate
{
  type: "gate.request",
  payload: {
    action_type: "tool",
    action_ref: "...",  // tool.propose message ID
    quorum: { type: "any", count: 1 },
    timeout_seconds: 300,
    message: "Claude wants to write to src/auth.ts"
  }
}

// Human approves
{
  type: "gate.approve",
  payload: {
    gate: "...",  // gate.request message ID
    approver: "human_01",
    comment: "Looks good"
  }
}

// Server executes and reports result
{ type: "tool.execute", payload: { tool_proposal: "...", approved_by: ["human_01"] } }
{ type: "tool.result", payload: { tool_proposal: "...", success: true, duration_ms: 150 } }
```

### Interrupt Flow

```typescript
// Agent is streaming response
{ type: "response.chunk", payload: { text: "I'll use MongoDB for..." } }

// Human raises interrupt
{
  type: "interrupt.raise",
  payload: {
    target: "claude_01",
    urgency: "pause",
    message: "Wait - we decided on PostgreSQL yesterday",
    inject_context: "Decision: Use PostgreSQL for all persistence"
  }
}

// Agent acknowledges
{
  type: "interrupt.acknowledge",
  payload: {
    interrupt: "...",
    by: "claude_01",
    action_taken: "paused"
  }
}

// Context is added
{
  type: "context.add",
  payload: {
    key: "db_decision",
    content_type: "text",
    content: "Decision: Use PostgreSQL for all persistence",
    source: "interrupt from human_01"
  }
}

// Agent resumes with new context
{ type: "response.chunk", payload: { text: "Understood. Using PostgreSQL..." } }
```

---

## Implementation Order

1. **Protocol types and validation** - Foundation everything else builds on
2. **In-memory session manager** - Core state management
3. **Message router** - Handles all message types
4. **WebSocket transport (server)** - Basic connectivity
5. **Basic TUI (connect, show messages)** - Can observe sessions
6. **Gate manager** - Approval workflows
7. **TUI prompt composition** - Can send prompts
8. **TUI gate responses** - Can approve/reject
9. **Heartbeat/presence** - Connection health
10. **T.140 transport** - Audio integration
11. **Fork/merge** - Advanced collaboration

---

## Success Criteria

The implementation is complete when:

1. Two humans can connect via TUI to the same session
2. One human can send a prompt targeting an agent
3. Messages stream to all participants in real-time
4. Tool calls trigger gates that require human approval
5. Humans can approve/reject gates from TUI
6. Interrupts pause agent output and inject context
7. T.140 audio streams appear as context in the session
8. All messages are logged and can be replayed
9. Session state survives participant disconnect/reconnect

---

## Notes for Implementation

- **Start simple**: Get basic message flow working before adding all features
- **Test incrementally**: Write tests as you build each component
- **Log everything**: Use structured logging (pino) for debugging
- **Type safety**: Leverage TypeScript's type system fully
- **Error handling**: Every message handler should handle errors gracefully
- **No premature optimization**: In-memory storage is fine for MVP
