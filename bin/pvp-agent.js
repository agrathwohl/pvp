#!/usr/bin/env node
import { Command } from "commander";

const program = new Command();

program
  .name("pvp-agent")
  .description("Start a Claude AI agent")
  .option("-u, --url <url>", "WebSocket server URL", "ws://localhost:3000")
  .option("-s, --session <id>", "Session ID to join")
  .option("-n, --name <name>", "Agent name", "Claude")
  .option("-m, --model <model>", "Claude model to use", "claude-sonnet-4-20250514")
  .action(async (options) => {
    const { startAgent } = await import("../dist/agent/index.js");
    await startAgent(options);
  });

program.parse();
