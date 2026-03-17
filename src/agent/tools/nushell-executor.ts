import { spawn } from "bun";
import type { Subprocess } from "bun";

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

// Nu format conversion commands — if command already pipes to one, don't append `| to json`
const FORMAT_CONVERTERS = [
  "to json", "to csv", "to toml", "to yaml", "to xml",
  "to md", "to html", "to text", "to nuon", "to msgpack",
];

// Safe nu-native commands that auto-approve (read-only, no side effects)
const SAFE_COMMANDS: string[] = [
  // Filesystem reads
  "ls", "open", "glob", "du",
  // System info
  "sys", "ps", "version", "which", "uname",
  // Data inspection
  "describe", "length", "columns", "values", "metadata",
  // Data transformation (no side effects)
  "get", "select", "where", "sort-by", "group-by", "reverse",
  "first", "last", "skip", "take", "flatten", "transpose",
  "enumerate", "zip", "merge", "uniq", "compact", "reject",
  // Format conversion (output only)
  "to", "from",
  // String operations
  "str", "split", "parse", "detect", "lines",
  // Math
  "math", "seq", "generate",
  // Path operations
  "path",
  // Date/time
  "date", "cal",
  // Help/introspection
  "help", "input",
  // Type conversion
  "into",
  // Misc read-only
  "ansi", "char", "debug", "explain", "timeit",
  "format", "print", "echo",
  // HTTP GET (read-only)
  "http get",
];

// Write operations — require approval
const WRITE_COMMANDS: string[] = [
  "save", "cp", "mv", "mkdir", "touch", "ln",
  "git add", "git commit", "git stash",
  "npm install", "npm add", "bun add", "yarn add",
  "http post", "http put", "http patch", "http delete",
];

// Destructive operations — high risk, require quorum
const DESTRUCTIVE_COMMANDS: string[] = [
  "rm",
  "git reset", "git clean", "git push --force",
  "kill",
  "docker stop", "docker kill", "docker rm",
];

// Blocked operations — never execute
const BLOCKED_PATTERNS: Array<{ pattern: RegExp; reason: string }> = [
  { pattern: /^rm\s+.*\/$/, reason: "Attempts to delete root filesystem" },
  { pattern: /^rm\s+.*-r\s+\/$/, reason: "Recursive deletion of root" },
  { pattern: /^rm\s+.*\/\s*$/, reason: "Attempts to delete root filesystem" },
  { pattern: /\bdd\b.*of=\/dev\//, reason: "Raw disk write operations" },
  { pattern: /^shutdown/, reason: "System shutdown" },
  { pattern: /^reboot/, reason: "System reboot" },
  { pattern: /^halt/, reason: "System halt" },
  { pattern: /^poweroff/, reason: "System poweroff" },
];

// Output redirect operators in nu elevate risk to write
const OUTPUT_REDIRECTS = /\b(out>|o>>|err>|e>>|o\+e>)\b/;

/**
 * Extract the first command in a pipeline for categorization.
 * Nu pipelines: `cmd1 | cmd2 | cmd3`
 * We check both the first command and any write-capable later stages.
 */
function extractPipelineCommands(command: string): string[] {
  return command.split("|").map(s => s.trim());
}

/**
 * Check if a command string starts with a known command.
 */
function commandStartsWith(cmdStr: string, prefix: string): boolean {
  return cmdStr === prefix || cmdStr.startsWith(prefix + " ") || cmdStr.startsWith(prefix + "\t");
}

/**
 * Categorizes a nushell command by risk level.
 * Conservative: unknown commands default to write/medium (require approval).
 */
export function categorizeNushellCommand(command: string, rawOutput: boolean = false): NushellCommand {
  const trimmed = command.trim();

  // Check blocked patterns first
  for (const { pattern } of BLOCKED_PATTERNS) {
    if (pattern.test(trimmed)) {
      return {
        command: trimmed,
        category: "blocked",
        riskLevel: "critical",
        requiresApproval: true,
        rawOutput,
      };
    }
  }

  // Check for output redirects — elevates to write
  if (OUTPUT_REDIRECTS.test(trimmed)) {
    return {
      command: trimmed,
      category: "write",
      riskLevel: "medium",
      requiresApproval: true,
      rawOutput,
    };
  }

  // Analyze pipeline stages
  const stages = extractPipelineCommands(trimmed);
  let highestCategory: CommandCategory = "read";
  let highestRisk: RiskLevel = "safe";

  for (const stage of stages) {
    // Check destructive first (highest priority)
    for (const cmd of DESTRUCTIVE_COMMANDS) {
      if (commandStartsWith(stage, cmd)) {
        return {
          command: trimmed,
          category: "destructive",
          riskLevel: "high",
          requiresApproval: true,
          rawOutput,
        };
      }
    }

    // Check write
    for (const cmd of WRITE_COMMANDS) {
      if (commandStartsWith(stage, cmd)) {
        highestCategory = "write";
        highestRisk = "medium";
      }
    }
  }

  // If we found a dangerous stage, return that
  if (highestCategory !== "read") {
    return {
      command: trimmed,
      category: highestCategory,
      riskLevel: highestRisk,
      requiresApproval: true,
      rawOutput,
    };
  }

  // Check if the first command is in the safe allowlist
  const firstStage = stages[0];
  // Handle external command prefix: ^grep -> grep for matching
  const normalizedFirst = firstStage.startsWith("^") ? firstStage.slice(1) : firstStage;

  for (const cmd of SAFE_COMMANDS) {
    if (commandStartsWith(normalizedFirst, cmd)) {
      return {
        command: trimmed,
        category: "read",
        riskLevel: "safe",
        requiresApproval: false,
        rawOutput,
      };
    }
  }

  // External command passthrough (^cmd) — low risk, approval recommended
  if (firstStage.startsWith("^")) {
    return {
      command: trimmed,
      category: "read",
      riskLevel: "low",
      requiresApproval: true,
      rawOutput,
    };
  }

  // Default: unknown commands require approval (safety-first)
  return {
    command: trimmed,
    category: "write",
    riskLevel: "medium",
    requiresApproval: true,
    rawOutput,
  };
}

/**
 * Determines if a command should be blocked entirely
 */
export function isNushellCommandBlocked(cmd: NushellCommand): { blocked: boolean; reason?: string } {
  if (cmd.category === "blocked") {
    const match = BLOCKED_PATTERNS.find(p => p.pattern.test(cmd.command));
    return { blocked: true, reason: match?.reason || "Blocked command" };
  }
  return { blocked: false };
}

/**
 * Gets default execution config for a command category
 */
function getDefaultConfig(category: CommandCategory): NushellExecutionConfig {
  switch (category) {
    case "read":
      return { timeout: 30_000, maxBuffer: 10 * 1024 * 1024, streaming: true };
    case "write":
      return { timeout: 60_000, maxBuffer: 5 * 1024 * 1024, streaming: true };
    case "destructive":
      return { timeout: 120_000, maxBuffer: 1024 * 1024, streaming: true };
    default:
      return { timeout: 30_000, maxBuffer: 10 * 1024 * 1024, streaming: true };
  }
}

/**
 * Check if command already has a format converter in the pipeline
 */
function hasFormatConverter(command: string): boolean {
  const lower = command.toLowerCase();
  return FORMAT_CONVERTERS.some(fc => lower.includes(`| ${fc}`));
}

/**
 * Prepare the command string for execution.
 * Appends `| to json` for structured output unless:
 * - raw_output is true
 * - command already has a format converter
 */
function prepareCommand(command: string, rawOutput: boolean): string {
  if (rawOutput) return command;
  if (hasFormatConverter(command)) return command;
  return `${command} | to json`;
}

/**
 * Try to parse stdout as JSON for structured output
 */
function tryParseStructured(stdout: string): unknown | null {
  if (!stdout.trim()) return null;
  try {
    return JSON.parse(stdout);
  } catch {
    return null;
  }
}

/**
 * Executes a nushell command with safety controls using Bun.spawn
 */
export async function executeNushellCommand(
  nuPath: string,
  cmd: NushellCommand,
  config: Partial<NushellExecutionConfig>,
  callbacks: StreamingOutput
): Promise<NushellResult> {
  // Safety: Check if command is blocked
  const blockCheck = isNushellCommandBlocked(cmd);
  if (blockCheck.blocked) {
    const error = new Error(`Blocked: ${blockCheck.reason}`);
    callbacks.onError?.(error);
    throw error;
  }

  // Merge with defaults
  const defaultCfg = getDefaultConfig(cmd.category);
  const finalConfig: NushellExecutionConfig = {
    timeout: config.timeout ?? defaultCfg.timeout,
    maxBuffer: config.maxBuffer ?? defaultCfg.maxBuffer,
    streaming: config.streaming ?? defaultCfg.streaming,
  };

  const preparedCommand = prepareCommand(cmd.command, cmd.rawOutput);

  let proc: Subprocess;
  let stdoutData = "";
  let stderrData = "";
  let timeoutHandle: ReturnType<typeof setTimeout> | null = null;

  try {
    // Spawn nu directly — no /bin/sh wrapper needed
    proc = spawn([nuPath, "--no-config-file", "-c", preparedCommand], {
      stdout: "pipe",
      stderr: "pipe",
      stdin: "ignore",
      cwd: cmd.cwd,
      env: process.env,
    });

    // Timeout enforcement
    if (finalConfig.timeout > 0) {
      timeoutHandle = setTimeout(() => {
        proc.kill();
        const error = new Error(`Command timeout after ${finalConfig.timeout}ms`);
        callbacks.onError?.(error);
      }, finalConfig.timeout);
    }

    // Streaming stdout
    if (proc.stdout && typeof proc.stdout !== "number" && finalConfig.streaming) {
      const reader = proc.stdout.getReader();
      const decoder = new TextDecoder();

      (async () => {
        try {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            const chunk = decoder.decode(value, { stream: true });
            stdoutData += chunk;

            if (stdoutData.length > finalConfig.maxBuffer) {
              proc.kill();
              const error = new Error(`Output exceeded ${finalConfig.maxBuffer} bytes`);
              callbacks.onError?.(error);
              break;
            }

            callbacks.onStdout?.(chunk);
          }
        } catch (err) {
          callbacks.onError?.(err as Error);
        }
      })();
    }

    // Streaming stderr
    if (proc.stderr && typeof proc.stderr !== "number" && finalConfig.streaming) {
      const reader = proc.stderr.getReader();
      const decoder = new TextDecoder();

      (async () => {
        try {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            const chunk = decoder.decode(value, { stream: true });
            stderrData += chunk;
            callbacks.onStderr?.(chunk);
          }
        } catch (err) {
          callbacks.onError?.(err as Error);
        }
      })();
    }

    // Wait for completion
    const exitCode = await proc.exited;

    if (timeoutHandle) {
      clearTimeout(timeoutHandle);
    }

    callbacks.onExit?.(exitCode);

    // Try to parse structured output
    const structured = tryParseStructured(stdoutData);

    return {
      exitCode,
      stdout: stdoutData,
      stderr: stderrData,
      structured,
    };

  } catch (error) {
    if (timeoutHandle) {
      clearTimeout(timeoutHandle);
    }
    callbacks.onError?.(error as Error);
    throw error;
  }
}
