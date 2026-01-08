import { createLogger } from "../../utils/logger.js";
import { MCPConnection } from "./mcp-connection.js";
const logger = createLogger("mcp-manager");
export class MCPManager {
    connections = new Map();
    toolIndex = new Map();
    async addServer(config) {
        if (this.connections.has(config.name)) {
            throw new Error(`MCP server ${config.name} already registered`);
        }
        const connection = new MCPConnection(config);
        this.connections.set(config.name, connection);
        try {
            await connection.connect();
            this.indexTools(connection);
        }
        catch (error) {
            logger.error({ server: config.name, error }, "Failed to add MCP server");
            this.connections.delete(config.name);
            throw error;
        }
    }
    async removeServer(name) {
        const connection = this.connections.get(name);
        if (!connection)
            return;
        // Remove tools from index
        for (const tool of connection.tools) {
            this.toolIndex.delete(tool.namespaced_name);
        }
        await connection.disconnect();
        this.connections.delete(name);
    }
    getConnection(name) {
        return this.connections.get(name);
    }
    getAllTools() {
        return Array.from(this.toolIndex.values());
    }
    getTool(namespacedName) {
        return this.toolIndex.get(namespacedName);
    }
    isMCPTool(toolName) {
        return toolName.includes("__") && this.toolIndex.has(toolName);
    }
    parseToolName(namespacedName) {
        const parts = namespacedName.split("__");
        if (parts.length !== 2)
            return null;
        return { serverName: parts[0], toolName: parts[1] };
    }
    async callTool(namespacedName, args) {
        const parsed = this.parseToolName(namespacedName);
        if (!parsed) {
            return {
                success: false,
                content: null,
                error: `Invalid MCP tool name: ${namespacedName}`,
                duration_ms: 0,
            };
        }
        const connection = this.connections.get(parsed.serverName);
        if (!connection) {
            return {
                success: false,
                content: null,
                error: `MCP server not found: ${parsed.serverName}`,
                duration_ms: 0,
            };
        }
        if (connection.status !== "connected") {
            return {
                success: false,
                content: null,
                error: `MCP server ${parsed.serverName} is not connected (status: ${connection.status})`,
                duration_ms: 0,
            };
        }
        return connection.callTool(parsed.toolName, args);
    }
    async shutdown() {
        const shutdownPromises = Array.from(this.connections.values()).map((conn) => conn.disconnect().catch((error) => {
            logger.warn({ server: conn.name, error }, "Error during shutdown");
        }));
        await Promise.all(shutdownPromises);
        this.connections.clear();
        this.toolIndex.clear();
    }
    indexTools(connection) {
        for (const tool of connection.tools) {
            if (this.toolIndex.has(tool.namespaced_name)) {
                logger.warn({ tool: tool.namespaced_name }, "Duplicate tool name detected, overwriting");
            }
            this.toolIndex.set(tool.namespaced_name, tool);
        }
        logger.info({ server: connection.name, toolCount: connection.tools.length }, "Indexed MCP tools");
    }
}
