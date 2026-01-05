import { z } from "zod";
import { readFileSync, existsSync } from "fs";
import { resolve } from "path";

// Zod schema for server configuration
const ServerConfigSchema = z.object({
  // Network settings
  port: z.number().int().positive().default(3000),
  host: z.string().default("0.0.0.0"),

  // Git repository settings
  git_dir: z.string().default("/tmp/pvp-git"),

  // Future expansion
  // log_level: z.enum(["debug", "info", "warn", "error"]).default("info"),
  // max_sessions: z.number().int().positive().optional(),
  // session_timeout_ms: z.number().int().positive().optional(),
});

export type ServerConfig = z.infer<typeof ServerConfigSchema>;

// Default configuration
export const DEFAULT_SERVER_CONFIG: ServerConfig = {
  port: 3000,
  host: "0.0.0.0",
  git_dir: "/tmp/pvp-git",
};

/**
 * Load server configuration from a JSON file
 */
export function loadServerConfig(configPath: string): ServerConfig {
  const absolutePath = resolve(configPath);

  if (!existsSync(absolutePath)) {
    throw new Error(`Config file not found: ${absolutePath}`);
  }

  const rawConfig = JSON.parse(readFileSync(absolutePath, "utf-8"));
  return ServerConfigSchema.parse(rawConfig);
}

/**
 * Validate server configuration
 */
export function validateServerConfig(rawConfig: unknown): {
  valid: boolean;
  errors?: z.ZodError;
  config?: ServerConfig;
} {
  try {
    const config = ServerConfigSchema.parse(rawConfig);
    return { valid: true, config };
  } catch (error) {
    if (error instanceof z.ZodError) {
      return { valid: false, errors: error };
    }
    throw error;
  }
}

/**
 * Merge CLI options with config file and defaults
 * Priority: CLI options > config file > defaults
 */
export function mergeServerConfig(options: {
  port?: string;
  host?: string;
  gitDir?: string;
  config?: string;
}): ServerConfig {
  // Start with defaults
  let config: ServerConfig = { ...DEFAULT_SERVER_CONFIG };

  // Load from config file if specified
  if (options.config) {
    const fileConfig = loadServerConfig(options.config);
    config = { ...config, ...fileConfig };
  }

  // Override with CLI options
  if (options.port !== undefined) {
    config.port = parseInt(options.port, 10);
  }
  if (options.host !== undefined) {
    config.host = options.host;
  }
  if (options.gitDir !== undefined) {
    config.git_dir = options.gitDir;
  }

  // Final validation
  return ServerConfigSchema.parse(config);
}
