#!/usr/bin/env node
import React from "react";
import { render } from "ink";
import { Command } from "commander";
import { ulid } from "../utils/ulid.js";
import { App } from "./app.js";

const program = new Command();

program
  .name("pvp")
  .description("Pair Vibecoding Protocol TUI Client")
  .requiredOption("-s, --server <url>", "WebSocket server URL")
  .option("--session <id>", "Session ID to join (omit to create new)")
  .option("-n, --name <name>", "Participant display name", "User")
  .option("-r, --role <role>", "Initial role", "driver")
  .action((options) => {
    const serverUrl = options.server;
    const sessionId = options.session || ulid();
    const participantId = ulid();
    const participantName = options.name;
    const role = options.role;
    const isCreator = !options.session;

    // Log session ID so users can share it
    console.log(`\n🔗 Session ID: ${sessionId}`);
    console.log(`👤 Participant: ${participantName} (${participantId})`);
    console.log(`📋 To join this session, use: --session ${sessionId}\n`);

    render(
      React.createElement(App, {
        serverUrl,
        sessionId,
        participantId,
        participantName,
        role,
        isCreator,
      })
    );
  });

program.parse();
