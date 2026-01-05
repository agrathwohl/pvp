#!/usr/bin/env node
import { Command } from "commander";
import { WebSocketTransportServer } from "../transports/websocket.js";
import { Session } from "./session.js";
import { MessageRouter } from "./router.js";
import { createMessage } from "../protocol/messages.js";
import { createLogger } from "../utils/logger.js";
import { mergeServerConfig, type ServerConfig } from "../config/server-config.js";
import type {
  SessionId,
  SessionConfig,
  AnyMessage,
  ParticipantId,
} from "../protocol/types.js";

const logger = createLogger("server");

class PVPServer {
  private transportServer: WebSocketTransportServer;
  private sessions: Map<SessionId, Session> = new Map();
  private router: MessageRouter;
  private heartbeatIntervals: Map<ParticipantId, NodeJS.Timeout> = new Map();
  private config: ServerConfig;

  constructor(config: ServerConfig) {
    this.config = config;
    this.transportServer = new WebSocketTransportServer(config.port, config.host);
    this.router = new MessageRouter();

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

      // Route message to session
      const session = this.sessions.get(message.session);
      if (!session) {
        const errorMsg = createMessage("error", message.session, "system", {
          code: "SESSION_NOT_FOUND",
          message: `Session ${message.session} not found`,
          recoverable: false,
          related_to: message.id,
        });
        this.transportServer.broadcast(errorMsg, (id) => id === participantId);
        return;
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

      // Start heartbeat monitoring for new participants
      if (message.type === "session.join") {
        this.startHeartbeatMonitoring(session, participantId);
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

  private async handleSessionCreate(
    participantId: ParticipantId,
    message: AnyMessage,
  ): Promise<void> {
    if (message.type !== "session.create") return;

    const sessionId = message.session;
    const { name, config } = message.payload;

    // Create session
    const session = new Session(sessionId, name, config);
    this.sessions.set(sessionId, session);

    logger.info({ sessionId, name, participantId }, "Session created");

    // Broadcast session created
    this.transportServer.broadcast(message);
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
   * Get the configured git directory for repository creation
   */
  getGitDir(): string {
    return this.config.git_dir;
  }

  /**
   * Get the full server configuration
   */
  getConfig(): ServerConfig {
    return this.config;
  }

  shutdown(): void {
    logger.info("Shutting down server");

    // Clear all heartbeat intervals
    for (const interval of this.heartbeatIntervals.values()) {
      clearInterval(interval);
    }
    this.heartbeatIntervals.clear();

    // Close transport server
    this.transportServer.close();

    // End all sessions
    for (const session of this.sessions.values()) {
      const endMsg = createMessage("session.end", session.getId(), "system", {
        reason: "Server shutdown",
        final_state: "aborted",
      });
      this.transportServer.broadcast(endMsg);
    }

    this.sessions.clear();
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

program.parse();
