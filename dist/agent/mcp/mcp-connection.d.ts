import type { MCPServerConfig, MCPConnectionState, MCPToolDefinition, MCPToolResult } from "./mcp-types.js";
export declare class MCPConnection {
    private config;
    private client;
    private transport;
    private state;
    private healthCheckInterval;
    constructor(config: MCPServerConfig);
    get name(): string;
    get status(): MCPConnectionState["status"];
    get tools(): MCPToolDefinition[];
    connect(): Promise<void>;
    disconnect(): Promise<void>;
    callTool(toolName: string, args: Record<string, unknown>): Promise<MCPToolResult>;
    private refreshTools;
    private startHealthCheck;
    private stopHealthCheck;
    private handleConnectionLoss;
}
