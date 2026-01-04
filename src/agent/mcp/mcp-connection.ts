import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { createLogger } from "../../utils/logger.js";
import type {
  MCPServerConfig,
  MCPConnectionState,
  MCPToolDefinition,
  MCPToolResult,
} from "./mcp-types.js";
import { categorizeMCPTool } from "./mcp-risk.js";

const logger = createLogger("mcp-connection");

export class MCPConnection {
  private client: Client | null = null;
  private transport: StdioClientTransport | null = null;
  private state: MCPConnectionState;
  private healthCheckInterval: ReturnType<typeof setInterval> | null = null;

  constructor(private config: MCPServerConfig) {
    this.state = {
      status: "disconnected",
      reconnect_attempts: 0,
      tools: [],
    };
  }

  get name(): string {
    return this.config.name;
  }

  get status(): MCPConnectionState["status"] {
    return this.state.status;
  }

  get tools(): MCPToolDefinition[] {
    return this.state.tools;
  }

  async connect(): Promise<void> {
    if (this.state.status === "connected") {
      return;
    }

    this.state.status = "connecting";
    logger.info({ server: this.config.name }, "Connecting to MCP server");

    try {
      // Create transport based on type
      if (this.config.transport === "stdio") {
        this.transport = new StdioClientTransport({
          command: this.config.command,
          args: this.config.args,
          env: this.config.env,
        });
      } else {
        throw new Error(`Transport ${this.config.transport} not yet implemented`);
      }

      // Create client
      this.client = new Client({
        name: "pvp-agent",
        version: "1.0.0",
      });

      // Connect with timeout
      const connectPromise = this.client.connect(this.transport);
      const timeoutPromise = new Promise<never>((_, reject) => {
        setTimeout(
          () => reject(new Error("Connection timeout")),
          this.config.startup_timeout_ms ?? 30000
        );
      });

      await Promise.race([connectPromise, timeoutPromise]);

      // Fetch and categorize tools
      await this.refreshTools();

      this.state.status = "connected";
      this.state.last_connected_at = new Date();
      this.state.reconnect_attempts = 0;

      // Start health monitoring
      this.startHealthCheck();

      logger.info(
        { server: this.config.name, toolCount: this.state.tools.length },
        "Connected to MCP server"
      );
    } catch (error) {
      this.state.status = "error";
      this.state.last_error = error as Error;
      logger.error({ server: this.config.name, error }, "Failed to connect to MCP server");
      throw error;
    }
  }

  async disconnect(): Promise<void> {
    this.stopHealthCheck();

    if (this.client) {
      try {
        await this.client.close();
      } catch (error) {
        logger.warn({ server: this.config.name, error }, "Error closing MCP client");
      }
      this.client = null;
    }

    this.transport = null;
    this.state.status = "disconnected";
    this.state.tools = [];

    logger.info({ server: this.config.name }, "Disconnected from MCP server");
  }

  async callTool(toolName: string, args: Record<string, unknown>): Promise<MCPToolResult> {
    if (!this.client || this.state.status !== "connected") {
      throw new Error(`MCP server ${this.config.name} is not connected`);
    }

    const startTime = Date.now();

    try {
      const response = await this.client.callTool({
        name: toolName,
        arguments: args,
      });

      return {
        success: true,
        content: response.content,
        duration_ms: Date.now() - startTime,
      };
    } catch (error) {
      return {
        success: false,
        content: null,
        error: error instanceof Error ? error.message : "Unknown error",
        duration_ms: Date.now() - startTime,
      };
    }
  }

  private async refreshTools(): Promise<void> {
    if (!this.client) return;

    const response = await this.client.listTools();

    this.state.tools = response.tools.map((mcpTool) => {
      const categorized = categorizeMCPTool(mcpTool, this.config);

      return {
        mcp_tool: mcpTool,
        server_name: this.config.name,
        namespaced_name: `${this.config.name}__${mcpTool.name}`,
        ...categorized,
      };
    });
  }

  private startHealthCheck(): void {
    const interval = this.config.health_check_interval_ms ?? 30000;
    if (interval <= 0) return;

    this.healthCheckInterval = setInterval(async () => {
      try {
        // Simple health check: try to list tools
        if (this.client) {
          await this.client.listTools();
        }
      } catch (error) {
        logger.warn({ server: this.config.name, error }, "Health check failed");
        this.handleConnectionLoss();
      }
    }, interval);
  }

  private stopHealthCheck(): void {
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
      this.healthCheckInterval = null;
    }
  }

  private async handleConnectionLoss(): Promise<void> {
    const maxAttempts = this.config.reconnect_attempts ?? 3;
    const delay = this.config.reconnect_delay_ms ?? 5000;

    if (this.state.reconnect_attempts >= maxAttempts) {
      this.state.status = "error";
      logger.error(
        { server: this.config.name, attempts: this.state.reconnect_attempts },
        "Max reconnection attempts reached"
      );
      return;
    }

    this.state.status = "reconnecting";
    this.state.reconnect_attempts++;

    logger.info(
      { server: this.config.name, attempt: this.state.reconnect_attempts },
      "Attempting to reconnect"
    );

    await this.disconnect();
    await new Promise((resolve) => setTimeout(resolve, delay));

    try {
      await this.connect();
    } catch (_error) {
      // Will retry on next health check or manual reconnect
    }
  }
}
