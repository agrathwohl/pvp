export type CommandCategory = "read" | "write" | "destructive" | "blocked";
export type RiskLevel = "safe" | "low" | "medium" | "high" | "critical";
export interface ShellCommand {
    command: string;
    args: string[];
    category: CommandCategory;
    riskLevel: RiskLevel;
    requiresApproval: boolean;
    timeout?: number;
    maxBuffer?: number;
    cwd?: string;
}
export interface ShellExecutionConfig {
    timeout: number;
    maxBuffer: number;
    interactive: boolean;
    streaming: boolean;
}
export interface CommandPattern {
    pattern: RegExp;
    category: CommandCategory;
    riskLevel: RiskLevel;
    blocked?: boolean;
    reason?: string;
}
/**
 * Analyzes a command and categorizes it by risk level
 */
export declare function categorizeCommand(command: string): ShellCommand;
/**
 * Determines if a command should be blocked entirely
 */
export declare function isCommandBlocked(shellCmd: ShellCommand): {
    blocked: boolean;
    reason?: string;
};
/**
 * Gets default configuration for a command category
 */
export declare function getDefaultConfig(category: CommandCategory): Partial<ShellExecutionConfig>;
export interface StreamingOutput {
    onStdout?: (data: string) => void;
    onStderr?: (data: string) => void;
    onExit?: (code: number | null) => void;
    onError?: (error: Error) => void;
}
/**
 * Executes a shell command with comprehensive safety controls using Bun.spawn
 */
export declare function executeShellCommand(shellCmd: ShellCommand, config: Partial<ShellExecutionConfig>, callbacks: StreamingOutput): Promise<{
    exitCode: number | null;
    stdout: string;
    stderr: string;
}>;
