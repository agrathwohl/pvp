import type { Tool as MCPTool } from "@modelcontextprotocol/sdk/types.js";
import type { ToolCategory, RiskLevel } from "../../protocol/types.js";
import type { MCPServerConfig } from "./mcp-types.js";
export interface MCPToolCategorization {
    category: ToolCategory;
    risk_level: RiskLevel;
    requires_approval: boolean;
}
export declare function categorizeMCPTool(tool: MCPTool, serverConfig: MCPServerConfig): MCPToolCategorization;
export declare function isToolBlocked(toolName: string, serverConfig: MCPServerConfig): {
    blocked: boolean;
    reason?: string;
};
