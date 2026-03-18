export type CommandCategory = "read" | "write" | "destructive" | "blocked";
export type RiskLevel = "safe" | "low" | "medium" | "high" | "critical";
export interface NushellCommand {
    command: string;
    category: CommandCategory;
    riskLevel: RiskLevel;
    requiresApproval: boolean;
    timeout?: number;
    maxBuffer?: number;
    cwd?: string;
    rawOutput: boolean;
    schemaOnly: boolean;
}
export interface NushellExecutionConfig {
    timeout: number;
    maxBuffer: number;
    streaming: boolean;
}
export interface NushellResult {
    exitCode: number | null;
    stdout: string;
    stderr: string;
    structured: unknown | null;
}
export interface StreamingOutput {
    onStdout?: (data: string) => void;
    onStderr?: (data: string) => void;
    onExit?: (code: number | null) => void;
    onError?: (error: Error) => void;
}
/**
 * Categorizes a nushell command by risk level.
 * Conservative: unknown commands default to write/medium (require approval).
 */
export declare function categorizeNushellCommand(command: string, rawOutput?: boolean, schemaOnly?: boolean): NushellCommand;
/**
 * Determines if a command should be blocked entirely
 */
export declare function isNushellCommandBlocked(cmd: NushellCommand): {
    blocked: boolean;
    reason?: string;
};
/**
 * Sanitize environment variables for nushell execution.
 * Filters out sensitive keys while preserving PATH, HOME, and other safe vars.
 */
export declare function sanitizeEnvForNu(env: NodeJS.ProcessEnv): Record<string, string>;
/**
 * Executes a nushell command with safety controls using Bun.spawn
 */
export declare function executeNushellCommand(nuPath: string, cmd: NushellCommand, config: Partial<NushellExecutionConfig>, callbacks: StreamingOutput): Promise<NushellResult>;
