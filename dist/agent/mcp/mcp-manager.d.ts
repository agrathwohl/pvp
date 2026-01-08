import { MCPConnection } from "./mcp-connection.js";
import type { MCPServerConfig, MCPToolDefinition, MCPToolResult } from "./mcp-types.js";
export declare class MCPManager {
    private connections;
    private toolIndex;
    addServer(config: MCPServerConfig): Promise<void>;
    removeServer(name: string): Promise<void>;
    getConnection(name: string): MCPConnection | undefined;
    getAllTools(): MCPToolDefinition[];
    getTool(namespacedName: string): MCPToolDefinition | undefined;
    isMCPTool(toolName: string): boolean;
    parseToolName(namespacedName: string): {
        serverName: string;
        toolName: string;
    } | null;
    callTool(namespacedName: string, args: Record<string, unknown>): Promise<MCPToolResult>;
    shutdown(): Promise<void>;
    private indexTools;
}
