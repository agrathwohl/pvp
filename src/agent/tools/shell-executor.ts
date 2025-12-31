import { spawn } from "bun";
import type { Subprocess } from "bun";

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

// Safety: Comprehensive command patterns with risk categorization
const COMMAND_PATTERNS: CommandPattern[] = [
  // ⛔ BLOCKED - Catastrophic operations
  { pattern: /^rm\s+.*-rf\s+\/$/, category: "blocked", riskLevel: "critical", blocked: true, reason: "Attempts to delete root filesystem" },
  { pattern: /^rm\s+.*-rf\s+\/\s/, category: "blocked", riskLevel: "critical", blocked: true, reason: "Attempts to delete root filesystem" },
  { pattern: /^dd\s+.*of=\/dev\//, category: "blocked", riskLevel: "critical", blocked: true, reason: "Raw disk write operations" },
  { pattern: /^mkfs/, category: "blocked", riskLevel: "critical", blocked: true, reason: "Filesystem creation" },
  { pattern: /^fdisk/, category: "blocked", riskLevel: "critical", blocked: true, reason: "Disk partitioning" },
  { pattern: /^shutdown/, category: "blocked", riskLevel: "critical", blocked: true, reason: "System shutdown" },
  { pattern: /^reboot/, category: "blocked", riskLevel: "critical", blocked: true, reason: "System reboot" },
  { pattern: /^halt/, category: "blocked", riskLevel: "critical", blocked: true, reason: "System halt" },
  { pattern: /^poweroff/, category: "blocked", riskLevel: "critical", blocked: true, reason: "System poweroff" },
  { pattern: /:\(\)\s*\{\s*:\|:&\s*\}\s*;\s*:/, category: "blocked", riskLevel: "critical", blocked: true, reason: "Fork bomb" },

  // 🔴 DESTRUCTIVE - High risk operations requiring quorum
  { pattern: /^rm\s+.*-r/, category: "destructive", riskLevel: "high", reason: "Recursive deletion" },
  { pattern: /^rm\s+.*-f/, category: "destructive", riskLevel: "high", reason: "Force deletion" },
  { pattern: /^killall/, category: "destructive", riskLevel: "high", reason: "Kill multiple processes" },
  { pattern: /^pkill/, category: "destructive", riskLevel: "high", reason: "Pattern-based process killing" },
  { pattern: /^systemctl\s+(stop|restart|reload)/, category: "destructive", riskLevel: "high", reason: "Service control" },
  { pattern: /^service\s+\w+\s+(stop|restart)/, category: "destructive", riskLevel: "high", reason: "Service control" },
  { pattern: /^docker\s+(stop|kill|rm)/, category: "destructive", riskLevel: "high", reason: "Container destruction" },
  { pattern: /^kubectl\s+delete/, category: "destructive", riskLevel: "high", reason: "Kubernetes resource deletion" },
  { pattern: /^npm\s+uninstall/, category: "destructive", riskLevel: "medium", reason: "Package removal" },
  { pattern: /^git\s+reset\s+--hard/, category: "destructive", riskLevel: "high", reason: "Destructive git operation" },
  { pattern: /^git\s+clean\s+-.*f/, category: "destructive", riskLevel: "high", reason: "Force clean untracked files" },
  { pattern: /^truncate/, category: "destructive", riskLevel: "medium", reason: "File truncation" },
  { pattern: />\s*\/dev\//, category: "destructive", riskLevel: "high", reason: "Device file write" },

  // 🟡 WRITE - Modification operations requiring approval
  { pattern: /^touch/, category: "write", riskLevel: "low", reason: "File creation" },
  { pattern: /^mkdir/, category: "write", riskLevel: "low", reason: "Directory creation" },
  { pattern: /^cp/, category: "write", riskLevel: "low", reason: "File copy" },
  { pattern: /^mv/, category: "write", riskLevel: "medium", reason: "File move/rename" },
  { pattern: /^chmod/, category: "write", riskLevel: "medium", reason: "Permission change" },
  { pattern: /^chown/, category: "write", riskLevel: "medium", reason: "Ownership change" },
  { pattern: /^ln/, category: "write", riskLevel: "low", reason: "Link creation" },
  { pattern: /^npm\s+install/, category: "write", riskLevel: "medium", reason: "Package installation" },
  { pattern: /^yarn\s+add/, category: "write", riskLevel: "medium", reason: "Package installation" },
  { pattern: /^bun\s+add/, category: "write", riskLevel: "medium", reason: "Package installation" },
  { pattern: /^git\s+commit/, category: "write", riskLevel: "low", reason: "Git commit" },
  { pattern: /^git\s+push/, category: "write", riskLevel: "medium", reason: "Git push" },
  { pattern: /^curl.*-X\s+(POST|PUT|DELETE|PATCH)/, category: "write", riskLevel: "medium", reason: "HTTP modification" },
  { pattern: /^wget.*--post/, category: "write", riskLevel: "medium", reason: "HTTP POST" },
  { pattern: /^echo.*>/, category: "write", riskLevel: "low", reason: "File write" },
  { pattern: /^tee/, category: "write", riskLevel: "low", reason: "File write" },
  { pattern: /^sed\s+-i/, category: "write", riskLevel: "medium", reason: "In-place file edit" },

  // 🟢 READ - Safe operations (auto-approve)
  { pattern: /^ls/, category: "read", riskLevel: "safe", reason: "Directory listing" },
  { pattern: /^cat/, category: "read", riskLevel: "safe", reason: "File reading" },
  { pattern: /^grep/, category: "read", riskLevel: "safe", reason: "Pattern search" },
  { pattern: /^find/, category: "read", riskLevel: "safe", reason: "File search" },
  { pattern: /^ps/, category: "read", riskLevel: "safe", reason: "Process listing" },
  { pattern: /^top/, category: "read", riskLevel: "safe", reason: "Process monitoring" },
  { pattern: /^htop/, category: "read", riskLevel: "safe", reason: "Process monitoring" },
  { pattern: /^df/, category: "read", riskLevel: "safe", reason: "Disk usage" },
  { pattern: /^du/, category: "read", riskLevel: "safe", reason: "Directory usage" },
  { pattern: /^free/, category: "read", riskLevel: "safe", reason: "Memory info" },
  { pattern: /^uptime/, category: "read", riskLevel: "safe", reason: "System uptime" },
  { pattern: /^whoami/, category: "read", riskLevel: "safe", reason: "User identity" },
  { pattern: /^pwd/, category: "read", riskLevel: "safe", reason: "Current directory" },
  { pattern: /^echo/, category: "read", riskLevel: "safe", reason: "Print text" },
  { pattern: /^date/, category: "read", riskLevel: "safe", reason: "Date/time" },
  { pattern: /^head/, category: "read", riskLevel: "safe", reason: "File head" },
  { pattern: /^tail/, category: "read", riskLevel: "safe", reason: "File tail" },
  { pattern: /^wc/, category: "read", riskLevel: "safe", reason: "Count lines/words" },
  { pattern: /^less/, category: "read", riskLevel: "safe", reason: "File pager" },
  { pattern: /^more/, category: "read", riskLevel: "safe", reason: "File pager" },
  { pattern: /^git\s+status/, category: "read", riskLevel: "safe", reason: "Git status" },
  { pattern: /^git\s+log/, category: "read", riskLevel: "safe", reason: "Git log" },
  { pattern: /^git\s+diff/, category: "read", riskLevel: "safe", reason: "Git diff" },
  { pattern: /^git\s+show/, category: "read", riskLevel: "safe", reason: "Git show" },
  { pattern: /^git\s+branch/, category: "read", riskLevel: "safe", reason: "Git branches" },
  { pattern: /^npm\s+list/, category: "read", riskLevel: "safe", reason: "Package list" },
  { pattern: /^docker\s+ps/, category: "read", riskLevel: "safe", reason: "Container list" },
  { pattern: /^docker\s+images/, category: "read", riskLevel: "safe", reason: "Image list" },
  { pattern: /^kubectl\s+get/, category: "read", riskLevel: "safe", reason: "K8s resource list" },
  { pattern: /^systemctl\s+status/, category: "read", riskLevel: "safe", reason: "Service status" },
  { pattern: /^journalctl/, category: "read", riskLevel: "safe", reason: "System logs" },
  { pattern: /^curl\s+(?!.*-X\s+(POST|PUT|DELETE|PATCH))/, category: "read", riskLevel: "safe", reason: "HTTP GET" },
  { pattern: /^wget\s+(?!.*--post)/, category: "read", riskLevel: "safe", reason: "HTTP download" },
];

/**
 * Analyzes a command and categorizes it by risk level
 */
export function categorizeCommand(command: string): ShellCommand {
  const parts = command.trim().split(/\s+/);
  const cmd = parts[0];
  const args = parts.slice(1);

  // Check against all patterns (most restrictive first)
  for (const pattern of COMMAND_PATTERNS) {
    if (pattern.pattern.test(command)) {
      if (pattern.blocked) {
        return {
          command: cmd,
          args,
          category: "blocked",
          riskLevel: pattern.riskLevel,
          requiresApproval: true,
        };
      }

      return {
        command: cmd,
        args,
        category: pattern.category,
        riskLevel: pattern.riskLevel,
        requiresApproval: pattern.category !== "read",
      };
    }
  }

  // Default: unknown commands require approval (safety-first)
  return {
    command: cmd,
    args,
    category: "write",
    riskLevel: "medium",
    requiresApproval: true,
  };
}

/**
 * Determines if a command should be blocked entirely
 */
export function isCommandBlocked(shellCmd: ShellCommand): { blocked: boolean; reason?: string } {
  if (shellCmd.category === "blocked") {
    const pattern = COMMAND_PATTERNS.find(p => p.blocked && p.pattern.test(`${shellCmd.command} ${shellCmd.args.join(" ")}`));
    return { blocked: true, reason: pattern?.reason || "Blocked command" };
  }
  return { blocked: false };
}

/**
 * Gets default configuration for a command category
 */
export function getDefaultConfig(category: CommandCategory): Partial<ShellExecutionConfig> {
  switch (category) {
    case "read":
      return {
        timeout: 30_000,      // 30s
        maxBuffer: 10 * 1024 * 1024, // 10MB
        interactive: false,
        streaming: true,
      };
    case "write":
      return {
        timeout: 60_000,      // 1m
        maxBuffer: 5 * 1024 * 1024,  // 5MB
        interactive: false,
        streaming: true,
      };
    case "destructive":
      return {
        timeout: 120_000,     // 2m
        maxBuffer: 1024 * 1024,      // 1MB
        interactive: false,
        streaming: true,
      };
    default:
      return {
        timeout: 30_000,
        maxBuffer: 10 * 1024 * 1024,
        interactive: false,
        streaming: true,
      };
  }
}

export interface StreamingOutput {
  onStdout?: (data: string) => void;
  onStderr?: (data: string) => void;
  onExit?: (code: number | null) => void;
  onError?: (error: Error) => void;
}

/**
 * Executes a shell command with comprehensive safety controls using Bun.spawn
 */
export async function executeShellCommand(
  shellCmd: ShellCommand,
  config: Partial<ShellExecutionConfig>,
  callbacks: StreamingOutput
): Promise<{ exitCode: number | null; stdout: string; stderr: string }> {
  // Safety: Check if command is blocked
  const blockCheck = isCommandBlocked(shellCmd);
  if (blockCheck.blocked) {
    const error = new Error(`Blocked: ${blockCheck.reason}`);
    callbacks.onError?.(error);
    throw error;
  }

  // Merge with defaults
  const defaultCfg = getDefaultConfig(shellCmd.category);
  const finalConfig: ShellExecutionConfig = {
    timeout: config.timeout ?? defaultCfg.timeout ?? 30_000,
    maxBuffer: config.maxBuffer ?? defaultCfg.maxBuffer ?? 10 * 1024 * 1024,
    interactive: config.interactive ?? defaultCfg.interactive ?? false,
    streaming: config.streaming ?? defaultCfg.streaming ?? true,
  };

  let proc: Subprocess;
  let stdoutData = "";
  let stderrData = "";
  let timeoutHandle: ReturnType<typeof setTimeout> | null = null;

  try {
    // Bun.spawn with safety controls
    proc = spawn([shellCmd.command, ...shellCmd.args], {
      stdout: "pipe",
      stderr: "pipe",
      stdin: "ignore",
      cwd: shellCmd.cwd,
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

            // Buffer limit enforcement
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

    return {
      exitCode,
      stdout: stdoutData,
      stderr: stderrData,
    };

  } catch (error) {
    if (timeoutHandle) {
      clearTimeout(timeoutHandle);
    }
    callbacks.onError?.(error as Error);
    throw error;
  }
}
