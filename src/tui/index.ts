#!/usr/bin/env node
/**
 * PVP Terminal User Interface (TUI)
 *
 * Interactive terminal client for the Pair Vibecoding Protocol built with
 * React and Ink. Provides a rich interface for humans to participate in
 * PVP sessions, review AI proposals, vote on gates, and track decisions.
 *
 * @module tui
 *
 * @example
 * ```typescript
 * // Programmatic usage
 * import { startTUI } from "@agrathwohl/pvp/tui";
 *
 * await startTUI({
 *   url: "ws://localhost:3000",
 *   session: "existing-session-id",
 *   name: "Alice",
 *   role: "driver"
 * });
 * ```
 *
 * @example
 * ```bash
 * # CLI usage - create new session
 * pvp-tui --server ws://localhost:3000 --name Alice
 *
 * # Join existing session
 * pvp-tui --server ws://localhost:3000 --session 01ARZ3NDEK --name Bob
 * ```
 */

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

// Only run CLI if this is the main module
if (process.argv[1]?.includes("tui")) {
  program.parse();
}

// Programmatic API exports
export { App } from "./app.js";
export { useTUIStore } from "./store.js";

/**
 * Configuration options for starting the TUI client.
 *
 * @property url - WebSocket server URL (default: "ws://localhost:3000")
 * @property session - Session ID to join. If omitted, creates a new session.
 * @property name - Display name for this participant (default: "User")
 * @property role - Initial role: "driver" or "navigator" (default: "driver")
 *
 * @example
 * ```typescript
 * const options: TUIOptions = {
 *   url: "wss://pvp.example.com",
 *   session: "01ARZ3NDEKTSV4RRFFQ69G5FAV",
 *   name: "Alice",
 *   role: "driver"
 * };
 * ```
 */
export interface TUIOptions {
  /** WebSocket server URL (e.g., "ws://localhost:3000" or "wss://pvp.example.com") */
  url?: string;
  /** Session ID to join. Omit to create a new session with auto-generated ID. */
  session?: string;
  /** Display name shown to other participants */
  name?: string;
  /** Initial role assignment: "driver" (active control) or "navigator" (advisory) */
  role?: string;
}

/**
 * Start the PVP Terminal User Interface programmatically.
 *
 * Launches an interactive terminal interface for participating in PVP sessions.
 * The TUI provides:
 * - Real-time message display from all participants
 * - Tool proposal review with approve/reject controls
 * - Gate voting interface
 * - Decision tracking display
 * - Presence indicators for all participants
 *
 * @param options - TUI configuration options
 * @returns Promise that resolves when the TUI is rendered (does not wait for exit)
 *
 * @example
 * ```typescript
 * import { startTUI } from "@agrathwohl/pvp/tui";
 *
 * // Create a new session
 * await startTUI({
 *   url: "ws://localhost:3000",
 *   name: "Alice"
 * });
 *
 * // Join existing session
 * await startTUI({
 *   url: "ws://localhost:3000",
 *   session: "01ARZ3NDEKTSV4RRFFQ69G5FAV",
 *   name: "Bob",
 *   role: "navigator"
 * });
 * ```
 *
 * @example
 * ```typescript
 * // Full workflow: start server, then TUI
 * import { startServer, startTUI } from "@agrathwohl/pvp";
 *
 * // In process 1:
 * const server = await startServer({ port: 3000 });
 *
 * // In process 2:
 * await startTUI({ url: "ws://localhost:3000", name: "Human" });
 * ```
 */
export async function startTUI(options: TUIOptions = {}): Promise<void> {
  const serverUrl = options.url || "ws://localhost:3000";
  const sessionId = options.session || ulid();
  const participantId = ulid();
  const participantName = options.name || "User";
  const role = options.role || "driver";
  const isCreator = !options.session;

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
}
