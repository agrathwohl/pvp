#!/usr/bin/env node
import { Command } from "commander";

const program = new Command();

program
  .name("pvp-tui")
  .description("Start the PVP Terminal UI")
  .option("-u, --url <url>", "WebSocket server URL", "ws://localhost:3000")
  .option("-s, --session <id>", "Session ID to join")
  .option("-n, --name <name>", "Your display name", "Human")
  .action(async (options) => {
    const { startTUI } = await import("../dist/tui/index.js");
    await startTUI(options);
  });

program.parse();
