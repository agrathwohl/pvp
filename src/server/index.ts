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

import { Command } from "commander";
import { mkdir } from "fs/promises";
import { execSync } from "child_process";
import path from "path";
import { WebSocketTransportServer } from "../transports/websocket.js";
import { Session } from "./session.js";
import { MessageRouter } from "./router.js";
import { createMessage } from "../protocol/messages.js";
import { createLogger } from "../utils/logger.js";
import { mergeServerConfig, type ServerConfig } from "../config/server-config.js";
import { PvpGitBridgeService } from "../git-hooks/bridge/bridge-service.js";
import type { ParticipantInfo } from "../git-hooks/bridge/types.js";
import type {
  SessionId,
  SessionConfig,
  AnyMessage,
  ParticipantId,
} from "../protocol/types.js";

const logger = createLogger("server");

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
class PVPServer {
  private transportServer: WebSocketTransportServer;
  private sessions: Map<SessionId, Session> = new Map();
  private router: MessageRouter;
  private heartbeatIntervals: Map<ParticipantId, NodeJS.Timeout> = new Map();
  private config: ServerConfig;
  private bridgeService: PvpGitBridgeService;

  constructor(config: ServerConfig) {
    this.config = config;
    this.transportServer = new WebSocketTransportServer(config.port, config.host);
    this.router = new MessageRouter();
    this.bridgeService = new PvpGitBridgeService();

    // Configure bridge API proxy through HTTP server
    // This allows remote TUI clients to access bridge via wss://server:port/bridge/*
    this.transportServer.setBridgeProxy({
      bridgeHost: "127.0.0.1",
      bridgePort: 9847,
    });

    // Start the git bridge service for decision tracking
    this.bridgeService.start().catch((err) => {
      logger.warn({ error: err.message }, "Git bridge service failed to start (non-fatal)");
    });

    this.transportServer.onConnection((transport) => {
      logger.info(
        { participantId: transport.participantId },
        "Client connected",
      );

      transport.onMessage(async (message) => {
        await this.handleMessage(transport.participantId, message);
      });

      transport.onClose(() => {
        logger.info(
          { participantId: transport.participantId },
          "Client disconnected",
        );
        this.handleDisconnect(transport.participantId);
      });
    });

    logger.info({ port: config.port, host: config.host, gitDir: config.git_dir }, "PVP Server initialized");
  }

  private async handleMessage(
    participantId: ParticipantId,
    message: AnyMessage,
  ): Promise<void> {
    try {
      // Handle session creation
      if (message.type === "session.create") {
        await this.handleSessionCreate(participantId, message);
        return;
      }

      // Route message to session (auto-create on join if doesn't exist)
      let session = this.sessions.get(message.session);
      if (!session) {
        // Auto-create session on join attempt
        if (message.type === "session.join") {
          session = await this.autoCreateSession(message.session, participantId);
        } else {
          const errorMsg = createMessage("error", message.session, "system", {
            code: "SESSION_NOT_FOUND",
            message: `Session ${message.session} not found`,
            recoverable: false,
            related_to: message.id,
          });
          this.transportServer.broadcast(errorMsg, (id) => id === participantId);
          return;
        }
      }

      // Create broadcast function for this session
      const broadcast = (msg: AnyMessage, filter?: (id: string) => boolean) => {
        this.transportServer.broadcast(msg, (id) => {
          const participant = session.getParticipant(id);
          if (!participant) return false;
          if (filter) return filter(id);
          return true;
        });
      };

      await this.router.route(session, message, broadcast);

      // Forward message to bridge service for decision tracking
      this.bridgeService.onMessage(message);

      // Start heartbeat monitoring for new participants
      if (message.type === "session.join") {
        this.startHeartbeatMonitoring(session, participantId);
        // Update bridge with new participant
        this.updateBridgeParticipants(session);
      }

      // Handle participant leaving
      if (message.type === "session.leave") {
        this.updateBridgeParticipants(session);
      }
    } catch (error) {
      logger.error(
        { error, participantId, messageType: message.type },
        "Error handling message",
      );

      const errorMsg = createMessage("error", message.session, "system", {
        code: "INTERNAL_ERROR",
        message: error instanceof Error ? error.message : "Unknown error",
        recoverable: true,
        related_to: message.id,
      });

      this.transportServer.broadcast(errorMsg, (id) => id === participantId);
    }
  }

  /**
   * Initialize session working directory with git repository.
   * Shared helper used by both explicit creation and auto-creation.
   */
  private async initializeSessionDirectory(sessionId: SessionId): Promise<string> {
    const workingDirectory = path.join(this.config.git_dir, sessionId);
    await mkdir(workingDirectory, { recursive: true });

    // Initialize git repository with agent as committer
    try {
      execSync("git init", { cwd: workingDirectory, stdio: "pipe" });
      execSync('git config user.name "PVP Agent"', { cwd: workingDirectory, stdio: "pipe" });
      execSync('git config user.email "agent@pvp.session"', { cwd: workingDirectory, stdio: "pipe" });
      logger.info({ sessionId, workingDirectory }, "Git repository initialized for session");
    } catch (error) {
      logger.warn({ sessionId, workingDirectory, error }, "Failed to initialize git repository");
    }

    return workingDirectory;
  }

  /**
   * Create and register a new session.
   */
  private createSession(
    sessionId: SessionId,
    name: string,
    config: SessionConfig,
    workingDirectory: string,
  ): Session {
    const session = new Session(sessionId, name, config, workingDirectory);
    this.sessions.set(sessionId, session);
    this.bridgeService.onSessionStart(sessionId, []);
    return session;
  }

  private async handleSessionCreate(
    participantId: ParticipantId,
    message: AnyMessage,
  ): Promise<void> {
    if (message.type !== "session.create") return;

    const sessionId = message.session;
    const { name, config } = message.payload;

    const workingDirectory = await this.initializeSessionDirectory(sessionId);
    this.createSession(sessionId, name ?? "Unnamed session", config, workingDirectory);

    logger.info({ sessionId, name, workingDirectory, participantId }, "Session created");

    // Broadcast session created
    this.transportServer.broadcast(message);
  }

  /**
   * Auto-create a session when someone tries to join a non-existent session.
   * Uses default configuration for the session.
   */
  private async autoCreateSession(
    sessionId: SessionId,
    participantId: ParticipantId,
  ): Promise<Session> {
    const workingDirectory = await this.initializeSessionDirectory(sessionId);

    // Default config for auto-created sessions
    const defaultConfig: SessionConfig = {
      require_approval_for: [],
      default_gate_quorum: { type: "any", count: 1 },
      allow_forks: true,
      max_participants: 10,
      ordering_mode: "causal",
      on_participant_timeout: "wait",
      idle_timeout_seconds: 300,
      away_timeout_seconds: 600,
      heartbeat_interval_seconds: 30,
    };

    const session = this.createSession(sessionId, "Auto-created session", defaultConfig, workingDirectory);

    logger.info({ sessionId, workingDirectory, participantId }, "Session auto-created on join");

    return session;
  }

  private handleDisconnect(participantId: ParticipantId): void {
    // Stop heartbeat monitoring
    const interval = this.heartbeatIntervals.get(participantId);
    if (interval) {
      clearInterval(interval);
      this.heartbeatIntervals.delete(participantId);
    }

    // Update presence in all sessions
    for (const session of this.sessions.values()) {
      const participant = session.getParticipant(participantId);
      if (participant) {
        session.updatePresence(participantId, "disconnected");

        // Send session.leave message so clients can remove participant from list
        const leaveMsg = createMessage(
          "session.leave",
          session.getId(),
          participantId,
          {
            reason: "Client disconnected",
          },
        );
        this.transportServer.broadcast(leaveMsg);

        // Also send presence update
        const presenceMsg = createMessage(
          "presence.update",
          session.getId(),
          "system",
          {
            participant: participantId,
            status: "disconnected",
            last_active: new Date().toISOString(),
          },
        );

        this.transportServer.broadcast(presenceMsg);
      }
    }
  }

  private startHeartbeatMonitoring(
    session: Session,
    participantId: ParticipantId,
  ): void {
    const config = session.getConfig();

    // Clear existing interval
    const existing = this.heartbeatIntervals.get(participantId);
    if (existing) {
      clearInterval(existing);
    }

    // Send periodic pings
    const interval = setInterval(() => {
      const participant = session.getParticipant(participantId);
      if (!participant) {
        clearInterval(interval);
        this.heartbeatIntervals.delete(participantId);
        return;
      }

      const pingMsg = createMessage(
        "heartbeat.ping",
        session.getId(),
        "system",
        {},
      );

      this.transportServer.broadcast(pingMsg, (id) => id === participantId);

      // Check last heartbeat for idle/away status
      const lastHeartbeat = new Date(participant.lastHeartbeat);
      const now = new Date();
      const secondsSinceHeartbeat =
        (now.getTime() - lastHeartbeat.getTime()) / 1000;

      if (secondsSinceHeartbeat > config.away_timeout_seconds) {
        if (participant.presence !== "away") {
          session.updatePresence(participantId, "away");
          const presenceMsg = createMessage(
            "presence.update",
            session.getId(),
            "system",
            {
              participant: participantId,
              status: "away",
              last_active: participant.lastActive,
            },
          );
          this.transportServer.broadcast(presenceMsg);
        }
      } else if (secondsSinceHeartbeat > config.idle_timeout_seconds) {
        if (participant.presence !== "idle") {
          session.updatePresence(participantId, "idle");
          const presenceMsg = createMessage(
            "presence.update",
            session.getId(),
            "system",
            {
              participant: participantId,
              status: "idle",
              last_active: participant.lastActive,
            },
          );
          this.transportServer.broadcast(presenceMsg);
        }
      }
    }, config.heartbeat_interval_seconds * 1000);

    this.heartbeatIntervals.set(participantId, interval);
  }

  /**
   * Update bridge service with current session participants
   */
  private updateBridgeParticipants(session: Session): void {
    const participants = session.getParticipants();
    const participantInfos: ParticipantInfo[] = [];

    for (const [id, state] of participants) {
      participantInfos.push({
        id,
        name: state.info.name,
        type: state.info.type,
        role: state.info.roles?.[0] || "participant",
      });
    }

    this.bridgeService.updateParticipants(participantInfos);
  }

  /**
   * Get the configured git directory path.
   *
   * This directory is used by the git bridge service for storing
   * decision tracking repositories.
   *
   * @returns Absolute path to the git repositories directory
   */
  getGitDir(): string {
    return this.config.git_dir;
  }

  /**
   * Get the complete server configuration.
   *
   * @returns Current server configuration including port, host, and git_dir
   */
  getConfig(): ServerConfig {
    return this.config;
  }

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
  shutdown(): void {
    logger.info("Shutting down server");

    // Clear all heartbeat intervals
    for (const interval of this.heartbeatIntervals.values()) {
      clearInterval(interval);
    }
    this.heartbeatIntervals.clear();

    // Close transport server
    this.transportServer.close();

    // End all sessions and notify bridge service
    for (const session of this.sessions.values()) {
      const sessionId = session.getId();

      // Notify bridge service of session end
      this.bridgeService.onSessionEnd(sessionId);

      const endMsg = createMessage("session.end", sessionId, "system", {
        reason: "Server shutdown",
        final_state: "aborted",
      });
      this.transportServer.broadcast(endMsg);
    }

    this.sessions.clear();

    // Stop bridge service
    this.bridgeService.stop().catch((err) => {
      logger.warn({ error: err.message }, "Error stopping bridge service");
    });
  }
}

// CLI
const program = new Command();

program
  .name("pvp-server")
  .description("Pair Vibecoding Protocol Server")
  .option("-p, --port <port>", "Port to listen on")
  .option("-H, --host <host>", "Host to bind to")
  .option("-g, --git-dir <path>", "Directory for git repositories (default: /tmp/pvp-git)")
  .option("-c, --config <file>", "Path to server configuration file (JSON)")
  .action((options) => {
    try {
      const config = mergeServerConfig({
        port: options.port,
        host: options.host,
        gitDir: options.gitDir,
        config: options.config,
      });

      const server = new PVPServer(config);

      // Graceful shutdown
      process.on("SIGINT", () => {
        logger.info("Received SIGINT, shutting down gracefully");
        server.shutdown();
        process.exit(0);
      });

      process.on("SIGTERM", () => {
        logger.info("Received SIGTERM, shutting down gracefully");
        server.shutdown();
        process.exit(0);
      });
    } catch (error) {
      logger.error({ error }, "Failed to start server");
      console.error("❌ Failed to start server:", error instanceof Error ? error.message : error);
      process.exit(1);
    }
  });

// Only run CLI if this is the main module
if (process.argv[1]?.includes("server")) {
  program.parse();
}

// Programmatic API exports
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
export async function startServer(options: { port?: number; host?: string } = {}): Promise<PVPServer> {
  const config = mergeServerConfig({
    port: options.port?.toString(),
    host: options.host,
  });

  const server = new PVPServer(config);

  // Setup signal handlers
  const shutdown = () => {
    server.shutdown();
    process.exit(0);
  };

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);

  return server;
}
