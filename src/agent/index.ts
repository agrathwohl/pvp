#!/usr/bin/env node

/**
 * RUNTIME REQUIREMENT: This agent requires Bun runtime due to shell execution
 * dependencies in tools/shell-executor.ts which uses Bun.spawn for security.
 *
 * DO NOT convert to Node.js/tsx without replacing Bun.spawn implementation.
 *
 * Run with: npm run agent -- [options]
 * Do NOT use: tsx src/agent/index.ts
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
import { ClaudeAgent } from "./claude-agent.js";
import { logger } from "../utils/logger.js";

const program = new Command();

program
  .name("pvp-agent")
  .description("Claude AI Agent for Pair Vibecoding Protocol")
  .requiredOption("-s, --server <url>", "WebSocket server URL (e.g., ws://localhost:3000)")
  .requiredOption("--session <id>", "Session ID to join")
  .option("-n, --name <name>", "Agent display name", "Claude Assistant")
  .option("-m, --model <model>", "Claude model to use", "claude-sonnet-4-5-20250929")
  .option("-k, --api-key <key>", "Anthropic API key (or set ANTHROPIC_API_KEY env var)")
  .action(async (options) => {
    const { server, session, name, model, apiKey } = options;

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

    console.log("🤖 Starting Claude AI Agent");
    console.log(`   Server: ${server}`);
    console.log(`   Session: ${session}`);
    console.log(`   Name: ${name}`);
    console.log(`   Model: ${model}\n`);

    try {
      const agent = new ClaudeAgent({
        serverUrl: server,
        sessionId: session,
        agentName: name,
        model,
        apiKey: finalApiKey,
      });

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

program.parse();
