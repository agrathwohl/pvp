/**
 * PVP Server Configuration
 *
 * Configuration management for the PVP server including loading from files,
 * validation, and merging CLI options with defaults.
 *
 * @module config/server-config
 */
import { z } from "zod";
/**
 * Zod schema for validating server configuration.
 * @internal
 */
declare const ServerConfigSchema: z.ZodObject<{
    /** Port number for the WebSocket server (1-65535) */
    port: z.ZodDefault<z.ZodNumber>;
    /** Host address to bind to (e.g., "0.0.0.0" for all interfaces, "127.0.0.1" for localhost) */
    host: z.ZodDefault<z.ZodString>;
    /** Directory path for git repository storage used by decision tracking */
    git_dir: z.ZodDefault<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    host: string;
    port: number;
    git_dir: string;
}, {
    host?: string | undefined;
    port?: number | undefined;
    git_dir?: string | undefined;
}>;
/**
 * Server configuration options.
 *
 * @property port - Port number for WebSocket server (default: 3000)
 * @property host - Host address to bind to (default: "0.0.0.0" - all interfaces)
 * @property git_dir - Directory for git repositories used by decision tracking (default: "/tmp/pvp-git")
 *
 * @example
 * ```typescript
 * const config: ServerConfig = {
 *   port: 8080,
 *   host: "127.0.0.1",
 *   git_dir: "/var/pvp/repos"
 * };
 * ```
 */
export type ServerConfig = z.infer<typeof ServerConfigSchema>;
/**
 * Default server configuration values.
 * Used as fallback when no configuration is provided.
 */
export declare const DEFAULT_SERVER_CONFIG: ServerConfig;
/**
 * Load server configuration from a JSON file.
 *
 * @param configPath - Path to the JSON configuration file (relative or absolute)
 * @returns Validated server configuration
 * @throws Error if file not found
 * @throws ZodError if configuration is invalid
 *
 * @example
 * ```typescript
 * const config = loadServerConfig("./server-config.json");
 * console.log(`Server will run on port ${config.port}`);
 * ```
 */
export declare function loadServerConfig(configPath: string): ServerConfig;
/**
 * Validate raw server configuration against the schema.
 *
 * @param rawConfig - Unvalidated configuration object
 * @returns Validation result with either the validated config or validation errors
 *
 * @example
 * ```typescript
 * const result = validateServerConfig({ port: "invalid" });
 * if (result.valid) {
 *   console.log("Valid config:", result.config);
 * } else {
 *   console.error("Invalid:", result.errors?.issues);
 * }
 * ```
 */
export declare function validateServerConfig(rawConfig: unknown): {
    valid: boolean;
    errors?: z.ZodError;
    config?: ServerConfig;
};
/**
 * Merge CLI options with config file and defaults.
 *
 * Configuration priority (highest to lowest):
 * 1. CLI options (explicit command-line flags)
 * 2. Config file (if --config specified)
 * 3. Default values
 *
 * @param options - CLI options to merge
 * @param options.port - Port number as string (parsed to integer)
 * @param options.host - Host address to bind to
 * @param options.gitDir - Git repository directory path
 * @param options.config - Path to JSON configuration file
 * @returns Merged and validated server configuration
 * @throws ZodError if final configuration is invalid
 *
 * @example
 * ```typescript
 * // CLI: pvp-server --port 8080 --config ./config.json
 * const config = mergeServerConfig({
 *   port: "8080",
 *   config: "./config.json"
 * });
 * // port=8080 (from CLI), other values from config.json or defaults
 * ```
 */
export declare function mergeServerConfig(options: {
    port?: string;
    host?: string;
    gitDir?: string;
    config?: string;
}): ServerConfig;
export {};
