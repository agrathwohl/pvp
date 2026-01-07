/**
 * PVP Git Bridge Service
 * Local daemon that maintains session state for git hooks
 * Exposes Unix socket and HTTP API for hook communication
 */

import { createServer, type Server as NetServer, type Socket } from "net";
import { createServer as createHttpServer, type Server as HttpServer, type IncomingMessage, type ServerResponse } from "http";
import { existsSync, readFileSync, writeFileSync, mkdirSync, unlinkSync } from "fs";
import { dirname } from "path";
import { createLogger } from "../../utils/logger.js";
import type {
  PvpGitConfig,
  GitSessionState,
  BridgeRequest,
  BridgeResponse,
  CommitContext,
  ExtendedMetadata,
  BridgeStatus,
  ParticipantInfo,
  CommitContextMessage,
  ToolExecutionSummary,
  PersistentState,
  RecentCommit,
} from "./types.js";
import type {
  AnyMessage,
  SessionId,
  ParticipantId,
  PrimitiveType,
} from "../../protocol/types.js";

const logger = createLogger("pvp-git-bridge");

// Default configuration
const DEFAULT_CONFIG: PvpGitConfig = {
  socket_path: "/tmp/pvp-git-bridge.sock",
  http_port: 9847,
  state_file: `${process.env.HOME}/.pvp/git-bridge-state.json`,
  notes_ref: "refs/notes/pvp",
  webhooks: [],
  enforcement: {
    enforce_metadata: false,
    min_pvp_coverage: 0,
    warn_only: true,
  },
  message_filter: {
    include_types: [
      "prompt.submit",
      "response.end",
      "tool.propose",
      "tool.result",
      "gate.approve",
      "gate.reject",
      "context.add",
      "fork.create",
      "merge.execute",
    ],
    exclude_types: [
      "heartbeat.ping",
      "heartbeat.pong",
      "presence.update",
      "thinking.chunk",
      "response.chunk",
    ],
    max_messages: 50,
    max_age_seconds: 3600,
  },
  summarization: {
    enabled: false,
    max_tokens: 100,
    style: "brief",
  },
};

export class PvpGitBridgeService {
  private config: PvpGitConfig;
  private state: GitSessionState;
  private socketServer: NetServer | null = null;
  private httpServer: HttpServer | null = null;
  private startTime: number = Date.now();
  private messagesProcessed: number = 0;
  private commitsTracked: number = 0;
  private recentCommits: RecentCommit[] = [];
  private connections: Set<Socket> = new Set();

  constructor(config: Partial<PvpGitConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.state = this.createEmptyState();
    this.loadPersistedState();
  }

  private createEmptyState(): GitSessionState {
    return {
      session_id: null,
      active_participants: [],
      last_commit: null,
      messages_since_last_commit: 0,
      relevant_messages: [],
      tool_executions: [],
      prompts_count: 0,
      approvals_count: 0,
      session_started_at: null,
      last_activity_at: null,
      decision_summary: null,
    };
  }

  // =========================================================================
  // LIFECYCLE
  // =========================================================================

  async start(): Promise<void> {
    logger.info({ config: this.config }, "Starting PVP Git Bridge Service");

    // Clean up existing socket
    if (existsSync(this.config.socket_path)) {
      try {
        unlinkSync(this.config.socket_path);
      } catch (err) {
        logger.warn({ path: this.config.socket_path }, "Could not remove existing socket");
      }
    }

    // Start Unix socket server
    await this.startSocketServer();

    // Start HTTP server
    await this.startHttpServer();

    // Set up graceful shutdown
    process.on("SIGINT", () => this.stop());
    process.on("SIGTERM", () => this.stop());

    logger.info(
      {
        socket: this.config.socket_path,
        http_port: this.config.http_port,
      },
      "PVP Git Bridge Service started"
    );
  }

  async stop(): Promise<void> {
    logger.info("Stopping PVP Git Bridge Service");

    // Persist state before shutdown
    this.persistState();

    // Close all connections
    for (const conn of this.connections) {
      conn.destroy();
    }
    this.connections.clear();

    // Close servers
    if (this.socketServer) {
      this.socketServer.close();
      this.socketServer = null;
    }

    if (this.httpServer) {
      this.httpServer.close();
      this.httpServer = null;
    }

    // Clean up socket file
    if (existsSync(this.config.socket_path)) {
      try {
        unlinkSync(this.config.socket_path);
      } catch (err) {
        // Ignore cleanup errors
      }
    }

    logger.info("PVP Git Bridge Service stopped");
  }

  // =========================================================================
  // SERVERS
  // =========================================================================

  private async startSocketServer(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.socketServer = createServer((socket) => {
        this.connections.add(socket);
        let buffer = "";

        socket.on("data", (data) => {
          buffer += data.toString();

          // Process complete JSON messages (newline-delimited)
          const lines = buffer.split("\n");
          buffer = lines.pop() || "";

          for (const line of lines) {
            if (line.trim()) {
              this.handleSocketRequest(line.trim(), socket);
            }
          }

          // Also try to parse the buffer as complete JSON
          try {
            const request = JSON.parse(buffer);
            this.handleSocketRequest(buffer, socket);
            buffer = "";
          } catch {
            // Not complete JSON yet, keep buffering
          }
        });

        socket.on("close", () => {
          this.connections.delete(socket);
        });

        socket.on("error", (err) => {
          logger.error({ error: err.message }, "Socket error");
          this.connections.delete(socket);
        });
      });

      this.socketServer.on("error", (err) => {
        logger.error({ error: err.message }, "Socket server error");
        reject(err);
      });

      this.socketServer.listen(this.config.socket_path, () => {
        logger.info({ path: this.config.socket_path }, "Socket server listening");
        resolve();
      });
    });
  }

  private async startHttpServer(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.httpServer = createHttpServer((req, res) => {
        this.handleHttpRequest(req, res);
      });

      this.httpServer.on("error", (err) => {
        logger.error({ error: err.message }, "HTTP server error");
        reject(err);
      });

      this.httpServer.listen(this.config.http_port, "127.0.0.1", () => {
        logger.info({ port: this.config.http_port }, "HTTP server listening");
        resolve();
      });
    });
  }

  // =========================================================================
  // REQUEST HANDLING
  // =========================================================================

  private handleSocketRequest(data: string, socket: Socket): void {
    try {
      const request = JSON.parse(data) as BridgeRequest;
      const response = this.processRequest(request);
      socket.write(JSON.stringify(response) + "\n");
    } catch (err) {
      const response: BridgeResponse = {
        success: false,
        error: `Parse error: ${err instanceof Error ? err.message : "Unknown error"}`,
      };
      socket.write(JSON.stringify(response) + "\n");
    }
  }

  private handleHttpRequest(req: IncomingMessage, res: ServerResponse): void {
    const url = req.url || "/";
    const method = req.method || "GET";

    // CORS headers for local development
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");

    if (method === "OPTIONS") {
      res.writeHead(200);
      res.end();
      return;
    }

    // Route handling
    if (method === "GET") {
      this.handleHttpGet(url, res);
    } else if (method === "POST") {
      this.handleHttpPost(url, req, res);
    } else {
      res.writeHead(405, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Method not allowed" }));
    }
  }

  private handleHttpGet(url: string, res: ServerResponse): void {
    let response: BridgeResponse;

    // Parse URL and query params
    const urlObj = new URL(url, "http://localhost");
    const pathname = urlObj.pathname;
    const limit = parseInt(urlObj.searchParams.get("limit") || "20", 10);

    switch (pathname) {
      case "/commit-context":
        response = this.processRequest({ action: "get_commit_context" });
        break;
      case "/extended-metadata":
        response = this.processRequest({ action: "get_extended_metadata" });
        break;
      case "/status":
        response = this.processRequest({ action: "get_status" });
        break;
      case "/commits":
        response = this.processRequest({ action: "get_commits", data: { limit } });
        break;
      default:
        res.writeHead(404, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "Not found" }));
        return;
    }

    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify(response.data || response));
  }

  private handleHttpPost(url: string, req: IncomingMessage, res: ServerResponse): void {
    let body = "";

    req.on("data", (chunk) => {
      body += chunk.toString();
    });

    req.on("end", () => {
      try {
        const data = body ? JSON.parse(body) : {};
        let response: BridgeResponse;

        switch (url) {
          case "/commit-created":
            response = this.processRequest({
              action: "commit_created",
              data,
            });
            break;
          case "/session-started":
            response = this.processRequest({
              action: "session_started",
              data,
            });
            break;
          case "/session-ended":
            response = this.processRequest({
              action: "session_ended",
              data,
            });
            break;
          case "/message":
            response = this.processRequest({
              action: "message_received",
              data,
            });
            break;
          case "/reset":
            response = this.processRequest({
              action: "reset_context",
            });
            break;
          default:
            res.writeHead(404, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ error: "Not found" }));
            return;
        }

        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify(response));
      } catch (err) {
        res.writeHead(400, { "Content-Type": "application/json" });
        res.end(
          JSON.stringify({
            error: `Parse error: ${err instanceof Error ? err.message : "Unknown error"}`,
          })
        );
      }
    });
  }

  private processRequest(request: BridgeRequest): BridgeResponse {
    logger.debug({ action: request.action }, "Processing request");

    switch (request.action) {
      case "get_commit_context":
        return this.getCommitContext();

      case "get_extended_metadata":
        return this.getExtendedMetadata();

      case "get_status":
        return this.getStatus();

      case "get_commits":
        return this.getCommits(request.data?.limit as number | undefined);

      case "commit_created":
        return this.handleCommitCreated(request.data || {});

      case "session_started":
        return this.handleSessionStarted(request.data || {});

      case "session_ended":
        return this.handleSessionEnded(request.data || {});

      case "message_received":
        return this.handleMessageReceived(request.data || {});

      case "reset_context":
        return this.handleResetContext();

      default:
        return {
          success: false,
          error: `Unknown action: ${request.action}`,
        };
    }
  }

  // =========================================================================
  // ACTION HANDLERS
  // =========================================================================

  private getCommitContext(): BridgeResponse {
    const context: CommitContext = {
      session_id: this.state.session_id,
      last_commit: this.state.last_commit,
      messages_since_last_commit: this.state.messages_since_last_commit,
      active_participants: this.state.active_participants
        .map((p) => `${p.name}(${p.type})`)
        .join(", "),
      decision_summary: this.state.decision_summary,
      tool_executions: this.state.tool_executions
        .map((t) => `${t.tool_name}:${t.execution_count}`)
        .join(", "),
      prompts_count: this.state.prompts_count,
      approvals_count: this.state.approvals_count,
    };

    return { success: true, data: context };
  }

  private getExtendedMetadata(): BridgeResponse {
    const metadata: ExtendedMetadata = {
      session_id: this.state.session_id,
      session_name: null, // Would be populated from session data
      participants: this.state.active_participants,
      messages: this.state.relevant_messages,
      tools: this.state.tool_executions,
      context_keys: [], // Would be populated from session context
      forks: [], // Would be populated from session forks
      gates_processed: this.state.approvals_count,
      total_token_usage: 0, // Would be calculated from usage stats
    };

    return { success: true, data: metadata };
  }

  private getStatus(): BridgeResponse {
    const status: BridgeStatus = {
      running: true,
      session_active: this.state.session_id !== null,
      session_id: this.state.session_id,
      uptime_seconds: Math.floor((Date.now() - this.startTime) / 1000),
      messages_processed: this.messagesProcessed,
      commits_tracked: this.commitsTracked,
    };

    return { success: true, data: status };
  }

  private getCommits(limit?: number): BridgeResponse {
    const maxCommits = Math.min(limit || 20, 100);
    return { success: true, data: this.recentCommits.slice(0, maxCommits) };
  }

  private handleCommitCreated(data: Record<string, unknown>): BridgeResponse {
    const commitSha = data.commit_sha as string;
    const timestamp = data.timestamp as string || new Date().toISOString();
    const message = data.message as string | undefined;

    if (!commitSha) {
      return { success: false, error: "Missing commit_sha" };
    }

    logger.info({ commit_sha: commitSha }, "Commit created");

    // Track this commit in recent commits
    const recentCommit: RecentCommit = {
      sha: commitSha,
      timestamp,
      session_id: this.state.session_id,
      had_pvp_metadata: true,
      participants: this.state.active_participants.map(p => p.name),
      message_count: this.state.messages_since_last_commit,
    };
    this.recentCommits.unshift(recentCommit);
    // Keep only last 100 commits in memory
    if (this.recentCommits.length > 100) {
      this.recentCommits = this.recentCommits.slice(0, 100);
    }

    // Update state
    this.state.last_commit = commitSha;
    this.state.messages_since_last_commit = 0;
    this.state.relevant_messages = [];
    this.state.tool_executions = [];
    this.state.prompts_count = 0;
    this.state.approvals_count = 0;
    this.state.decision_summary = null;
    this.commitsTracked++;

    // Persist state
    this.persistState();

    // Trigger webhooks
    this.triggerWebhooks("commit", { commit_sha: commitSha, timestamp });

    return { success: true };
  }

  private handleSessionStarted(data: Record<string, unknown>): BridgeResponse {
    const sessionId = data.session_id as SessionId;
    const participants = data.participants as ParticipantInfo[] || [];

    if (!sessionId) {
      return { success: false, error: "Missing session_id" };
    }

    logger.info({ session_id: sessionId }, "Session started");

    this.state.session_id = sessionId;
    this.state.active_participants = participants;
    this.state.session_started_at = new Date().toISOString();
    this.state.last_activity_at = new Date().toISOString();

    this.persistState();

    return { success: true };
  }

  private handleSessionEnded(data: Record<string, unknown>): BridgeResponse {
    const sessionId = data.session_id as SessionId;

    logger.info({ session_id: sessionId || this.state.session_id }, "Session ended");

    // Trigger webhooks before reset
    this.triggerWebhooks("session_end", {
      session_id: this.state.session_id,
      duration_seconds: this.state.session_started_at
        ? Math.floor((Date.now() - new Date(this.state.session_started_at).getTime()) / 1000)
        : 0,
      messages_count: this.state.messages_since_last_commit,
    });

    // Reset state
    this.state = this.createEmptyState();
    this.persistState();

    return { success: true };
  }

  private handleMessageReceived(data: Record<string, unknown>): BridgeResponse {
    const message = data.message as AnyMessage;

    if (!message) {
      return { success: false, error: "Missing message" };
    }

    this.messagesProcessed++;
    this.state.last_activity_at = new Date().toISOString();

    // Filter based on config
    const messageType = message.type as PrimitiveType;

    if (this.config.message_filter.exclude_types.includes(messageType)) {
      return { success: true }; // Skip excluded types
    }

    if (
      this.config.message_filter.include_types.length > 0 &&
      !this.config.message_filter.include_types.includes(messageType)
    ) {
      return { success: true }; // Skip non-included types
    }

    // Update counters
    this.state.messages_since_last_commit++;

    // Track specific message types
    switch (messageType) {
      case "prompt.submit":
        this.state.prompts_count++;
        break;
      case "gate.approve":
        this.state.approvals_count++;
        break;
      case "tool.propose":
        this.trackToolExecution(message);
        break;
      case "tool.result":
        this.updateToolExecution(message);
        break;
    }

    // Store relevant message
    if (this.state.relevant_messages.length < this.config.message_filter.max_messages) {
      this.state.relevant_messages.push({
        id: message.id,
        type: messageType,
        sender: message.sender,
        timestamp: message.ts,
        summary: this.summarizeMessage(message),
      });
    }

    // Update decision summary if we have enough context
    this.updateDecisionSummary();

    return { success: true };
  }

  private handleResetContext(): BridgeResponse {
    logger.info("Resetting context");

    this.state.messages_since_last_commit = 0;
    this.state.relevant_messages = [];
    this.state.tool_executions = [];
    this.state.prompts_count = 0;
    this.state.approvals_count = 0;
    this.state.decision_summary = null;

    this.persistState();

    return { success: true };
  }

  // =========================================================================
  // HELPERS
  // =========================================================================

  private trackToolExecution(message: AnyMessage): void {
    const payload = message.payload as { tool_name?: string };
    const toolName = payload.tool_name || "unknown";

    const existing = this.state.tool_executions.find((t) => t.tool_name === toolName);

    if (existing) {
      existing.execution_count++;
      existing.last_executed = message.ts;
    } else {
      this.state.tool_executions.push({
        tool_name: toolName,
        execution_count: 1,
        last_executed: message.ts,
        success_rate: 1.0,
      });
    }
  }

  private updateToolExecution(message: AnyMessage): void {
    const payload = message.payload as { tool_proposal?: string; success?: boolean };
    // Would need to look up the original proposal to get tool_name
    // For now, update the last tool's success rate
    if (this.state.tool_executions.length > 0) {
      const lastTool = this.state.tool_executions[this.state.tool_executions.length - 1];
      const success = payload.success ?? true;
      // Simple rolling average
      lastTool.success_rate = (lastTool.success_rate + (success ? 1 : 0)) / 2;
    }
  }

  private summarizeMessage(message: AnyMessage): string {
    const payload = message.payload as Record<string, unknown>;

    switch (message.type) {
      case "prompt.submit":
        const content = payload.content as string;
        return content ? content.slice(0, 100) + (content.length > 100 ? "..." : "") : "Prompt submitted";
      case "tool.propose":
        return `Tool: ${payload.tool_name || "unknown"} (${payload.risk_level || "?"})`;
      case "tool.result":
        return `Tool result: ${payload.success ? "success" : "failed"}`;
      case "gate.approve":
        return "Gate approved";
      case "gate.reject":
        return `Gate rejected: ${payload.reason || "no reason"}`;
      case "response.end":
        return `Response complete (${payload.finish_reason || "?"})`;
      default:
        return message.type;
    }
  }

  private updateDecisionSummary(): void {
    // Simple heuristic-based summary
    // In production, this could use AI summarization

    const parts: string[] = [];

    if (this.state.prompts_count > 0) {
      parts.push(`${this.state.prompts_count} prompt(s)`);
    }

    if (this.state.tool_executions.length > 0) {
      const toolNames = this.state.tool_executions.map((t) => t.tool_name).slice(0, 3);
      parts.push(`tools: ${toolNames.join(", ")}`);
    }

    if (this.state.approvals_count > 0) {
      parts.push(`${this.state.approvals_count} approval(s)`);
    }

    if (parts.length > 0) {
      this.state.decision_summary = `PVP session: ${parts.join("; ")}`;
    }
  }

  // =========================================================================
  // PERSISTENCE
  // =========================================================================

  private loadPersistedState(): void {
    try {
      if (existsSync(this.config.state_file)) {
        const data = readFileSync(this.config.state_file, "utf-8");
        const persisted = JSON.parse(data) as PersistentState;

        if (persisted.current_session) {
          this.state = persisted.current_session;
          logger.info({ session_id: this.state.session_id }, "Restored persisted state");
        }
        if (persisted.recent_commits) {
          this.recentCommits = persisted.recent_commits;
        }
      }
    } catch (err) {
      logger.warn({ error: err instanceof Error ? err.message : "Unknown" }, "Failed to load persisted state");
    }
  }

  private persistState(): void {
    try {
      const dir = dirname(this.config.state_file);
      if (!existsSync(dir)) {
        mkdirSync(dir, { recursive: true });
      }

      const persisted: PersistentState = {
        version: 1,
        current_session: this.state,
        recent_commits: this.recentCommits.slice(0, 100), // Keep last 100 commits
        config_hash: "", // Would hash config for change detection
      };

      writeFileSync(this.config.state_file, JSON.stringify(persisted, null, 2));
    } catch (err) {
      logger.error({ error: err instanceof Error ? err.message : "Unknown" }, "Failed to persist state");
    }
  }

  // =========================================================================
  // WEBHOOKS
  // =========================================================================

  private async triggerWebhooks(
    event: "commit" | "push" | "session_end",
    data: Record<string, unknown>
  ): Promise<void> {
    for (const webhook of this.config.webhooks) {
      if (!webhook.events.includes(event)) {
        continue;
      }

      try {
        const payload = JSON.stringify({
          event,
          timestamp: new Date().toISOString(),
          data,
        });

        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), webhook.timeout_ms);

        await fetch(webhook.url, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...(webhook.secret && { "X-PVP-Signature": this.signPayload(payload, webhook.secret) }),
          },
          body: payload,
          signal: controller.signal,
        });

        clearTimeout(timeout);
        logger.debug({ url: webhook.url, event }, "Webhook triggered");
      } catch (err) {
        logger.warn(
          { url: webhook.url, error: err instanceof Error ? err.message : "Unknown" },
          "Webhook failed"
        );
      }
    }
  }

  private signPayload(payload: string, secret: string): string {
    // In production, use HMAC-SHA256
    // For now, simple hash placeholder
    const crypto = require("crypto");
    return crypto.createHmac("sha256", secret).update(payload).digest("hex");
  }

  // =========================================================================
  // PUBLIC API FOR PVP SERVER INTEGRATION
  // =========================================================================

  /**
   * Called when PVP server receives a message
   */
  onMessage(message: AnyMessage): void {
    this.handleMessageReceived({ message });
  }

  /**
   * Called when a new session starts
   */
  onSessionStart(sessionId: SessionId, participants: ParticipantInfo[]): void {
    this.handleSessionStarted({ session_id: sessionId, participants });
  }

  /**
   * Called when a session ends
   */
  onSessionEnd(sessionId: SessionId): void {
    this.handleSessionEnded({ session_id: sessionId });
  }

  /**
   * Called when a participant joins/leaves
   */
  updateParticipants(participants: ParticipantInfo[]): void {
    this.state.active_participants = participants;
    this.persistState();
  }
}

// CLI entry point
if (import.meta.url === `file://${process.argv[1]}`) {
  const bridge = new PvpGitBridgeService();
  bridge.start().catch((err) => {
    console.error("Failed to start bridge:", err);
    process.exit(1);
  });
}
