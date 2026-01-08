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
export declare function startTUI(options?: TUIOptions): Promise<void>;
