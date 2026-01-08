#!/usr/bin/env node
/**
 * PVP Server - WebSocket server for multiplayer human-AI collaboration
 *
 * The PVP server manages sessions, participants, approval gates, and decision tracking.
 * It provides real-time communication between humans and AI agents with built-in
 * support for approval workflows and git-based decision history.
 *
 * @module server
 *
 * @example
 * ```typescript
 * // Programmatic usage
 * import { startServer } from "@agrathwohl/pvp/server";
 *
 * const server = await startServer({ port: 3000 });
 * console.log("Server running on port 3000");
 *
 * // Graceful shutdown
 * process.on("SIGTERM", () => server.shutdown());
 * ```
 *
 * @example
 * ```bash
 * # CLI usage
 * pvp-server --port 3000 --host 0.0.0.0
 * pvp-server --config ./server-config.json
 * ```
 */
import { mergeServerConfig, type ServerConfig } from "../config/server-config.js";
/**
 * PVP Server - Core server class for the Pair Vibecoding Protocol.
 *
 * Manages WebSocket connections, sessions, participants, message routing,
 * heartbeat monitoring, and integrates with the git bridge service for
 * decision tracking.
 *
 * @example
 * ```typescript
 * import { PVPServer } from "@agrathwohl/pvp/server";
 * import { mergeServerConfig } from "@agrathwohl/pvp/server";
 *
 * const config = mergeServerConfig({ port: "8080" });
 * const server = new PVPServer(config);
 *
 * // Server is now listening for WebSocket connections
 * console.log(`Server running on ${config.host}:${config.port}`);
 *
 * // Access configuration
 * console.log("Git dir:", server.getGitDir());
 *
 * // Graceful shutdown
 * server.shutdown();
 * ```
 */
declare class PVPServer {
    private transportServer;
    private sessions;
    private router;
    private heartbeatIntervals;
    private config;
    private bridgeService;
    constructor(config: ServerConfig);
    private handleMessage;
    /**
     * Initialize session working directory with git repository.
     * Shared helper used by both explicit creation and auto-creation.
     */
    private initializeSessionDirectory;
    /**
     * Create and register a new session.
     */
    private createSession;
    private handleSessionCreate;
    /**
     * Auto-create a session when someone tries to join a non-existent session.
     * Uses default configuration for the session.
     */
    private autoCreateSession;
    private handleDisconnect;
    private startHeartbeatMonitoring;
    /**
     * Update bridge service with current session participants
     */
    private updateBridgeParticipants;
    /**
     * Get the configured git directory path.
     *
     * This directory is used by the git bridge service for storing
     * decision tracking repositories.
     *
     * @returns Absolute path to the git repositories directory
     */
    getGitDir(): string;
    /**
     * Get the complete server configuration.
     *
     * @returns Current server configuration including port, host, and git_dir
     */
    getConfig(): ServerConfig;
    /**
     * Gracefully shut down the server.
     *
     * This method:
     * 1. Stops all heartbeat monitoring intervals
     * 2. Notifies all connected clients of session end
     * 3. Closes all WebSocket connections
     * 4. Stops the git bridge service
     * 5. Clears all session data
     *
     * @example
     * ```typescript
     * process.on("SIGTERM", () => {
     *   console.log("Shutting down...");
     *   server.shutdown();
     *   process.exit(0);
     * });
     * ```
     */
    shutdown(): void;
}
export { PVPServer };
export { mergeServerConfig };
export type { ServerConfig };
/**
 * Start a PVP server programmatically.
 *
 * This is the recommended way to start a PVP server from code. It creates
 * a configured PVPServer instance and sets up signal handlers for graceful
 * shutdown.
 *
 * @param options - Server startup options
 * @param options.port - Port number to listen on (default: 3000)
 * @param options.host - Host address to bind to (default: "0.0.0.0")
 * @returns Promise resolving to the running PVPServer instance
 *
 * @example
 * ```typescript
 * import { startServer } from "@agrathwohl/pvp";
 *
 * // Start with defaults (port 3000, all interfaces)
 * const server = await startServer();
 *
 * // Start on specific port
 * const server = await startServer({ port: 8080 });
 *
 * // Start on localhost only
 * const server = await startServer({
 *   port: 3000,
 *   host: "127.0.0.1"
 * });
 *
 * // Access server state
 * console.log("Config:", server.getConfig());
 * console.log("Git dir:", server.getGitDir());
 * ```
 *
 * @example
 * ```typescript
 * // Full example with TUI client
 * import { startServer, startTUI } from "@agrathwohl/pvp";
 *
 * const server = await startServer({ port: 3000 });
 *
 * // In another terminal/process:
 * await startTUI({
 *   url: "ws://localhost:3000",
 *   name: "Alice"
 * });
 * ```
 */
export declare function startServer(options?: {
    port?: number;
    host?: string;
}): Promise<PVPServer>;
