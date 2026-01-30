# Pair Vibecoding Protocol (PVP)

## Specification — Version 1.0.0-draft

**Status:** Draft  
**Author:** Andrew Grathwohl  
**Date:** January 2026  
**URI:** https://pvp.codes  
**Repository:** https://github.com/agrathwohl/pvp

---

## Abstract

The Pair Vibecoding Protocol (PVP) is a coordination protocol for real-time, multiplayer human-AI collaborative software development. It defines a message-based communication layer where multiple human participants and AI agents interact within structured sessions, with role-based access control, approval gates for high-risk operations, session forking and merging, and a git-integrated decision tracking system. PVP treats the conversation — not the code — as the primary artifact: the auditable stream of human decisions mediated by AI execution.

---

## Table of Contents

1. [Introduction](#1-introduction)
2. [Terminology](#2-terminology)
3. [Protocol Overview](#3-protocol-overview)
4. [Message Envelope](#4-message-envelope)
5. [Identifiers](#5-identifiers)
6. [Session Lifecycle](#6-session-lifecycle)
7. [Participants](#7-participants)
8. [Presence and Heartbeat](#8-presence-and-heartbeat)
9. [Context Management](#9-context-management)
10. [Secret Sharing](#10-secret-sharing)
11. [Prompt Lifecycle](#11-prompt-lifecycle)
12. [Thinking and Response Streaming](#12-thinking-and-response-streaming)
13. [Tool Execution](#13-tool-execution)
14. [Approval Gates](#14-approval-gates)
15. [Interrupts](#15-interrupts)
16. [Forks and Merges](#16-forks-and-merges)
17. [Error Handling](#17-error-handling)
18. [Decision Tracking](#18-decision-tracking)
19. [Transport Bindings](#19-transport-bindings)
20. [Security Considerations](#20-security-considerations)
21. [IANA Considerations](#21-iana-considerations)

---

## 1. Introduction

### 1.1. Motivation

Existing human-AI collaboration tools are single-user, single-agent, and unauditable. A human types a prompt, an AI responds, and the conversation disappears into a chat log. There is no mechanism for:

- Multiple humans to collaboratively shape a prompt before submission
- Role-based control over who can approve destructive operations
- Structured observation of AI reasoning before it acts
- Forking conversations to explore alternatives in parallel
- Linking the conversation that produced code to the code itself

PVP addresses these gaps with a structured protocol that sits between participants (human and AI) and provides coordination primitives for collaborative development.

### 1.2. Design Principles

1. **Conversation is the artifact.** Code is a side effect of decisions. The decision stream is the primary output.
2. **Humans approve, agents execute.** AI agents propose actions; humans gate them.
3. **Everything is auditable.** Every message is timestamped, identified, and causally linked.
4. **Transport-agnostic.** The protocol defines messages, not wire format. WebSocket, MCP, HTTP, and stdio bindings are defined.
5. **Fork-friendly.** Parallel exploration is a first-class concept, mapped to git branches.

### 1.3. Scope

This specification defines:

- The message envelope format and all 40 primitive message types
- Session lifecycle, participant management, and role-based access control
- Approval gate semantics and quorum rules
- Context and secret management
- Fork/merge semantics
- Git-based decision tracking integration
- Transport binding requirements

This specification does NOT define:

- AI agent behavior or prompt engineering strategies
- Specific tool implementations
- User interface requirements
- Authentication mechanisms (transport-layer concern)

---

## 2. Terminology

The key words "MUST", "MUST NOT", "REQUIRED", "SHALL", "SHALL NOT", "SHOULD", "SHOULD NOT", "RECOMMENDED", "MAY", and "OPTIONAL" in this document are to be interpreted as described in [RFC 2119](https://tools.ietf.org/html/rfc2119).

| Term | Definition |
|------|-----------|
| **Session** | A bounded collaboration context with participants, shared state, and message history. |
| **Participant** | An entity (human or agent) that joins a session and sends/receives messages. |
| **Driver** | A participant who composes and submits prompts to agents. |
| **Navigator** | A participant who observes, reviews, and provides guidance without direct prompting. |
| **Adversary** | A participant tasked with finding flaws, suggesting edge cases, and stress-testing decisions. |
| **Observer** | A read-only participant. |
| **Approver** | A participant authorized to approve or reject gated actions. |
| **Gate** | An approval checkpoint that blocks execution until quorum is reached. |
| **Quorum** | A rule defining how many and which approvals are needed to pass a gate. |
| **Fork** | A named branch of conversation that diverges from a point in the session history. |
| **Context** | Shared data (files, references, structured objects) visible to participants. |
| **Primitive** | One of the 40 defined message types in PVP. |

---

## 3. Protocol Overview

### 3.1. Architecture

```
┌───────────────┐     ┌───────────────┐     ┌───────────────┐
│  Human (TUI)  │────▶│               │◀────│  Human (TUI)  │
│  driver       │     │  PVP Server   │     │  navigator    │
└───────────────┘     │               │     └───────────────┘
                      │  • Sessions   │
┌───────────────┐     │  • Routing    │     ┌───────────────┐
│  AI Agent     │────▶│  • Gates      │◀────│  Human (TUI)  │
│  (Claude)     │     │  • Context    │     │  approver     │
└───────────────┘     │  • Forks      │     └───────────────┘
                      └───────┬───────┘
                              │
                      ┌───────┴───────┐
                      │  Git Bridge   │
                      │  (decision    │
                      │   tracking)   │
                      └───────────────┘
```

### 3.2. Message Flow

All communication is message-based. Participants send messages to the server, which routes them to other participants in the same session (and fork, if applicable). The server is the authoritative source of session state.

### 3.3. Protocol Version

This specification defines **protocol version 1**. All messages MUST include `v: 1` in the envelope. Servers MUST reject messages with unsupported version numbers.

---

## 4. Message Envelope

Every PVP message is wrapped in a common envelope structure.

### 4.1. Envelope Schema

```
MessageEnvelope {
  v:           integer       REQUIRED  Protocol version (1)
  id:          MessageId     REQUIRED  Unique message identifier
  ts:          string        REQUIRED  ISO 8601 timestamp
  session:     SessionId     REQUIRED  Session this message belongs to
  sender:      ParticipantId REQUIRED  Sender identifier
  type:        PrimitiveType REQUIRED  Message type discriminator
  payload:     object        REQUIRED  Type-specific payload
  ref:         MessageId     OPTIONAL  Reference to a prior message
  seq:         integer       OPTIONAL  Sequence number (total ordering)
  causal_refs: MessageId[]   OPTIONAL  Causal dependency references
  fork:        ForkId        OPTIONAL  Fork scope
}
```

### 4.2. Field Semantics

**`v`** — Protocol version. Implementations MUST set this to `1` and MUST reject envelopes with unknown versions.

**`id`** — A globally unique message identifier. Implementations SHOULD use ULIDs (Universally Unique Lexicographically Sortable Identifiers) to enable time-based sorting without additional metadata.

**`ts`** — ISO 8601 timestamp of message creation. Implementations SHOULD use UTC.

**`session`** — Identifies the session scope. Messages MUST NOT be delivered to participants in a different session.

**`sender`** — Identifies the originating participant. The server MAY use `"system"` as a sender for server-generated messages (e.g., timeout notifications).

**`type`** — One of the 40 primitive types defined in Section 4.3. Determines the expected shape of `payload`.

**`ref`** — An optional reference to a prior message that this message responds to. Used for request/response correlation (e.g., `gate.approve` references `gate.request`).

**`seq`** — Optional monotonically increasing sequence number. When `ordering_mode` is `"total"`, the server MUST assign sequence numbers. When `"causal"`, sequence numbers are OPTIONAL.

**`causal_refs`** — Optional array of message IDs that this message causally depends on. Used for causal ordering and replay.

**`fork`** — Optional fork identifier. When present, the message is scoped to the specified fork. When absent, the message applies to the default (trunk) context.

### 4.3. Primitive Types

PVP defines 40 message primitives organized into 12 categories:

| Category | Primitives |
|----------|-----------|
| **Session** (5) | `session.create`, `session.join`, `session.leave`, `session.end`, `session.config_update` |
| **Participant** (2) | `participant.announce`, `participant.role_change` |
| **Heartbeat** (2) | `heartbeat.ping`, `heartbeat.pong` |
| **Presence** (1) | `presence.update` |
| **Context** (3) | `context.add`, `context.update`, `context.remove` |
| **Secret** (2) | `secret.share`, `secret.revoke` |
| **Prompt** (3) | `prompt.draft`, `prompt.submit`, `prompt.amend` |
| **Thinking** (3) | `thinking.start`, `thinking.chunk`, `thinking.end` |
| **Response** (3) | `response.start`, `response.chunk`, `response.end` |
| **Tool** (6) | `tool.propose`, `tool.approve`, `tool.reject`, `tool.execute`, `tool.output`, `tool.result` |
| **Gate** (4) | `gate.request`, `gate.approve`, `gate.reject`, `gate.timeout` |
| **Interrupt** (2) | `interrupt.raise`, `interrupt.acknowledge` |
| **Fork** (2) | `fork.create`, `fork.switch` |
| **Merge** (2) | `merge.propose`, `merge.execute` |
| **Error** (1) | `error` |

---

## 5. Identifiers

### 5.1. Format

All identifiers in PVP are opaque strings. Implementations SHOULD use ULIDs for message, session, and participant identifiers. Fork identifiers SHOULD be human-readable slugs (e.g., `"explore-auth-approach"`).

### 5.2. Content Hash

Content hashes (`ContentHash`) are used for integrity verification of context items and tool outputs. Implementations SHOULD use SHA-256 hex encoding.

---

## 6. Session Lifecycle

### 6.1. Creation

A session is created by a participant sending `session.create`:

```
session.create {
  name:   string          OPTIONAL  Human-readable session name
  config: SessionConfig   REQUIRED  Session configuration
}
```

The server MUST assign a unique `SessionId` and broadcast the creation to the sender.

### 6.2. Session Configuration

```
SessionConfig {
  require_approval_for:       ToolCategory[]  REQUIRED
  default_gate_quorum:        QuorumRule      REQUIRED
  allow_forks:                boolean         REQUIRED
  max_participants:           integer         REQUIRED
  ordering_mode:              enum            REQUIRED  "causal" | "total"
  on_participant_timeout:     enum            REQUIRED  "wait" | "skip" | "pause_session"
  heartbeat_interval_seconds: integer         REQUIRED
  idle_timeout_seconds:       integer         REQUIRED
  away_timeout_seconds:       integer         REQUIRED
}
```

**`require_approval_for`** — Tool categories that trigger approval gates. Valid categories:

| Category | Description |
|----------|-----------|
| `file_read` | Reading files from disk |
| `file_write` | Writing or modifying files |
| `file_delete` | Deleting files |
| `shell_execute` | Running shell commands |
| `network_request` | Making network requests |
| `deploy` | Deployment operations |
| `database` | Database operations |
| `secret_access` | Accessing shared secrets |
| `external_api` | External API calls |
| `all` | All tool categories |

**`ordering_mode`** — Determines message ordering guarantees:
- `"causal"`: Messages are ordered by causal dependency. Concurrent messages may arrive in any order.
- `"total"`: The server assigns monotonic sequence numbers. All participants see the same order.

### 6.3. Joining

Participants join an existing session with `session.join`:

```
session.join {
  participant:       ParticipantAnnouncePayload  REQUIRED
  token:             string                      OPTIONAL  Auth token
  supported_versions: integer[]                  REQUIRED  Protocol versions supported
}
```

The server MUST verify that the participant's requested version is supported and that `max_participants` has not been reached.

### 6.4. Leaving

A participant leaves with `session.leave`:

```
session.leave {
  reason: string  OPTIONAL
}
```

The server MUST broadcast the departure and update presence state.

### 6.5. Ending

A session is ended by an admin with `session.end`:

```
session.end {
  reason:      string  REQUIRED
  final_state: enum    REQUIRED  "completed" | "aborted" | "timeout"
}
```

The server MUST NOT accept further messages after a session ends (except `error`).

### 6.6. Configuration Updates

Session configuration can be modified by admin participants with `session.config_update`:

```
session.config_update {
  changes: Partial<SessionConfig>  REQUIRED
  reason:  string                  REQUIRED
}
```

The server MUST broadcast configuration changes to all participants.

---

## 7. Participants

### 7.1. Announcement

Every participant announces their identity upon joining:

```
participant.announce {
  id:           ParticipantId   REQUIRED
  name:         string          REQUIRED
  type:         enum            REQUIRED  "human" | "agent"
  roles:        Role[]          REQUIRED
  capabilities: Capability[]    OPTIONAL
  transport:    TransportType   REQUIRED
  metadata:     object          OPTIONAL
}
```

### 7.2. Roles

Roles determine what a participant can do within a session:

| Role | Can Prompt | Can Approve | Can Interrupt | Can Fork | Can Manage Participants | Can End Session |
|------|-----------|------------|--------------|---------|----------------------|----------------|
| `driver` | ✓ | ✗ | ✓ | ✓ | ✗ | ✗ |
| `navigator` | ✗ | ✓ | ✓ | ✓ | ✗ | ✗ |
| `adversary` | ✓ | ✓ | ✓ | ✓ | ✗ | ✗ |
| `observer` | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ |
| `approver` | ✗ | ✓ | ✓ | ✗ | ✗ | ✗ |
| `admin` | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |

A participant MAY hold multiple roles. The server MUST enforce role-based permissions on all message types.

### 7.3. Capabilities

Capabilities provide fine-grained permission overrides beyond roles:

- `prompt` — Can submit prompts
- `approve` — Can approve gates
- `interrupt` — Can raise interrupts
- `fork` — Can create forks
- `add_context` — Can add context items
- `manage_participants` — Can change other participants' roles
- `end_session` — Can end the session

### 7.4. Role Changes

Roles can be changed by admin participants via `participant.role_change`:

```
participant.role_change {
  participant: ParticipantId  REQUIRED
  old_roles:   Role[]        REQUIRED
  new_roles:   Role[]        REQUIRED
  changed_by:  ParticipantId REQUIRED
  reason:      string        OPTIONAL
}
```

---

## 8. Presence and Heartbeat

### 8.1. Heartbeat

The server MUST send `heartbeat.ping` messages at the interval specified by `heartbeat_interval_seconds`. Participants MUST respond with `heartbeat.pong`. Both payloads are empty objects.

If a participant fails to respond within `idle_timeout_seconds`, its presence status transitions to `"idle"`. After `away_timeout_seconds`, it transitions to `"away"`. The server SHOULD apply `on_participant_timeout` policy for `"away"` participants.

### 8.2. Presence Updates

```
presence.update {
  participant: ParticipantId  REQUIRED
  status:      PresenceStatus REQUIRED  "active" | "idle" | "away" | "disconnected"
  last_active: string         REQUIRED  ISO 8601 timestamp
}
```

The server MUST broadcast presence changes to all session participants.

---

## 9. Context Management

Context items are shared data objects visible to session participants.

### 9.1. Adding Context

```
context.add {
  key:          string            REQUIRED  Unique key within session
  content_type: ContextContentType REQUIRED
  content:      string | object   OPTIONAL  Inline content
  content_ref:  ContentRef        OPTIONAL  Reference to external content
  visible_to:   ParticipantId[]   OPTIONAL  Restrict visibility (default: all)
  source:       string            OPTIONAL  Origin description
  tags:         string[]          OPTIONAL  Searchable labels
}
```

**Content types:** `"text"`, `"file"`, `"reference"`, `"structured"`, `"image"`, `"audio_transcript"`.

Either `content` (inline) or `content_ref` (external) MUST be provided.

### 9.2. Content References

```
ContentRef {
  hash:      ContentHash  REQUIRED  SHA-256 of content
  size_bytes: integer     REQUIRED
  mime_type: string       REQUIRED
  storage:   enum         REQUIRED  "inline" | "local" | "s3" | "ipfs"
  uri:       string       OPTIONAL  Storage-specific URI
}
```

### 9.3. Updating and Removing Context

`context.update` replaces or diffs an existing context item. `context.remove` deletes it. Both require a `reason` string.

### 9.4. Reserved Context Keys

| Key | Description |
|-----|-----------|
| `session:tasks` | Session task and goal state (managed by agent tasks tool). Content type: `"structured"`. |

Implementations SHOULD NOT use the `session:` prefix for user-defined context keys.

---

## 10. Secret Sharing

Secrets (API keys, credentials, database URLs) are shared with scoped visibility and optional expiration.

```
secret.share {
  key:         string          REQUIRED
  scope:       ParticipantId[] REQUIRED  Who can access this secret
  expires_at:  string          OPTIONAL  ISO 8601 expiration
  value_ref:   string          REQUIRED  Reference to secret value
  secret_type: enum            OPTIONAL  "api_key" | "database_url" | "token" | "credential" | "other"
}
```

Servers MUST NOT log or persist secret values. Servers MUST enforce scope restrictions and MUST delete expired secrets.

`secret.revoke` immediately invalidates a shared secret.

---

## 11. Prompt Lifecycle

### 11.1. Drafting

`prompt.draft` indicates that a participant is composing a prompt. This enables real-time collaborative editing:

```
prompt.draft {
  content:      string          REQUIRED
  target_agent: ParticipantId   OPTIONAL
  contributors: ParticipantId[] REQUIRED
}
```

### 11.2. Submission

`prompt.submit` sends a finalized prompt to an agent:

```
prompt.submit {
  content:      string          REQUIRED
  target_agent: ParticipantId   REQUIRED
  contributors: ParticipantId[] REQUIRED
  context_keys: string[]        REQUIRED  Context items to include
  config:       PromptConfig    OPTIONAL
}
```

```
PromptConfig {
  temperature:     number   OPTIONAL
  max_tokens:      integer  OPTIONAL
  tools_allowed:   string[] OPTIONAL
  model:           string   OPTIONAL
  provider_params: object   OPTIONAL
}
```

### 11.3. Amendment

`prompt.amend` modifies a submitted prompt before the agent completes its response:

```
prompt.amend {
  original_prompt: MessageId  REQUIRED
  amendment:       string     REQUIRED
  reason:          string     REQUIRED
}
```

Agents SHOULD incorporate amendments into their ongoing response if possible.

---

## 12. Thinking and Response Streaming

### 12.1. Thinking

AI agents MAY expose their reasoning process via thinking messages:

- `thinking.start` — Announces the beginning of reasoning. Includes `visible_to` to control who sees thinking output (`"all"`, `"approvers_only"`, or specific participant IDs).
- `thinking.chunk` — Streams incremental thinking text.
- `thinking.end` — Concludes thinking with an optional summary and duration.

### 12.2. Response

Agent output is streamed via response messages:

- `response.start` — Announces the beginning of a response, referencing the prompt.
- `response.chunk` — Streams incremental response text.
- `response.end` — Concludes the response with a finish reason and optional usage statistics.

**Finish reasons:** `"complete"`, `"interrupted"`, `"error"`, `"max_tokens"`, `"tool_use"`.

```
UsageStats {
  input_tokens:    integer  REQUIRED
  output_tokens:   integer  REQUIRED
  thinking_tokens: integer  OPTIONAL
  cost_usd:        number   OPTIONAL
  model:           string   OPTIONAL
  latency_ms:      integer  OPTIONAL
}
```

---

## 13. Tool Execution

Tool execution follows a propose → gate → execute → result lifecycle.

### 13.1. Proposal

An agent proposes a tool execution:

```
tool.propose {
  tool_name:         string       REQUIRED
  arguments:         object       REQUIRED
  agent:             ParticipantId REQUIRED
  risk_level:        RiskLevel    REQUIRED
  description:       string       REQUIRED
  requires_approval: boolean      REQUIRED
  suggested_approvers: ParticipantId[] OPTIONAL
  category:          ToolCategory REQUIRED
}
```

**Risk levels:** `"low"`, `"medium"`, `"high"`, `"critical"`.

### 13.2. Approval Flow

If `requires_approval` is `true` (determined by session config and tool category), the server MUST create a gate (see Section 14) before execution.

If `requires_approval` is `false`, the agent MAY proceed directly to `tool.execute`.

### 13.3. Execution and Output

`tool.execute` confirms that approval was obtained. `tool.output` streams stdout/stderr in real time. `tool.result` provides the final outcome:

```
tool.result {
  tool_proposal: MessageId  REQUIRED
  success:       boolean    REQUIRED
  result:        any        OPTIONAL
  error:         string     OPTIONAL
  duration_ms:   integer    REQUIRED
}
```

---

## 14. Approval Gates

Gates are the core safety mechanism of PVP. They block execution until human approval.

### 14.1. Gate Request

```
gate.request {
  action_type:     GateActionType  REQUIRED
  action_ref:      MessageId       REQUIRED
  quorum:          QuorumRule      REQUIRED
  timeout_seconds: integer         REQUIRED
  message:         string          REQUIRED
}
```

**Gate action types:** `"tool"`, `"deploy"`, `"prompt"`, `"context_change"`, `"session_config"`, `"participant_add"`, `"fork"`, `"merge"`.

### 14.2. Quorum Rules

Quorum rules determine how many approvals are needed:

| Rule | Schema | Semantics |
|------|--------|----------|
| **Any N** | `{ type: "any", count: N }` | Any N participants with approve capability |
| **All** | `{ type: "all" }` | Every participant with approve capability |
| **Role-based** | `{ type: "role", role: R, count: N }` | N participants holding role R |
| **Specific** | `{ type: "specific", participants: [...] }` | All listed participants must approve |
| **Majority** | `{ type: "majority" }` | >50% of participants with approve capability |

### 14.3. Gate Resolution

A gate resolves when:
1. **Quorum met** — Sufficient approvals received. Gate passes; action proceeds.
2. **Rejected** — Any participant rejects. Gate fails immediately.
3. **Timeout** — `timeout_seconds` expires without quorum. Resolution is `"rejected"`, `"auto_approved"`, or `"escalated"` per server policy.

```
gate.timeout {
  gate:               MessageId  REQUIRED
  approvals_received: integer    REQUIRED
  approvals_required: integer    REQUIRED
  resolution:         enum       REQUIRED  "rejected" | "auto_approved" | "escalated"
}
```

### 14.4. Gate State

The server maintains gate state:

```
GateState {
  request:     GateRequestPayload  REQUIRED
  approvals:   ParticipantId[]     REQUIRED
  rejections:  ParticipantId[]     REQUIRED
  created_at:  string              REQUIRED
  expires_at:  string | null       REQUIRED
}
```

---

## 15. Interrupts

Interrupts allow humans to intervene in agent execution.

### 15.1. Raising an Interrupt

```
interrupt.raise {
  target:             ParticipantId  OPTIONAL  Specific agent, or all
  urgency:            InterruptUrgency REQUIRED
  message:            string         REQUIRED
  inject_context:     string         OPTIONAL  Text to inject into agent context
  inject_context_ref: ContentRef     OPTIONAL  External content to inject
}
```

**Urgency levels:**
- `"pause"` — Agent SHOULD pause after completing current tool execution.
- `"stop"` — Agent MUST stop immediately and await further instructions.
- `"emergency"` — Agent MUST abort all pending operations.

### 15.2. Acknowledgment

```
interrupt.acknowledge {
  interrupt:     MessageId    REQUIRED
  by:            ParticipantId REQUIRED
  action_taken:  enum         REQUIRED  "paused" | "stopped" | "acknowledged" | "ignored"
  ignore_reason: string       OPTIONAL  Required if action_taken is "ignored"
}
```

Agents MUST acknowledge interrupts. Agents MAY ignore `"pause"` urgency with a stated reason. Agents MUST NOT ignore `"stop"` or `"emergency"`.

---

## 16. Forks and Merges

### 16.1. Creating a Fork

Forks enable parallel exploration of alternatives:

```
fork.create {
  name:         string          REQUIRED
  from_point:   MessageId       REQUIRED  Message to fork from
  reason:       string          REQUIRED
  participants: ParticipantId[] REQUIRED  Who participates in the fork
  copy_context: boolean         REQUIRED  Copy current context to fork
}
```

The server MUST create a new fork scope. Messages with the fork's `ForkId` are only delivered to fork participants.

### 16.2. Switching Forks

`fork.switch` moves a participant's active context to a different fork:

```
fork.switch {
  target_fork: ForkId  REQUIRED
}
```

### 16.3. Merging

When a fork is ready to rejoin the main conversation:

```
merge.propose {
  source_fork: ForkId       REQUIRED
  target_fork: ForkId       REQUIRED
  strategy:    MergeStrategy REQUIRED
  summary:     string       REQUIRED
}
```

**Merge strategies:**
- `"replace"` — Target is replaced by source.
- `"append"` — Source messages are appended to target.
- `"interleave"` — Messages are interleaved chronologically.
- `"manual"` — Human resolves conflicts manually.

`merge.execute` confirms the merge, optionally with conflict resolutions.

---

## 17. Error Handling

```
error {
  code:        ErrorCode  REQUIRED
  message:     string     REQUIRED
  recoverable: boolean    REQUIRED
  details:     object     OPTIONAL
  related_to:  MessageId  OPTIONAL
}
```

**Error codes:**

| Code | Description |
|------|-----------|
| `INVALID_MESSAGE` | Malformed or invalid message |
| `UNAUTHORIZED` | Insufficient permissions |
| `SESSION_NOT_FOUND` | Session does not exist |
| `PARTICIPANT_NOT_FOUND` | Participant not in session |
| `GATE_FAILED` | Gate was rejected or timed out |
| `TIMEOUT` | Operation timed out |
| `RATE_LIMITED` | Too many messages |
| `CONTEXT_TOO_LARGE` | Context exceeds size limits |
| `INVALID_STATE` | Operation not valid in current state |
| `TRANSPORT_ERROR` | Transport-layer failure |
| `AGENT_ERROR` | Agent-side processing error |
| `INTERNAL_ERROR` | Server-side processing error |

Servers MUST send `error` messages for all rejected operations. Clients MUST handle `error` messages gracefully.

---

## 18. Decision Tracking

PVP includes an integrated git decision tracking system that links conversations to commits.

### 18.1. Architecture

```
PVP Server ──▶ Bridge Service ──▶ Git Hooks
                (HTTP + Unix socket)
```

The Bridge Service is a local daemon that maintains session state and exposes it to git hooks via HTTP (`http://localhost:9847`) and Unix socket (`/tmp/pvp-git-bridge.sock`).

### 18.2. Decision Commit

A DecisionCommit links a git commit SHA to the PVP conversation:

| Field | Description |
|-------|-----------|
| `git_sha` | The commit this decision produced |
| `pvp_session` | Session where the decision was made |
| `pvp_messages` | Message IDs in the causal chain |
| `decision_type` | `implementation`, `refactor`, `bugfix`, `exploration`, `revert`, `documentation`, `test`, `configuration`, `dependency`, `optimization` |
| `confidence_score` | 0.0–1.0 confidence from the AI agent |
| `alternatives_considered` | Approaches that were considered but rejected |
| `tool_executions` | All tool executions that contributed |
| `approvals` | Human approvals collected |
| `files_changed` | Files modified in this commit |

### 18.3. Git Trailers

Commits include PVP metadata as git trailers:

```
feat(auth): implement JWT validation

Added JWT token validation middleware with RS256 support.

PVP-Session: ses_01HX7K9P4QZCVD3N8MYW6R5T2B
PVP-Decision: dec_lz4k8m_a1b2c3
PVP-Confidence: 0.85
PVP-Type: implementation
PVP-Tools: shell_execute,file_write
PVP-Approvers: alice,bob
```

### 18.4. Git Hooks

| Hook | Action |
|------|--------|
| `prepare-commit-msg` | Injects PVP trailers into commit message |
| `post-commit` | Stores extended metadata in `refs/notes/pvp` |
| `pre-push` | Validates PVP metadata coverage |

### 18.5. Decision Trees

A DecisionTree maps the session's branching conversation to git history:

- PVP sessions → git repositories
- PVP forks → git branches
- PVP messages → git commits (many-to-one)
- PVP merges → git merge commits

### 18.6. Conversation Threads

A ConversationThread is a compact, serializable format for storing the conversation that led to a commit. Threads can be stored in:

- Git notes (`refs/notes/pvp`)
- Commit trailers (base64-encoded compact thread)
- External storage with git references

---

## 19. Transport Bindings

PVP is transport-agnostic. This section defines requirements for transport implementations.

### 19.1. WebSocket (Primary)

- URI: `ws://` or `wss://`
- Messages are JSON-serialized `MessageEnvelope` objects, one per WebSocket text frame.
- Implementations MUST support automatic reconnection with exponential backoff.
- The server SHOULD replay missed messages on reconnection (up to a configurable history window).

### 19.2. MCP (Model Context Protocol)

- PVP messages are carried as MCP tool calls and tool results.
- Defined for future specification.

### 19.3. HTTP

- Polling-based transport for environments where WebSocket is unavailable.
- `POST /sessions/{id}/messages` to send a message.
- `GET /sessions/{id}/messages?after={id}` to receive messages.

### 19.4. stdio

- Newline-delimited JSON on stdin/stdout.
- One `MessageEnvelope` per line.
- Used for local agent integration.

### 19.5. Transport Requirements

All transports MUST:

1. Deliver messages in order per sender (per-sender FIFO).
2. Deliver messages at most once (or exactly once where possible).
3. Support graceful disconnection with `session.leave`.
4. Propagate transport-layer errors as `error` messages with code `TRANSPORT_ERROR`.

---

## 20. Security Considerations

### 20.1. Authentication

PVP does not define an authentication mechanism. Transport layers SHOULD implement authentication (e.g., JWT tokens in WebSocket upgrade, API keys for HTTP). The `session.join` payload includes an optional `token` field for transport-layer auth.

### 20.2. Authorization

The server MUST enforce role-based access control on all message types. The permission matrix in Section 7.2 is normative.

### 20.3. Secret Handling

- Secret values MUST NOT be logged, persisted to disk, or included in message history.
- Secret values MUST be scoped to specified participants.
- Expired secrets MUST be deleted.
- Transport SHOULD use TLS (wss://, https://) when secrets are shared.

### 20.4. Tool Execution

- Tool proposals include a `risk_level` assessment. Servers SHOULD require gates for `"high"` and `"critical"` risk tools regardless of session configuration.
- Shell commands executed by agents SHOULD use array-based argument passing to prevent injection attacks.
- Agents SHOULD implement command safety categorization.

### 20.5. Rate Limiting

Servers SHOULD implement rate limiting per participant. The `RATE_LIMITED` error code is defined for this purpose.

---

## 21. IANA Considerations

This document defines no IANA registrations. A future version may register a WebSocket subprotocol identifier (`pvp.v1`).

---

## Appendix A: Example Session

```json
// 1. Alice creates a session
{
  "v": 1,
  "id": "01HX7K9P4QZCVD3N8MYW6R5T2B",
  "ts": "2026-01-30T20:00:00.000Z",
  "session": "ses_01HX7K9P4QZCVD3N8MYW6R5T2B",
  "sender": "alice_01",
  "type": "session.create",
  "payload": {
    "name": "Auth Feature",
    "config": {
      "require_approval_for": ["shell_execute", "file_write"],
      "default_gate_quorum": { "type": "any", "count": 1 },
      "allow_forks": true,
      "max_participants": 5,
      "ordering_mode": "causal",
      "on_participant_timeout": "skip",
      "heartbeat_interval_seconds": 30,
      "idle_timeout_seconds": 120,
      "away_timeout_seconds": 300
    }
  }
}

// 2. Claude agent joins
{
  "v": 1,
  "id": "01HX7K9Q5RAEWF4SG9NX7S6U3C",
  "ts": "2026-01-30T20:00:01.000Z",
  "session": "ses_01HX7K9P4QZCVD3N8MYW6R5T2B",
  "sender": "claude_01",
  "type": "session.join",
  "payload": {
    "participant": {
      "id": "claude_01",
      "name": "Claude Assistant",
      "type": "agent",
      "roles": ["driver"],
      "capabilities": ["prompt"],
      "transport": "websocket"
    },
    "supported_versions": [1]
  }
}

// 3. Alice submits a prompt
{
  "v": 1,
  "id": "01HX7KAR6SBFXG5TH0PY8T7V4D",
  "ts": "2026-01-30T20:01:00.000Z",
  "session": "ses_01HX7K9P4QZCVD3N8MYW6R5T2B",
  "sender": "alice_01",
  "type": "prompt.submit",
  "payload": {
    "content": "Implement JWT authentication middleware",
    "target_agent": "claude_01",
    "contributors": ["alice_01"],
    "context_keys": ["requirements"]
  }
}

// 4. Claude proposes a shell command (triggers gate)
{
  "v": 1,
  "id": "01HX7KBS7TCGYH6UI1QZ9U8W5E",
  "ts": "2026-01-30T20:01:30.000Z",
  "session": "ses_01HX7K9P4QZCVD3N8MYW6R5T2B",
  "sender": "claude_01",
  "type": "tool.propose",
  "payload": {
    "tool_name": "shell_execute",
    "arguments": { "command": ["npm", "install", "jsonwebtoken"] },
    "agent": "claude_01",
    "risk_level": "medium",
    "description": "Install jsonwebtoken package",
    "requires_approval": true,
    "category": "shell_execute"
  }
}

// 5. Alice approves
{
  "v": 1,
  "id": "01HX7KCT8UDHZI7VJ2RA0V9X6F",
  "ts": "2026-01-30T20:01:45.000Z",
  "session": "ses_01HX7K9P4QZCVD3N8MYW6R5T2B",
  "sender": "alice_01",
  "type": "tool.approve",
  "ref": "01HX7KBS7TCGYH6UI1QZ9U8W5E",
  "payload": {
    "tool_proposal": "01HX7KBS7TCGYH6UI1QZ9U8W5E",
    "approver": "alice_01",
    "comment": "Go ahead"
  }
}
```

---

## Appendix B: JSON Schema

A machine-readable JSON Schema for all PVP message types is available at:

```
https://pvp.codes/schema/v1/pvp.schema.json
```

---

## Appendix C: Changelog

| Version | Date | Changes |
|---------|------|---------|
| 1.0.0-draft | January 2026 | Initial draft specification |
