#!/usr/bin/env node
/**
 * PVP Claude Agent - AI participant for the Pair Vibecoding Protocol
 *
 * The Claude Agent connects to a PVP server as an AI participant, processing
 * prompts, proposing tool executions, and integrating with MCP (Model Context Protocol)
 * servers for extended capabilities.
 *
 * @module agent
 *
 * ## Runtime Requirement
 *
 * **⚠️ IMPORTANT: This module requires the Bun runtime.**
 *
 * The agent uses `Bun.spawn` for secure shell command execution with:
 * - Array-based arguments to prevent shell injection
 * - Native subprocess streaming
 * - Built-in timeout and buffer limits
 *
 * ```bash
 * # Install Bun if not already installed
 * curl -fsSL https://bun.sh/install | bash
 *
 * # Run the agent
 * npm run agent -- --server ws://localhost:3000 --session <id>
 * ```
 *
 * @example
 * ```typescript
 * // Programmatic usage (requires Bun runtime)
 * import { startAgent } from "@agrathwohl/pvp/agent";
 *
 * const agent = await startAgent({
 *   url: "ws://localhost:3000",
 *   session: "01ARZ3NDEKTSV4RRFFQ69G5FAV",
 *   name: "Claude Assistant",
 *   model: "claude-sonnet-4-5-20250929",
 *   apiKey: process.env.ANTHROPIC_API_KEY
 * });
 * ```
 *
 * @example
 * ```bash
 * # CLI usage
 * pvp-agent --server ws://localhost:3000 --session abc123 --name "My Agent"
 *
 * # With MCP servers
 * pvp-agent --server ws://localhost:3000 --session abc123 --mcp-config ./mcp.json
 * ```
 */
import { ClaudeAgent } from "./claude-agent.js";
export { ClaudeAgent } from "./claude-agent.js";
export { loadMCPConfig, validateMCPConfig } from "../config/mcp-config.js";
/**
 * Configuration options for starting a Claude agent.
 *
 * @property url - WebSocket server URL (default: "ws://localhost:3000")
 * @property session - **Required**. Session ID to join.
 * @property name - Agent display name (default: "Claude Assistant")
 * @property model - Claude model identifier (default: "claude-sonnet-4-5-20250929")
 * @property apiKey - Anthropic API key. Falls back to ANTHROPIC_API_KEY env var.
 * @property mcpConfig - Path to MCP servers configuration JSON file
 *
 * @example
 * ```typescript
 * const options: AgentOptions = {
 *   url: "ws://localhost:3000",
 *   session: "01ARZ3NDEKTSV4RRFFQ69G5FAV",
 *   name: "Code Assistant",
 *   model: "claude-sonnet-4-5-20250929",
 *   apiKey: process.env.ANTHROPIC_API_KEY,
 *   mcpConfig: "./mcp-servers.json"
 * };
 * ```
 */
export interface AgentOptions {
    /** WebSocket server URL (e.g., "ws://localhost:3000") */
    url?: string;
    /** Session ID to join. **Required** - agent must join an existing session. */
    session?: string;
    /** Display name shown to other participants */
    name?: string;
    /** Claude model to use (e.g., "claude-sonnet-4-5-20250929", "claude-opus-4-20250514") */
    model?: string;
    /** Anthropic API key. If not provided, uses ANTHROPIC_API_KEY environment variable. */
    apiKey?: string;
    /** Path to JSON file containing MCP server configurations */
    mcpConfig?: string;
    /** Local working directory path. If set, ignores server-provided path (for remote connections) */
    localWorkDir?: string;
}
/**
 * Start a Claude agent programmatically.
 *
 * Creates and connects a Claude AI agent to a PVP session. The agent will:
 * - Listen for prompts from human participants
 * - Generate responses using the Claude API
 * - Propose tool executions through the approval gate system
 * - Execute approved tools (shell commands, file operations)
 * - Integrate with MCP servers if configured
 *
 * **⚠️ Requires Bun runtime** - Will throw if run in Node.js.
 *
 * @param options - Agent configuration options
 * @returns Promise resolving to the connected ClaudeAgent instance
 * @throws Error if session ID is not provided
 * @throws Error if Anthropic API key is not available
 * @throws Error if running in Node.js instead of Bun
 *
 * @example
 * ```typescript
 * import { startAgent } from "@agrathwohl/pvp/agent";
 *
 * // Basic usage
 * const agent = await startAgent({
 *   session: "01ARZ3NDEKTSV4RRFFQ69G5FAV",
 *   apiKey: "sk-ant-..."
 * });
 *
 * // Agent is now connected and processing prompts
 * console.log("Agent ready!");
 *
 * // Later: disconnect gracefully
 * await agent.disconnect();
 * ```
 *
 * @example
 * ```typescript
 * // With MCP servers for extended capabilities
 * const agent = await startAgent({
 *   url: "ws://localhost:3000",
 *   session: sessionId,
 *   name: "Full-Stack Assistant",
 *   mcpConfig: "./mcp-config.json"
 * });
 *
 * // MCP config example (mcp-config.json):
 * // {
 * //   "mcpServers": {
 * //     "filesystem": {
 * //       "command": "npx",
 * //       "args": ["-y", "@anthropic-ai/mcp-server-filesystem", "/workspace"]
 * //     }
 * //   }
 * // }
 * ```
 *
 * @example
 * ```typescript
 * // Full workflow: server, TUI, and agent
 * import { startServer, startTUI } from "@agrathwohl/pvp";
 * import { startAgent } from "@agrathwohl/pvp/agent";  // Separate import for Bun
 * import { ulid } from "ulid";
 *
 * const sessionId = ulid();
 *
 * // Terminal 1: Server (Node.js)
 * const server = await startServer({ port: 3000 });
 *
 * // Terminal 2: Human TUI (Node.js)
 * await startTUI({
 *   url: "ws://localhost:3000",
 *   session: sessionId,
 *   name: "Alice"
 * });
 *
 * // Terminal 3: Agent (Bun only)
 * const agent = await startAgent({
 *   url: "ws://localhost:3000",
 *   session: sessionId,
 *   name: "Claude"
 * });
 * ```
 */
export declare function startAgent(options?: AgentOptions): Promise<ClaudeAgent>;
