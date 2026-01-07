# PVP API Reference

Complete API documentation for the Pair Vibecoding Protocol npm package.

## Table of Contents

- [Installation](#installation)
- [Quick Start](#quick-start)
- [Server API](#server-api)
- [TUI API](#tui-api)
- [Agent API](#agent-api)
- [Protocol API](#protocol-api)
- [Transport API](#transport-api)
- [Git Bridge API](#git-bridge-api)
- [CLI Reference](#cli-reference)
- [Configuration](#configuration)

---

## Installation

```bash
npm install github:agrathwohl/pvp
```

### Runtime Requirements

| Component | Runtime | Notes |
|-----------|---------|-------|
| Server | Node.js 18+ | WebSocket server, session management |
| TUI | Node.js 18+ | Terminal interface (Ink/React) |
| Agent | **Bun** | Required for shell execution security |

---

## Quick Start

### Programmatic Usage

```typescript
import { startServer, startTUI } from "@agrathwohl/pvp";

// Start server
const server = await startServer({ port: 3000 });

// Start TUI in another process
await startTUI({
  url: "ws://localhost:3000",
  name: "Alice"
});
```

### CLI Usage

```bash
# Start server
pvp-server --port 3000

# Start TUI
pvp-tui --server ws://localhost:3000 --name Alice

# Start agent (requires Bun)
pvp-agent --server ws://localhost:3000 --session <id>
```

---

## Server API

### `startServer(options?)`

Start a PVP server programmatically.

```typescript
import { startServer } from "@agrathwohl/pvp";

const server = await startServer({
  port: 3000,      // default: 3000
  host: "0.0.0.0"  // default: "0.0.0.0"
});
```

**Parameters:**

| Name | Type | Default | Description |
|------|------|---------|-------------|
| `options.port` | `number` | `3000` | Port to listen on |
| `options.host` | `string` | `"0.0.0.0"` | Host to bind to |

**Returns:** `Promise<PVPServer>`

---

### `PVPServer` Class

Core server class for session and connection management.

```typescript
import { PVPServer, mergeServerConfig } from "@agrathwohl/pvp/server";

const config = mergeServerConfig({ port: "8080" });
const server = new PVPServer(config);
```

#### Methods

##### `getConfig()`

Get current server configuration.

```typescript
const config = server.getConfig();
// { port: 3000, host: "0.0.0.0", git_dir: "/tmp/pvp-git" }
```

**Returns:** `ServerConfig`

##### `getGitDir()`

Get the git repository directory path.

```typescript
const gitDir = server.getGitDir();
// "/tmp/pvp-git"
```

**Returns:** `string`

##### `shutdown()`

Gracefully shut down the server.

```typescript
process.on("SIGTERM", () => {
  server.shutdown();
  process.exit(0);
});
```

**Returns:** `void`

---

### `mergeServerConfig(options)`

Merge CLI options with config file and defaults.

```typescript
import { mergeServerConfig } from "@agrathwohl/pvp/server";

const config = mergeServerConfig({
  port: "8080",
  config: "./server-config.json"
});
```

**Parameters:**

| Name | Type | Description |
|------|------|-------------|
| `options.port` | `string?` | Port number (parsed to int) |
| `options.host` | `string?` | Host address |
| `options.gitDir` | `string?` | Git repository directory |
| `options.config` | `string?` | Path to JSON config file |

**Returns:** `ServerConfig`

---

### `ServerConfig` Type

```typescript
interface ServerConfig {
  port: number;      // WebSocket server port
  host: string;      // Bind address
  git_dir: string;   // Git repository directory
}
```

---

## TUI API

### `startTUI(options?)`

Start the terminal user interface.

```typescript
import { startTUI } from "@agrathwohl/pvp/tui";

await startTUI({
  url: "ws://localhost:3000",
  session: "existing-session-id",  // omit to create new
  name: "Alice",
  role: "driver"
});
```

**Parameters:**

| Name | Type | Default | Description |
|------|------|---------|-------------|
| `options.url` | `string` | `"ws://localhost:3000"` | Server URL |
| `options.session` | `string?` | auto-generated | Session ID to join |
| `options.name` | `string` | `"User"` | Display name |
| `options.role` | `string` | `"driver"` | Initial role |

**Returns:** `Promise<void>`

---

### `TUIOptions` Interface

```typescript
interface TUIOptions {
  url?: string;      // WebSocket server URL
  session?: string;  // Session ID (omit to create new)
  name?: string;     // Display name
  role?: string;     // "driver" | "navigator"
}
```

---

### `useTUIStore()`

Zustand store hook for TUI state management.

```typescript
import { useTUIStore } from "@agrathwohl/pvp/tui";

function MyComponent() {
  const { messages, participants, sendMessage } = useTUIStore();
  // ...
}
```

**Returns:** TUI state and actions

---

## Agent API

> ⚠️ **Requires Bun runtime**

### `startAgent(options)`

Start a Claude AI agent.

```typescript
import { startAgent } from "@agrathwohl/pvp/agent";

const agent = await startAgent({
  url: "ws://localhost:3000",
  session: "session-id",  // Required
  name: "Claude Assistant",
  model: "claude-sonnet-4-5-20250929",
  apiKey: process.env.ANTHROPIC_API_KEY,
  mcpConfig: "./mcp-servers.json"
});
```

**Parameters:**

| Name | Type | Default | Description |
|------|------|---------|-------------|
| `options.url` | `string` | `"ws://localhost:3000"` | Server URL |
| `options.session` | `string` | **Required** | Session ID |
| `options.name` | `string` | `"Claude Assistant"` | Display name |
| `options.model` | `string` | `"claude-sonnet-4-5-20250929"` | Claude model |
| `options.apiKey` | `string?` | `ANTHROPIC_API_KEY` env | API key |
| `options.mcpConfig` | `string?` | - | MCP config file path |

**Returns:** `Promise<ClaudeAgent>`

**Throws:**
- `Error` if session ID not provided
- `Error` if API key not available
- `Error` if not running in Bun

---

### `AgentOptions` Interface

```typescript
interface AgentOptions {
  url?: string;        // WebSocket server URL
  session?: string;    // Session ID (required)
  name?: string;       // Display name
  model?: string;      // Claude model identifier
  apiKey?: string;     // Anthropic API key
  mcpConfig?: string;  // MCP config file path
}
```

---

### `ClaudeAgent` Class

AI agent that connects to PVP sessions.

```typescript
import { ClaudeAgent } from "@agrathwohl/pvp/agent";

const agent = new ClaudeAgent({
  serverUrl: "ws://localhost:3000",
  sessionId: "session-id",
  agentName: "Claude",
  model: "claude-sonnet-4-5-20250929",
  apiKey: "sk-ant-..."
});

await agent.connect();
// Agent now processes prompts

await agent.disconnect();
```

#### Methods

##### `connect()`

Connect to the PVP server and join the session.

```typescript
await agent.connect();
```

**Returns:** `Promise<void>`

##### `disconnect()`

Disconnect from the server.

```typescript
await agent.disconnect();
```

**Returns:** `Promise<void>`

##### `initializeMCP(configs)`

Initialize MCP server connections.

```typescript
import { loadMCPConfig } from "@agrathwohl/pvp/agent";

const configs = loadMCPConfig(rawConfig);
await agent.initializeMCP(configs);
```

**Parameters:**
- `configs: MCPServerConfig[]` - Array of MCP server configurations

**Returns:** `Promise<void>`

---

### MCP Configuration

```typescript
import { loadMCPConfig, validateMCPConfig } from "@agrathwohl/pvp/agent";

// Validate configuration
const validation = validateMCPConfig(rawConfig);
if (!validation.valid) {
  console.error(validation.errors);
}

// Load configuration
const configs = loadMCPConfig(rawConfig);
```

**MCP Config File Format:**

```json
{
  "mcpServers": {
    "filesystem": {
      "command": "npx",
      "args": ["-y", "@anthropic-ai/mcp-server-filesystem", "/workspace"]
    },
    "github": {
      "command": "npx",
      "args": ["-y", "@anthropic-ai/mcp-server-github"],
      "env": {
        "GITHUB_TOKEN": "ghp_..."
      }
    }
  }
}
```

---

## Protocol API

### `createMessage(type, session, sender, payload, options?)`

Create a PVP protocol message.

```typescript
import { createMessage } from "@agrathwohl/pvp/protocol";

const message = createMessage(
  "session.join",
  "session-id",
  "participant-id",
  {
    participant: {
      name: "Alice",
      type: "human",
      roles: ["driver"]
    }
  }
);
```

**Parameters:**

| Name | Type | Description |
|------|------|-------------|
| `type` | `PrimitiveType` | Message type |
| `session` | `string` | Session ID |
| `sender` | `string` | Participant ID |
| `payload` | `PayloadFor<T>` | Type-specific payload |
| `options.ref` | `string?` | Reference message ID |
| `options.seq` | `number?` | Sequence number |
| `options.causal_refs` | `string[]?` | Causal dependencies |
| `options.fork` | `string?` | Fork ID |

**Returns:** `MessageEnvelope<T>`

---

### `isMessageType(message, type)`

Type guard for message type checking.

```typescript
import { isMessageType } from "@agrathwohl/pvp/protocol";

if (isMessageType(message, "gate.vote")) {
  console.log(message.payload.decision);
}
```

**Returns:** `boolean`

---

### `serializeMessage(message)`

Serialize message to JSON string.

```typescript
const json = serializeMessage(message);
```

**Returns:** `string`

---

### `deserializeMessage(data)`

Parse JSON string to message object.

```typescript
const message = deserializeMessage(jsonString);
```

**Returns:** `AnyMessage`

---

### Message Types

| Category | Types |
|----------|-------|
| Session | `session.create`, `session.join`, `session.leave`, `session.end` |
| Participant | `participant.announce`, `participant.role_change` |
| Heartbeat | `heartbeat.ping`, `heartbeat.pong` |
| Presence | `presence.update` |
| Context | `context.add`, `context.update`, `context.remove` |
| Prompt | `prompt.draft`, `prompt.submit`, `prompt.amend` |
| Response | `response.start`, `response.chunk`, `response.end` |
| Tool | `tool.propose`, `tool.approve`, `tool.reject`, `tool.execute`, `tool.result` |
| Gate | `gate.request`, `gate.vote`, `gate.resolve` |
| Error | `error` |

---

## Transport API

### `Transport` Interface

Client-side transport for connecting to servers.

```typescript
import type { Transport } from "@agrathwohl/pvp/transports";

interface Transport {
  readonly participantId: string;
  send(message: AnyMessage): Promise<void>;
  onMessage(handler: (msg: AnyMessage) => void): void;
  onClose(handler: () => void): void;
  close(): void;
  isConnected(): boolean;
}
```

---

### `TransportServer` Interface

Server-side transport for handling connections.

```typescript
import type { TransportServer } from "@agrathwohl/pvp/transports";

interface TransportServer {
  onConnection(handler: (transport: Transport) => void): void;
  broadcast(message: AnyMessage, filter?: (id: string) => boolean): void;
  close(): void;
}
```

---

### `WebSocketTransport` Class

WebSocket client transport implementation.

```typescript
import { WebSocketTransport } from "@agrathwohl/pvp/transports";

const transport = new WebSocketTransport(
  "ws://localhost:3000",
  "participant-id"
);

await transport.connect();

transport.onMessage((msg) => console.log(msg));

await transport.send(message);
```

---

## Git Bridge API

### `PvpGitBridgeService` Class

Service for git decision tracking integration.

```typescript
import { PvpGitBridgeService } from "@agrathwohl/pvp/git-hooks";

const bridge = new PvpGitBridgeService();

await bridge.start();

// Handle messages
bridge.onMessage(message);

// Session lifecycle
bridge.onSessionStart(sessionId, participants);
bridge.onSessionEnd(sessionId);

// Update participants
bridge.updateParticipants(participantInfos);

await bridge.stop();
```

---

## CLI Reference

### `pvp` (Main CLI)

```bash
pvp <command> [options]

Commands:
  server         Start PVP server
  tui            Start TUI client
  agent          Start Claude agent (Bun)
  bridge         Manage bridge service
  install-hooks  Install git hooks
```

### `pvp-server`

```bash
pvp-server [options]

Options:
  -p, --port <port>      Port (default: 3000)
  -H, --host <host>      Host (default: 0.0.0.0)
  -g, --git-dir <path>   Git directory
  -c, --config <file>    Config file
```

### `pvp-tui`

```bash
pvp-tui [options]

Options:
  -s, --server <url>     Server URL (required)
  --session <id>         Session ID (omit for new)
  -n, --name <name>      Display name (default: User)
  -r, --role <role>      Role (default: driver)
```

### `pvp-agent`

```bash
pvp-agent [options]

Options:
  -s, --server <url>     Server URL (required)
  --session <id>         Session ID (required)
  -n, --name <name>      Agent name
  -m, --model <model>    Claude model
  -k, --api-key <key>    API key
  --mcp-config <file>    MCP config file
```

---

## Configuration

### Server Configuration File

```json
{
  "port": 3000,
  "host": "0.0.0.0",
  "git_dir": "/var/pvp/repos"
}
```

### Session Configuration

```typescript
interface SessionConfig {
  require_approval_for: ToolCategory[];
  default_gate_quorum: QuorumRule;
  allow_forks: boolean;
  max_participants: number;
  ordering_mode: "causal" | "total";
  on_participant_timeout: "wait" | "skip" | "pause_session";
  heartbeat_interval_seconds: number;
  idle_timeout_seconds: number;
  away_timeout_seconds: number;
}
```

### Quorum Rules

```typescript
type QuorumRule =
  | { type: "any"; count: number }
  | { type: "all" }
  | { type: "role"; role: string; count: number }
  | { type: "specific"; participants: string[] }
  | { type: "majority" };
```

---

## TypeScript Support

Full TypeScript support with exported types:

```typescript
import type {
  // Server
  ServerConfig,
  PVPServer,

  // TUI
  TUIOptions,

  // Protocol
  AnyMessage,
  MessageEnvelope,
  SessionConfig,
  ParticipantInfo,

  // Transport
  Transport,
  TransportServer
} from "@agrathwohl/pvp";

// Agent types require separate import (Bun only)
import type { AgentOptions, ClaudeAgent } from "@agrathwohl/pvp/agent";
```

---

## Error Handling

### Common Errors

| Error | Cause | Solution |
|-------|-------|----------|
| `Session not found` | Invalid session ID | Use valid session ID |
| `API key required` | Missing Anthropic key | Set `ANTHROPIC_API_KEY` env |
| `Bun runtime required` | Running agent in Node | Use `bun run` for agent |
| `Config file not found` | Invalid config path | Check file path |

### Error Message Format

```typescript
{
  type: "error",
  payload: {
    code: "SESSION_NOT_FOUND",
    message: "Session abc123 not found",
    recoverable: false,
    related_to: "msg-id"
  }
}
```
