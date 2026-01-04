import { z } from "zod";
import type { MCPServerConfig } from "../agent/mcp/mcp-types.js";

// Zod schema for validation
const MCPToolOverrideSchema = z.object({
  category: z.enum([
    "file_read", "file_write", "file_delete", "shell_execute",
    "network_request", "deploy", "database", "secret_access", "external_api"
  ]).optional(),
  risk_level: z.enum(["low", "medium", "high", "critical"]).optional(),
  requires_approval: z.boolean().optional(),
  blocked: z.boolean().optional(),
  block_reason: z.string().optional(),
});

const MCPServerConfigSchema = z.object({
  name: z.string().optional(), // Will be filled from key
  command: z.string(),
  args: z.array(z.string()).default([]),
  transport: z.enum(["stdio", "sse", "websocket"]).default("stdio"),
  env: z.record(z.string()).optional(),

  trust_level: z.enum(["untrusted", "low", "medium", "high", "trusted"]).default("medium"),
  default_category: z.enum([
    "file_read", "file_write", "file_delete", "shell_execute",
    "network_request", "deploy", "database", "secret_access", "external_api", "all"
  ]).default("external_api"),
  default_requires_approval: z.boolean().default(true),

  tool_overrides: z.record(MCPToolOverrideSchema).optional(),

  health_check_interval_ms: z.number().positive().optional(),
  reconnect_attempts: z.number().nonnegative().default(3),
  reconnect_delay_ms: z.number().positive().default(5000),
  startup_timeout_ms: z.number().positive().default(30000),
});

const MCPConfigSchema = z.object({
  mcpServers: z.record(MCPServerConfigSchema),
});

export type MCPConfig = z.infer<typeof MCPConfigSchema>;

export function loadMCPConfig(rawConfig: unknown): MCPServerConfig[] {
  const parsed = MCPConfigSchema.parse(rawConfig);

  return Object.entries(parsed.mcpServers).map(([name, config]) => ({
    ...config,
    name,
    args: config.args ?? [],
  } as MCPServerConfig));
}

export function validateMCPConfig(rawConfig: unknown): {
  valid: boolean;
  errors?: z.ZodError;
  config?: MCPServerConfig[];
} {
  try {
    const config = loadMCPConfig(rawConfig);
    return { valid: true, config };
  } catch (error) {
    if (error instanceof z.ZodError) {
      return { valid: false, errors: error };
    }
    throw error;
  }
}

// Default configurations for common MCP servers
export const MCP_SERVER_PRESETS: Record<string, Partial<MCPServerConfig>> = {
  filesystem: {
    transport: "stdio",
    trust_level: "medium",
    default_category: "file_write",
    tool_overrides: {
      read_file: { category: "file_read", requires_approval: false },
      read_multiple_files: { category: "file_read", requires_approval: false },
      list_directory: { category: "file_read", requires_approval: false },
      search_files: { category: "file_read", requires_approval: false },
      get_file_info: { category: "file_read", requires_approval: false },
      write_file: { category: "file_write", requires_approval: true },
      create_directory: { category: "file_write", requires_approval: true },
      move_file: { category: "file_write", requires_approval: true },
      delete_file: { category: "file_delete", requires_approval: true, risk_level: "high" },
    },
  },
  "sequential-thinking": {
    transport: "stdio",
    trust_level: "trusted",
    default_category: "file_read", // It's a thinking tool, doesn't modify anything
    default_requires_approval: false,
  },
  playwright: {
    transport: "stdio",
    trust_level: "medium",
    default_category: "network_request",
    default_requires_approval: true,
  },
};

export function applyPreset(
  baseConfig: Partial<MCPServerConfig>,
  presetName: string
): MCPServerConfig {
  const preset = MCP_SERVER_PRESETS[presetName];
  if (!preset) {
    throw new Error(`Unknown MCP server preset: ${presetName}`);
  }

  const merged = {
    ...preset,
    ...baseConfig,
    tool_overrides: {
      ...preset.tool_overrides,
      ...baseConfig.tool_overrides,
    },
  };

  return MCPServerConfigSchema.parse(merged) as MCPServerConfig;
}

export function createMCPServerConfig(
  name: string,
  command: string,
  args: string[] = [],
  options: Partial<MCPServerConfig> = {}
): MCPServerConfig {
  return MCPServerConfigSchema.parse({
    name,
    command,
    args,
    ...options,
  }) as MCPServerConfig;
}
