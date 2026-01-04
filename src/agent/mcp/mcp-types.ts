import type { Tool as MCPTool } from "@modelcontextprotocol/sdk/types.js";
import type { ToolCategory, RiskLevel } from "../../protocol/types.js";

export type MCPTransportType = "stdio" | "sse" | "websocket";

export interface MCPServerConfig {
  name: string;
  command: string;
  args: string[];
  transport: MCPTransportType;
  env?: Record<string, string>;

  // Trust configuration
  trust_level: "untrusted" | "low" | "medium" | "high" | "trusted";
  default_category: ToolCategory;
  default_requires_approval: boolean;

  // Per-tool overrides
  tool_overrides?: Record<string, {
    category?: ToolCategory;
    risk_level?: RiskLevel;
    requires_approval?: boolean;
    blocked?: boolean;
    block_reason?: string;
  }>;

  // Health and lifecycle
  health_check_interval_ms?: number;
  reconnect_attempts?: number;
  reconnect_delay_ms?: number;
  startup_timeout_ms?: number;
}

export interface MCPToolDefinition {
  // Original MCP tool
  mcp_tool: MCPTool;

  // PVP integration
  server_name: string;
  namespaced_name: string;  // "filesystem__read_file"
  category: ToolCategory;
  risk_level: RiskLevel;
  requires_approval: boolean;
}

export interface MCPConnectionState {
  status: "disconnected" | "connecting" | "connected" | "error" | "reconnecting";
  last_error?: Error;
  last_connected_at?: Date;
  reconnect_attempts: number;
  tools: MCPToolDefinition[];
}

export interface MCPToolResult {
  success: boolean;
  content: unknown;
  error?: string;
  duration_ms: number;
}
