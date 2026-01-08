import { z } from "zod";
import type { MCPServerConfig } from "../agent/mcp/mcp-types.js";
declare const MCPConfigSchema: z.ZodObject<{
    mcpServers: z.ZodRecord<z.ZodString, z.ZodObject<{
        name: z.ZodOptional<z.ZodString>;
        command: z.ZodString;
        args: z.ZodDefault<z.ZodArray<z.ZodString, "many">>;
        transport: z.ZodDefault<z.ZodEnum<["stdio", "sse", "websocket"]>>;
        env: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodString>>;
        trust_level: z.ZodDefault<z.ZodEnum<["untrusted", "low", "medium", "high", "trusted"]>>;
        default_category: z.ZodDefault<z.ZodEnum<["file_read", "file_write", "file_delete", "shell_execute", "network_request", "deploy", "database", "secret_access", "external_api", "all"]>>;
        default_requires_approval: z.ZodDefault<z.ZodBoolean>;
        tool_overrides: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodObject<{
            category: z.ZodOptional<z.ZodEnum<["file_read", "file_write", "file_delete", "shell_execute", "network_request", "deploy", "database", "secret_access", "external_api"]>>;
            risk_level: z.ZodOptional<z.ZodEnum<["low", "medium", "high", "critical"]>>;
            requires_approval: z.ZodOptional<z.ZodBoolean>;
            blocked: z.ZodOptional<z.ZodBoolean>;
            block_reason: z.ZodOptional<z.ZodString>;
        }, "strip", z.ZodTypeAny, {
            requires_approval?: boolean | undefined;
            category?: "file_read" | "file_write" | "file_delete" | "shell_execute" | "network_request" | "deploy" | "database" | "secret_access" | "external_api" | undefined;
            risk_level?: "low" | "medium" | "high" | "critical" | undefined;
            blocked?: boolean | undefined;
            block_reason?: string | undefined;
        }, {
            requires_approval?: boolean | undefined;
            category?: "file_read" | "file_write" | "file_delete" | "shell_execute" | "network_request" | "deploy" | "database" | "secret_access" | "external_api" | undefined;
            risk_level?: "low" | "medium" | "high" | "critical" | undefined;
            blocked?: boolean | undefined;
            block_reason?: string | undefined;
        }>>>;
        health_check_interval_ms: z.ZodOptional<z.ZodNumber>;
        reconnect_attempts: z.ZodDefault<z.ZodNumber>;
        reconnect_delay_ms: z.ZodDefault<z.ZodNumber>;
        startup_timeout_ms: z.ZodDefault<z.ZodNumber>;
    }, "strip", z.ZodTypeAny, {
        transport: "websocket" | "stdio" | "sse";
        command: string;
        args: string[];
        trust_level: "low" | "medium" | "high" | "untrusted" | "trusted";
        default_category: "file_read" | "file_write" | "file_delete" | "shell_execute" | "network_request" | "deploy" | "database" | "secret_access" | "external_api" | "all";
        default_requires_approval: boolean;
        reconnect_attempts: number;
        reconnect_delay_ms: number;
        startup_timeout_ms: number;
        name?: string | undefined;
        env?: Record<string, string> | undefined;
        tool_overrides?: Record<string, {
            requires_approval?: boolean | undefined;
            category?: "file_read" | "file_write" | "file_delete" | "shell_execute" | "network_request" | "deploy" | "database" | "secret_access" | "external_api" | undefined;
            risk_level?: "low" | "medium" | "high" | "critical" | undefined;
            blocked?: boolean | undefined;
            block_reason?: string | undefined;
        }> | undefined;
        health_check_interval_ms?: number | undefined;
    }, {
        command: string;
        transport?: "websocket" | "stdio" | "sse" | undefined;
        name?: string | undefined;
        env?: Record<string, string> | undefined;
        args?: string[] | undefined;
        trust_level?: "low" | "medium" | "high" | "untrusted" | "trusted" | undefined;
        default_category?: "file_read" | "file_write" | "file_delete" | "shell_execute" | "network_request" | "deploy" | "database" | "secret_access" | "external_api" | "all" | undefined;
        default_requires_approval?: boolean | undefined;
        tool_overrides?: Record<string, {
            requires_approval?: boolean | undefined;
            category?: "file_read" | "file_write" | "file_delete" | "shell_execute" | "network_request" | "deploy" | "database" | "secret_access" | "external_api" | undefined;
            risk_level?: "low" | "medium" | "high" | "critical" | undefined;
            blocked?: boolean | undefined;
            block_reason?: string | undefined;
        }> | undefined;
        health_check_interval_ms?: number | undefined;
        reconnect_attempts?: number | undefined;
        reconnect_delay_ms?: number | undefined;
        startup_timeout_ms?: number | undefined;
    }>>;
}, "strip", z.ZodTypeAny, {
    mcpServers: Record<string, {
        transport: "websocket" | "stdio" | "sse";
        command: string;
        args: string[];
        trust_level: "low" | "medium" | "high" | "untrusted" | "trusted";
        default_category: "file_read" | "file_write" | "file_delete" | "shell_execute" | "network_request" | "deploy" | "database" | "secret_access" | "external_api" | "all";
        default_requires_approval: boolean;
        reconnect_attempts: number;
        reconnect_delay_ms: number;
        startup_timeout_ms: number;
        name?: string | undefined;
        env?: Record<string, string> | undefined;
        tool_overrides?: Record<string, {
            requires_approval?: boolean | undefined;
            category?: "file_read" | "file_write" | "file_delete" | "shell_execute" | "network_request" | "deploy" | "database" | "secret_access" | "external_api" | undefined;
            risk_level?: "low" | "medium" | "high" | "critical" | undefined;
            blocked?: boolean | undefined;
            block_reason?: string | undefined;
        }> | undefined;
        health_check_interval_ms?: number | undefined;
    }>;
}, {
    mcpServers: Record<string, {
        command: string;
        transport?: "websocket" | "stdio" | "sse" | undefined;
        name?: string | undefined;
        env?: Record<string, string> | undefined;
        args?: string[] | undefined;
        trust_level?: "low" | "medium" | "high" | "untrusted" | "trusted" | undefined;
        default_category?: "file_read" | "file_write" | "file_delete" | "shell_execute" | "network_request" | "deploy" | "database" | "secret_access" | "external_api" | "all" | undefined;
        default_requires_approval?: boolean | undefined;
        tool_overrides?: Record<string, {
            requires_approval?: boolean | undefined;
            category?: "file_read" | "file_write" | "file_delete" | "shell_execute" | "network_request" | "deploy" | "database" | "secret_access" | "external_api" | undefined;
            risk_level?: "low" | "medium" | "high" | "critical" | undefined;
            blocked?: boolean | undefined;
            block_reason?: string | undefined;
        }> | undefined;
        health_check_interval_ms?: number | undefined;
        reconnect_attempts?: number | undefined;
        reconnect_delay_ms?: number | undefined;
        startup_timeout_ms?: number | undefined;
    }>;
}>;
export type MCPConfig = z.infer<typeof MCPConfigSchema>;
export declare function loadMCPConfig(rawConfig: unknown): MCPServerConfig[];
export declare function validateMCPConfig(rawConfig: unknown): {
    valid: boolean;
    errors?: z.ZodError;
    config?: MCPServerConfig[];
};
export declare const MCP_SERVER_PRESETS: Record<string, Partial<MCPServerConfig>>;
export declare function applyPreset(baseConfig: Partial<MCPServerConfig>, presetName: string): MCPServerConfig;
export declare function createMCPServerConfig(name: string, command: string, args?: string[], options?: Partial<MCPServerConfig>): MCPServerConfig;
export {};
