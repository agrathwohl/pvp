# Pair Vibecoding Protocol (PVP)

A **multiplayer, role-based coordination protocol** for human-AI collaborative development.

## Overview

PVP is NOT a chatbot. It's a coordination layer where multiple humans and AI agents collaborate in real-time to:

- Shape prompts collaboratively
- Observe AI reasoning
- Gate actions before execution
- Record auditable streams of decisions

**The code is a side effect; the real artifact is the recorded, auditable stream of human decisions mediated by AI execution.**

## Features

- ✅ Real-time multiplayer collaboration
- ✅ Role-based access control (driver, navigator, adversary, observer, approver, admin)
- ✅ Approval gates for high-risk operations
- ✅ Live streaming of AI thinking and responses
- ✅ Context sharing and management
- ✅ Session forking and merging
- ✅ Interrupt mechanisms for human intervention
- ✅ WebSocket transport with reconnection
- ✅ Terminal UI (TUI) client
- ✅ Structured logging and monitoring
- ✅ **Decision tracking** - Git-based audit trail with automatic commit metadata

## Installation

```bash
# Install dependencies
npm install

# Install Bun (required for agent component)
curl -fsSL https://bun.sh/install | bash

# Build the project
npm run build
```

## Runtime Requirements

This project uses different runtimes per component for optimal performance and security:

| Component | Runtime | Command | Notes |
|-----------|---------|---------|-------|
| **Server** | Node.js | `npm run server` | WebSocket server, session management |
| **TUI** | Node.js | `npm run tui` | Terminal user interface client |
| **Agent** | Bun | `npm run agent` | Claude AI agent with shell execution |

### Why Bun for Agent?

The agent component requires Bun runtime because its shell executor (`src/agent/tools/shell-executor.ts`) uses `Bun.spawn` for secure command execution:

- **Security**: Array-based arguments prevent shell injection attacks
- **Performance**: Native subprocess streaming without external dependencies
- **Safety**: Built-in timeout and buffer limits

**Important**: Do NOT run the agent with `tsx` or Node.js. It will fail with module not found errors. Always use `npm run agent`.

## Quick Start

### 1. Start the Server

```bash
npm run server
# or
npm run server -- --port 3000 --host 0.0.0.0
```

### 2. Connect with TUI Client

```bash
# Create a new session
npm run tui -- --server ws://localhost:3000 --name "Alice" --role driver

# Join an existing session
npm run tui -- --server ws://localhost:3000 --session <session-id> --name "Bob" --role navigator
```

### 3. Connect AI Agent (Optional)

```bash
# Join an existing session with Claude AI agent
npm run agent -- --server ws://localhost:3000 --session <session-id>

# With custom settings
npm run agent -- \
  --server ws://localhost:3000 \
  --session <session-id> \
  --name "Claude" \
  --model claude-sonnet-4-5-20250929 \
  --api-key sk-ant-...

# Note: Requires ANTHROPIC_API_KEY environment variable or --api-key flag
# Get your API key at: https://console.anthropic.com/
```

**Agent Capabilities**:
- Native Anthropic tool use API for shell command execution
- Command safety categorization (safe/low/medium/high/critical)
- Approval gates for risky operations
- Real-time streaming output
- Multi-turn conversation with tool results

## Architecture

```
┌─────────────────┐      ┌─────────────────┐      ┌─────────────┐
│  TUI Client     │─────▶│  PVP Server     │─────▶│   Storage   │
│  (Ink/React)    │      │  (WebSocket)    │      │  (SQLite)   │
└─────────────────┘      └─────────────────┘      └─────────────┘
                                  │
                         ┌────────┴────────┐
                         │   Protocol      │
                         │  - 40+ msgs     │
                         │  - Gates        │
                         │  - Context      │
                         │  - Forks        │
                         └─────────────────┘
```

## Decision Tracking

PVP includes an integrated **git decision tracking system** that automatically captures session context and embeds it into git commits.

### How It Works

```
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│   PVP Server    │────▶│  Bridge Service │────▶│   Git Hooks     │
│                 │     │  (port 9847)    │     │                 │
│  • Messages     │     │  • State mgmt   │     │  • Trailers     │
│  • Approvals    │     │  • HTTP API     │     │  • Git notes    │
│  • Tool exec    │     │  • Webhooks     │     │  • Validation   │
└─────────────────┘     └─────────────────┘     └─────────────────┘
```

### Components

1. **Bridge Service** - Local daemon that maintains session state
   - Starts automatically with the PVP server
   - HTTP API at `http://localhost:9847`
   - Unix socket at `/tmp/pvp-git-bridge.sock`

2. **TUI Integration** - Real-time decision tracking display
   - Shows messages, prompts, approvals since last commit
   - Displays tool execution summary
   - Polls bridge service every 5 seconds

3. **Git Hooks** - Automatic commit metadata injection
   - `prepare-commit-msg` - Injects PVP trailers
   - `post-commit` - Stores extended metadata in git-notes
   - `pre-push` - Validates PVP metadata coverage

### TUI Decision Display

When connected, the TUI shows a decision tracking panel:

```
┌─────────────────────────────────────────────────────────────────┐
│ 📊 Decision Tracking | Msgs: 15 | Prompts: 3 | Approvals: 2   │
│ Tools: shell_execute, file_write | Last: a1b2c3d              │
└─────────────────────────────────────────────────────────────────┘
```

### Commit Message Format

Commits include PVP trailers:

```
feat(auth): implement JWT validation [pvp:msg-01]

Added JWT token validation middleware.

PVP-Session: ses_01HX7K9P4QZCVD3N8MYW6R5T2B
PVP-Messages: msg-01,msg-03,msg-05
PVP-Confidence: 0.85
Decision-By: human:alice,ai:claude
```

### API Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/commit-context` | GET | Current session metrics |
| `/extended-metadata` | GET | Full session metadata |
| `/status` | GET | Bridge service status |
| `/health` | GET | Health check |

### Documentation

- [Architecture Guide](./docs/DECISION_TRACKING_ARCHITECTURE.md) - Full system design
- [Git Commit Protocol](./docs/GIT_COMMIT_PROTOCOL.md) - Commit format specification
- [Git Hooks README](./src/git-hooks/README.md) - Hook installation and usage

## Core Concepts

### Participants

- **Human**: driver, navigator, adversary, observer, approver, admin
- **Agent**: AI assistants that execute actions

### Message Types

- **Session**: create, join, leave, end, config_update
- **Participant**: announce, role_change
- **Heartbeat**: ping, pong
- **Presence**: active, idle, away, disconnected
- **Context**: add, update, remove (files, references, structured data)
- **Secrets**: share, revoke (API keys, credentials)
- **Prompts**: draft, submit, amend
- **Thinking**: start, chunk, end (AI reasoning streams)
- **Response**: start, chunk, end (AI output streams)
- **Tools**: propose, approve, reject, execute, result
- **Gates**: request, approve, reject, timeout (approval workflows)
- **Interrupts**: raise, acknowledge (human intervention)
- **Forks**: create, switch (parallel exploration)
- **Merge**: propose, execute (combine forks)

### Approval Gates

Gates require human approval before executing high-risk operations:

```typescript
// Configure which operations require approval
const config: SessionConfig = {
  require_approval_for: ["file_write", "shell_execute", "deploy"],
  default_gate_quorum: { type: "any", count: 2 }, // Require 2 approvals
  // ...
};
```

**Quorum Rules**:

- `any`: N approvals from anyone
- `all`: All approvers must approve
- `role`: N approvals from specific role
- `specific`: Specific participants must approve
- `majority`: >50% of approvers

### Context Management

Share context between participants:

```typescript
const contextMsg = createMessage("context.add", sessionId, participantId, {
  key: "requirements",
  content_type: "file",
  content: fileContents,
  visible_to: ["agent_01"], // Optional: restrict visibility
});
```

## Examples

### Basic Session

```typescript
import { WebSocketClient } from "./src/transports/websocket.js";
import { createMessage } from "./src/protocol/messages.js";
import { ulid } from "./src/utils/ulid.js";

const client = new WebSocketClient("ws://localhost:3000", ulid());

client.on("connected", () => {
  const createMsg = createMessage("session.create", ulid(), participantId, {
    name: "My Session",
    config: {
      /* ... */
    },
  });
  client.send(createMsg);
});

client.connect();
```

See `examples/` directory for complete examples:

- `basic-session.ts` - Single participant session
- `multi-participant.ts` - Multiple humans collaborating

## TUI Controls

| Key          | Mode    | Action                 |
| ------------ | ------- | ---------------------- |
| `p`          | stream  | Start composing prompt |
| `Ctrl+Enter` | compose | Submit prompt          |
| `Esc`        | compose | Cancel composition     |
| `a`          | gate    | Approve gate           |
| `r`          | gate    | Reject gate            |
| `t`          | stream  | Toggle thinking panel  |
| `Ctrl+C`     | any     | Exit                   |

## Protocol Specification

### Message Envelope

Every message follows this structure:

```typescript
{
  v: 1,                    // Protocol version
  id: string,              // Message ID (ULID)
  ts: string,              // ISO timestamp
  session: string,         // Session ID
  sender: string,          // Participant ID
  type: string,            // Message type
  ref?: string,            // Reference to another message
  seq?: number,            // Sequence number (total ordering)
  causal_refs?: string[],  // Causal dependencies
  fork?: string,           // Fork ID
  payload: object          // Type-specific payload
}
```

### Session Configuration

```typescript
{
  require_approval_for: ToolCategory[],
  default_gate_quorum: QuorumRule,
  allow_forks: boolean,
  max_participants: number,
  ordering_mode: "causal" | "total",
  on_participant_timeout: "wait" | "skip" | "pause_session",
  heartbeat_interval_seconds: number,
  idle_timeout_seconds: number,
  away_timeout_seconds: number
}
```

## Transport

### WebSocket (Primary)

Real-time bidirectional communication for TUI clients.

**Server**: `src/transports/websocket.ts`
**Client**: Automatic reconnection with exponential backoff

### T.140 (Audio Integration)

Experimental support for T.140 RTP streams for audio transcriptions (e.g., from meetings).

See `src/transports/t140.ts` for implementation.

## Storage

- **Memory**: In-memory storage for MVP (default)
- **SQLite**: Persistent content-addressed storage

```typescript
import { SQLiteStorage } from "./src/storage/sqlite.js";

const storage = new SQLiteStorage("./pvp.db");
await storage.store(hash, Buffer.from(content));
```

## Development

```bash
# Watch mode (server)
npm run dev

# Type checking
npm run build

# Run tests
npm test
```

## API

### Creating Messages

```typescript
import { createMessage } from "./src/protocol/messages.js";

const message = createMessage(
  "prompt.submit", // type
  sessionId, // session
  participantId, // sender
  {
    // payload
    content: "Build a login form",
    target_agent: "claude_01",
    contributors: [participantId],
    context_keys: ["requirements"],
  },
);
```

### Permission Checks

```typescript
import { ParticipantManager } from "./src/server/participant.js";

const pm = new ParticipantManager();

if (pm.canPrompt(participant)) {
  // Submit prompt
}

if (pm.canApprove(participant)) {
  // Approve gate
}
```

### Gate Evaluation

```typescript
import { GateManager } from "./src/server/gates.js";

const gm = new GateManager();
const gate = gm.createGate(gateRequest);

gm.addApproval(gate, approverId);

const { met, reason } = gm.evaluateQuorum(gate, participants);
```

## Production Deployment

### Environment Variables

```bash
LOG_LEVEL=info        # Logging level (debug, info, warn, error)
NODE_ENV=production   # Environment
```

### Running in Production

```bash
# Build
npm run build

# Run server
NODE_ENV=production npm run server -- --port 3000

# Or with PM2
pm2 start dist/server/index.js --name pvp-server
```

## Roadmap

- [x] Unit tests (protocol, session, gates, decision tracking)
- [x] Integration tests (MCP server integration)
- [x] Decision tracking system (git-based audit trail)
- [ ] T.140 audio transport integration
- [ ] MCP transport support
- [ ] Agent adapters (Claude, OpenAI, etc.)
- [ ] Persistent session recovery
- [ ] Message replay functionality
- [ ] Web UI client
- [ ] Enhanced fork/merge workflows
- [ ] Decision tree visualization

## Contributing

This is an implementation of the PVP specification. Contributions should:

1. Follow the protocol specification precisely
2. Maintain type safety (TypeScript strict mode)
3. Include tests for new features
4. Use structured logging (pino)

## License

MIT

## Credits

Built following the Pair Vibecoding Protocol specification.
