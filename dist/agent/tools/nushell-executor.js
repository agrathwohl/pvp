import { spawn } from "bun";
// Nu format conversion commands — if command already pipes to one, don't append `| to json`
const FORMAT_CONVERTERS = [
    "to json", "to csv", "to toml", "to yaml", "to xml",
    "to md", "to html", "to text", "to nuon", "to msgpack",
];
// Safe nu-native commands that auto-approve (read-only, no side effects)
const SAFE_COMMANDS = [
    // Filesystem reads
    "ls", "open", "glob", "du",
    // System info
    "sys", "ps", "version", "which", "uname",
    // Data inspection
    "describe", "length", "size", "columns", "values", "metadata",
    // Data transformation (no side effects — pure pipeline operations)
    "get", "select", "where", "sort-by", "group-by", "reverse",
    "first", "last", "skip", "take", "flatten", "transpose",
    "enumerate", "zip", "merge", "uniq", "compact", "reject",
    "rotate", "roll", "move", "insert", "update", "upsert",
    "append", "prepend", "collect", "reduce", "each", "par-each",
    "filter", "find", "any", "all", "empty",
    "wrap", "unwrap", "default", "fill",
    // Format conversion (output only — no file writes)
    "to", "from",
    // String operations
    "str", "split", "parse", "detect", "lines",
    // Math & numeric
    "math", "seq", "generate", "random",
    // Path operations (inspection only)
    "path",
    // Date/time
    "date", "cal",
    // Help/introspection
    "help", "input", "input list",
    // Type conversion
    "into",
    // Misc read-only
    "ansi", "char", "debug", "explain", "timeit",
    "format", "print", "echo",
    // History
    "history",
    // HTTP GET (read-only)
    "http get", "http head", "http options",
    // Nu plugin read-only commands
    "query json", "query xml", "query web", // query plugin — read-only queries
    "gstat", // gstat plugin — git status as structured data
    "from parquet", "from arrow", "from bson", // formats plugin — read operations
    "from sqlite", // formats plugin — read from sqlite
    "llm", // llm plugin — text generation/queries
];
// Safe external commands (passthrough via ^cmd) — low risk, auto-approve
const SAFE_EXTERNAL_COMMANDS = [
    "grep", "find", "cat", "head", "tail", "wc", "diff", "less", "more",
    "git status", "git log", "git diff", "git show", "git branch",
    "docker ps", "docker images", "docker logs",
    "kubectl get", "kubectl describe",
    "systemctl status", "journalctl",
    "curl", "wget",
];
// Write operations — require approval
const WRITE_COMMANDS = [
    // File mutations
    "save", "cp", "mv", "mkdir", "touch", "ln",
    // Git write operations
    "git add", "git commit", "git stash", "git push", "git merge", "git rebase", "git checkout",
    // Package managers
    "npm install", "npm add", "npm remove",
    "bun add", "bun remove", "bun install",
    "yarn add", "yarn remove",
    "pnpm add", "pnpm remove",
    // HTTP mutations
    "http post", "http put", "http patch", "http delete",
    // Docker write
    "docker build", "docker run", "docker exec", "docker pull",
    // Kubectl write
    "kubectl apply", "kubectl create", "kubectl edit", "kubectl patch",
    // Plugin write commands
    "query db", // query plugin — can execute SQL mutations
    "to parquet", "to arrow", "to bson", // formats plugin — file writes
    "to sqlite", // formats plugin — write to sqlite
];
// Destructive operations — high risk, require quorum
const DESTRUCTIVE_COMMANDS = [
    "rm",
    "git reset", "git clean", "git push --force",
    "kill", "pkill",
    "docker stop", "docker kill", "docker rm", "docker rmi",
    "kubectl delete",
    "npm uninstall", "bun remove",
    "truncate",
];
// Blocked operations — never execute
const BLOCKED_PATTERNS = [
    { pattern: /^rm\s+.*\/$/, reason: "Attempts to delete root filesystem" },
    { pattern: /^rm\s+.*-r\s+\/$/, reason: "Recursive deletion of root" },
    { pattern: /^rm\s+.*\/\s*$/, reason: "Attempts to delete root filesystem" },
    { pattern: /\bdd\b.*of=\/dev\//, reason: "Raw disk write operations" },
    { pattern: /^shutdown/, reason: "System shutdown" },
    { pattern: /^reboot/, reason: "System reboot" },
    { pattern: /^halt/, reason: "System halt" },
    { pattern: /^poweroff/, reason: "System poweroff" },
    { pattern: /^mkfs/, reason: "Filesystem creation" },
    { pattern: /^fdisk/, reason: "Disk partitioning" },
];
// Output redirect operators in nu elevate risk to write
const OUTPUT_REDIRECTS = /\b(out>|o>>|err>|e>>|o\+e>)\b/;
/**
 * Extract the first command in a pipeline for categorization.
 * Nu pipelines: `cmd1 | cmd2 | cmd3`
 * We check both the first command and any write-capable later stages.
 */
function extractPipelineCommands(command) {
    return command.split("|").map(s => s.trim());
}
/**
 * Check if a command string starts with a known command.
 */
function commandStartsWith(cmdStr, prefix) {
    return cmdStr === prefix || cmdStr.startsWith(prefix + " ") || cmdStr.startsWith(prefix + "\t");
}
/**
 * Categorizes a nushell command by risk level.
 * Conservative: unknown commands default to write/medium (require approval).
 */
export function categorizeNushellCommand(command, rawOutput = false, schemaOnly = false) {
    const trimmed = command.trim();
    // Schema probes are always read-only and safe — they only inspect structure
    if (schemaOnly) {
        return {
            command: trimmed,
            category: "read",
            riskLevel: "safe",
            requiresApproval: false,
            rawOutput: false,
            schemaOnly: true,
        };
    }
    // Check blocked patterns first
    for (const { pattern } of BLOCKED_PATTERNS) {
        if (pattern.test(trimmed)) {
            return {
                command: trimmed,
                category: "blocked",
                riskLevel: "critical",
                requiresApproval: true,
                rawOutput,
                schemaOnly: false,
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
            schemaOnly: false,
        };
    }
    // Analyze pipeline stages
    const stages = extractPipelineCommands(trimmed);
    let highestCategory = "read";
    let highestRisk = "safe";
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
                    schemaOnly: false,
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
            schemaOnly: false,
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
                schemaOnly: false,
            };
        }
    }
    // External command passthrough (^cmd) — check safe externals first
    if (firstStage.startsWith("^")) {
        for (const cmd of SAFE_EXTERNAL_COMMANDS) {
            if (commandStartsWith(normalizedFirst, cmd)) {
                return {
                    command: trimmed,
                    category: "read",
                    riskLevel: "safe",
                    requiresApproval: false,
                    rawOutput,
                    schemaOnly: false,
                };
            }
        }
        // Unknown external command — low risk, approval recommended
        return {
            command: trimmed,
            category: "read",
            riskLevel: "low",
            requiresApproval: true,
            rawOutput,
            schemaOnly: false,
        };
    }
    // Default: unknown commands require approval (safety-first)
    return {
        command: trimmed,
        category: "write",
        riskLevel: "medium",
        requiresApproval: true,
        rawOutput,
        schemaOnly: false,
    };
}
/**
 * Determines if a command should be blocked entirely
 */
export function isNushellCommandBlocked(cmd) {
    if (cmd.category === "blocked") {
        const match = BLOCKED_PATTERNS.find(p => p.pattern.test(cmd.command));
        return { blocked: true, reason: match?.reason || "Blocked command" };
    }
    return { blocked: false };
}
/**
 * Gets default execution config for a command category
 */
function getDefaultConfig(category) {
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
// Patterns for sensitive environment variables that should not be passed to nu
const SENSITIVE_ENV_PATTERNS = [
    /API_KEY$/i, /SECRET/i, /TOKEN$/i, /PASSWORD/i,
    /DATABASE_URL/i, /CONNECTION_STRING/i,
    /PRIVATE_KEY/i, /CREDENTIALS/i,
    /^AWS_SECRET/i, /^ANTHROPIC_API/i, /^OPENAI_API/i,
];
/**
 * Sanitize environment variables for nushell execution.
 * Filters out sensitive keys while preserving PATH, HOME, and other safe vars.
 */
export function sanitizeEnvForNu(env) {
    const result = {};
    for (const [key, value] of Object.entries(env)) {
        if (value && !SENSITIVE_ENV_PATTERNS.some(p => p.test(key))) {
            result[key] = value;
        }
    }
    return result;
}
/**
 * Check if command already has a format converter in the pipeline
 */
function hasFormatConverter(command) {
    const lower = command.toLowerCase();
    return FORMAT_CONVERTERS.some(fc => lower.includes(`| ${fc}`));
}
/**
 * Prepare the command string for execution.
 * - schema_only: rewrites to probe output structure
 * - raw_output: runs as-is
 * - default: appends `| to json` for structured output
 */
function prepareCommand(command, rawOutput, schemaOnly) {
    if (schemaOnly) {
        // Probe schema: run command, take first row, describe its structure
        return `${command} | first 1 | describe | to json`;
    }
    if (rawOutput)
        return command;
    if (hasFormatConverter(command))
        return command;
    return `${command} | to json`;
}
/**
 * Try to parse stdout as JSON for structured output
 */
function tryParseStructured(stdout) {
    if (!stdout.trim())
        return null;
    try {
        return JSON.parse(stdout);
    }
    catch {
        return null;
    }
}
/**
 * Executes a nushell command with safety controls using Bun.spawn
 */
export async function executeNushellCommand(nuPath, cmd, config, callbacks) {
    // Safety: Check if command is blocked
    const blockCheck = isNushellCommandBlocked(cmd);
    if (blockCheck.blocked) {
        const error = new Error(`Blocked: ${blockCheck.reason}`);
        callbacks.onError?.(error);
        throw error;
    }
    // Merge with defaults
    const defaultCfg = getDefaultConfig(cmd.category);
    const finalConfig = {
        timeout: config.timeout ?? defaultCfg.timeout,
        maxBuffer: config.maxBuffer ?? defaultCfg.maxBuffer,
        streaming: config.streaming ?? defaultCfg.streaming,
    };
    const preparedCommand = prepareCommand(cmd.command, cmd.rawOutput, cmd.schemaOnly);
    let proc;
    let stdoutData = "";
    let stderrData = "";
    let timeoutHandle = null;
    try {
        // Load user config by default so plugins are available.
        // Set PVP_NUSHELL_NO_CONFIG=true to skip user config for isolated execution.
        const skipConfig = process.env.PVP_NUSHELL_NO_CONFIG === "true";
        const nuArgs = skipConfig
            ? [nuPath, "--no-config-file", "-c", preparedCommand]
            : [nuPath, "-c", preparedCommand];
        // Spawn nu directly — no /bin/sh wrapper needed
        proc = spawn(nuArgs, {
            stdout: "pipe",
            stderr: "pipe",
            stdin: "ignore",
            cwd: cmd.cwd,
            env: sanitizeEnvForNu(process.env),
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
                        if (done)
                            break;
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
                }
                catch (err) {
                    callbacks.onError?.(err);
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
                        if (done)
                            break;
                        const chunk = decoder.decode(value, { stream: true });
                        stderrData += chunk;
                        callbacks.onStderr?.(chunk);
                    }
                }
                catch (err) {
                    callbacks.onError?.(err);
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
    }
    catch (error) {
        if (timeoutHandle) {
            clearTimeout(timeoutHandle);
        }
        callbacks.onError?.(error);
        throw error;
    }
}
