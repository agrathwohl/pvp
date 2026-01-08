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

// Runtime validation
if (typeof Bun === 'undefined') {
  console.error(`
❌ ERROR: This agent requires Bun runtime.

Current runtime: Node.js
Required runtime: Bun

Why Bun?
  The agent's shell executor uses Bun.spawn for secure command execution:
  - Array-based arguments prevent shell injection attacks
  - Native subprocess streaming without external dependencies
  - Built-in timeout and buffer limits

Installation:
  curl -fsSL https://bun.sh/install | bash

Then run:
  npm run agent -- --server <url> --session <id>

Do NOT use: tsx src/agent/index.ts
`);
  process.exit(1);
}

import { Command } from "commander";
import { readFileSync } from "fs";
import { ClaudeAgent } from "./claude-agent.js";
import { logger } from "../utils/logger.js";
import { loadMCPConfig, validateMCPConfig } from "../config/mcp-config.js";

const program = new Command();

program
  .name("pvp-agent")
  .description("Claude AI Agent for Pair Vibecoding Protocol")
  .requiredOption("-s, --server <url>", "WebSocket server URL (e.g., ws://localhost:3000)")
  .requiredOption("--session <id>", "Session ID to join")
  .option("-n, --name <name>", "Agent display name", "Claude Assistant")
  .option("-m, --model <model>", "Claude model to use", "claude-sonnet-4-5-20250929")
  .option("-k, --api-key <key>", "Anthropic API key (or set ANTHROPIC_API_KEY env var)")
  .option("--mcp-config <file>", "Path to MCP servers configuration file (JSON)")
  .option("-l, --local [path]", "Use local working directory instead of server-provided path. Optional path argument specifies the directory (defaults to cwd)")
  .action(async (options) => {
    const { server, session, name, model, apiKey, mcpConfig, local } = options;

    // Validate API key
    const finalApiKey = apiKey || process.env.ANTHROPIC_API_KEY;
    if (!finalApiKey) {
      console.error("❌ Error: Anthropic API key required");
      console.error("\nProvide via:");
      console.error("  1. --api-key flag: --api-key sk-ant-...");
      console.error("  2. Environment variable: export ANTHROPIC_API_KEY=sk-ant-...");
      console.error("\nGet your API key at: https://console.anthropic.com/");
      process.exit(1);
    }

    // Resolve local working directory
    const localWorkDir = local ? (typeof local === "string" ? local : process.cwd()) : undefined;

    console.log("🤖 Starting Claude AI Agent");
    console.log(`   Server: ${server}`);
    console.log(`   Session: ${session}`);
    console.log(`   Name: ${name}`);
    console.log(`   Model: ${model}`);
    if (localWorkDir) {
      console.log(`   Working Dir: ${localWorkDir}`);
    }
    console.log();

    try {
      const agent = new ClaudeAgent({
        serverUrl: server,
        sessionId: session,
        agentName: name,
        model,
        apiKey: finalApiKey,
        localWorkDir,
      });

      // Initialize MCP servers if config provided
      if (mcpConfig) {
        console.log(`📦 Loading MCP configuration from: ${mcpConfig}`);
        try {
          const rawConfig = JSON.parse(readFileSync(mcpConfig, "utf-8"));
          const validation = validateMCPConfig(rawConfig);

          if (!validation.valid) {
            console.error("❌ Invalid MCP configuration:");
            validation.errors?.issues.forEach(issue => {
              console.error(`   - ${issue.path.join(".")}: ${issue.message}`);
            });
            process.exit(1);
          }

          const mcpConfigs = loadMCPConfig(rawConfig);
          console.log(`   Found ${mcpConfigs.length} MCP server(s)`);

          await agent.initializeMCP(mcpConfigs);
          console.log("✅ MCP servers initialized");
        } catch (error) {
          console.error("❌ Failed to load MCP configuration:", error instanceof Error ? error.message : error);
          process.exit(1);
        }
      }

      // Handle shutdown
      process.on("SIGINT", async () => {
        console.log("\n\n🛑 Shutting down agent...");
        await agent.disconnect();
        process.exit(0);
      });

      process.on("SIGTERM", async () => {
        console.log("\n\n🛑 Shutting down agent...");
        await agent.disconnect();
        process.exit(0);
      });

      // Connect to server
      await agent.connect();

      console.log("✅ Agent connected and ready!");
      console.log("   Waiting for prompts...\n");
    } catch (error) {
      logger.error({ error }, "Failed to start agent");
      console.error("❌ Failed to start agent:", error instanceof Error ? error.message : error);
      process.exit(1);
    }
  });

// Only run CLI if this is the main module
if (process.argv[1]?.includes("agent")) {
  program.parse();
}

// Programmatic API exports
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
export async function startAgent(options: AgentOptions = {}): Promise<ClaudeAgent> {
  const serverUrl = options.url || "ws://localhost:3000";
  const sessionId = options.session;
  const agentName = options.name || "Claude Assistant";
  const model = options.model || "claude-sonnet-4-5-20250929";
  const apiKey = options.apiKey || process.env.ANTHROPIC_API_KEY;

  if (!sessionId) {
    throw new Error("Session ID is required");
  }

  if (!apiKey) {
    throw new Error("Anthropic API key required (--api-key or ANTHROPIC_API_KEY env)");
  }

  // Resolve local working directory
  const localWorkDir = options.localWorkDir ? options.localWorkDir : undefined;

  console.log("🤖 Starting Claude AI Agent");
  console.log(`   Server: ${serverUrl}`);
  console.log(`   Session: ${sessionId}`);
  console.log(`   Name: ${agentName}`);
  console.log(`   Model: ${model}`);
  if (localWorkDir) {
    console.log(`   Working Dir: ${localWorkDir}`);
  }
  console.log();

  const agent = new ClaudeAgent({
    serverUrl,
    sessionId,
    agentName,
    model,
    apiKey,
    localWorkDir,
  });

  // Initialize MCP if config provided
  if (options.mcpConfig) {
    const rawConfig = JSON.parse(readFileSync(options.mcpConfig, "utf-8"));
    const validation = validateMCPConfig(rawConfig);
    if (!validation.valid) {
      throw new Error("Invalid MCP configuration");
    }
    const mcpConfigs = loadMCPConfig(rawConfig);
    await agent.initializeMCP(mcpConfigs);
  }

  // Handle shutdown
  const shutdown = async () => {
    await agent.disconnect();
    process.exit(0);
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);

  await agent.connect();
  console.log("✅ Agent connected and ready!\n");

  return agent;
}
