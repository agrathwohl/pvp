/**
 * # PVP - Pair Vibecoding Protocol
 *
 * Multiplayer human-AI collaboration framework with approval gates and decision tracking.
 *
 * ## Overview
 *
 * PVP enables structured collaboration between humans and AI agents with:
 * - **Approval Gates**: Human oversight for AI-proposed actions
 * - **Decision Tracking**: Git-integrated history of all decisions
 * - **Real-time Collaboration**: WebSocket-based multiplayer sessions
 * - **MCP Integration**: Extensible tool capabilities via Model Context Protocol
 *
 * ## Quick Start
 *
 * @example
 * ```typescript
 * import { startServer, startTUI } from "@agrathwohl/pvp";
 *
 * // Terminal 1: Start the server
 * const server = await startServer({ port: 3000 });
 *
 * // Terminal 2: Start TUI (creates new session)
 * await startTUI({
 *   url: "ws://localhost:3000",
 *   name: "Alice"
 * });
 * // Note the session ID printed to console
 *
 * // Terminal 3: Join with agent (requires Bun)
 * // bun run agent -- --server ws://localhost:3000 --session <id>
 * ```
 *
 * ## Module Exports
 *
 * - **pvp** (main): Server, TUI, protocol, transports (Node.js compatible)
 * - **pvp/protocol**: Message types, utilities, decision schemas
 * - **pvp/server**: PVPServer class, startServer()
 * - **pvp/tui**: TUI App, startTUI()
 * - **pvp/agent**: ClaudeAgent, startAgent() (**Bun only** - import separately)
 * - **pvp/transports**: WebSocket client/server
 * - **pvp/git-hooks**: Git bridge service for decision tracking
 *
 * **Note**: The agent module requires Bun runtime and must be imported separately:
 * ```typescript
 * import { startAgent } from "@agrathwohl/pvp/agent";
 * ```
 *
 * ## CLI Commands
 *
 * ```bash
 * # Start server
 * pvp-server --port 3000
 *
 * # Start TUI client
 * pvp-tui --server ws://localhost:3000
 *
 * # Start agent (requires Bun)
 * pvp-agent --server ws://localhost:3000 --session <id>
 *
 * # Install git hooks for decision tracking
 * pvp install-hooks
 * ```
 *
 * @packageDocumentation
 * @module pvp
 */

// Protocol types and utilities
export * from "./protocol/index.js";

// Transport layer
export * from "./transports/index.js";

// Server
export {
  PVPServer,
  startServer,
  mergeServerConfig,
  type ServerConfig
} from "./server/index.js";

// TUI
export {
  App as TUIApp,
  startTUI,
  useTUIStore,
  type TUIOptions
} from "./tui/index.js";

// Agent exports removed from main entry point - requires Bun runtime
// Import directly: import { startAgent } from "@agrathwohl/pvp/agent";

// Git hooks bridge
export { PvpGitBridgeService } from "./git-hooks/bridge/bridge-service.js";
export * from "./git-hooks/bridge/types.js";
