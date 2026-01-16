/**
 * NPM Tool Handler - PVP protocol integration for npm/yarn/bun package management
 *
 * Provides package management operations following the shell-tool.ts pattern:
 * - Proposal message creation with risk assessment
 * - Execution with streaming output
 * - File change detection for package.json, lockfiles, node_modules
 */
import { createMessage } from "../../protocol/messages.js";
import { executeShellCommand } from "./shell-executor.js";
import { snapshotDirectory, detectChanges, createFileChangeMessages, } from "./file-change-detector.js";
// Operation configurations
const OPERATION_CONFIG = {
    init: { riskLevel: "low", category: "file_write", requiresApproval: false, timeout: 30_000 },
    install: { riskLevel: "medium", category: "file_write", requiresApproval: true, timeout: 300_000 },
    add: { riskLevel: "medium", category: "file_write", requiresApproval: true, timeout: 120_000 },
    remove: { riskLevel: "medium", category: "file_write", requiresApproval: true, timeout: 60_000 },
    update: { riskLevel: "medium", category: "file_write", requiresApproval: true, timeout: 300_000 },
    run: { riskLevel: "high", category: "shell_execute", requiresApproval: true, timeout: 600_000 },
    audit: { riskLevel: "low", category: "file_read", requiresApproval: false, timeout: 60_000 },
    list: { riskLevel: "low", category: "file_read", requiresApproval: false, timeout: 30_000 },
    outdated: { riskLevel: "low", category: "file_read", requiresApproval: false, timeout: 60_000 },
    publish: { riskLevel: "critical", category: "deploy", requiresApproval: true, timeout: 120_000 },
    link: { riskLevel: "medium", category: "file_write", requiresApproval: true, timeout: 30_000 },
    exec: { riskLevel: "high", category: "shell_execute", requiresApproval: true, timeout: 300_000 },
};
/**
 * Detect which package manager to use based on lockfiles
 */
async function detectPackageManager(workingDir) {
    const fs = await import("fs/promises");
    const path = await import("path");
    const checks = [
        { file: "bun.lockb", pm: "bun" },
        { file: "pnpm-lock.yaml", pm: "pnpm" },
        { file: "yarn.lock", pm: "yarn" },
        { file: "package-lock.json", pm: "npm" },
    ];
    for (const { file, pm } of checks) {
        try {
            await fs.access(path.join(workingDir, file));
            return pm;
        }
        catch {
            // File doesn't exist, try next
        }
    }
    // Default to npm if no lockfile found
    return "npm";
}
/**
 * Build the command array for the operation
 */
function buildCommand(pm, operation, args) {
    // Map operations to package manager commands
    const opMap = {
        npm: {
            init: "init",
            install: "install",
            add: "install",
            remove: "uninstall",
            update: "update",
            run: "run",
            audit: "audit",
            list: "list",
            outdated: "outdated",
            publish: "publish",
            link: "link",
            exec: "exec",
        },
        yarn: {
            init: "init",
            install: "install",
            add: "add",
            remove: "remove",
            update: "upgrade",
            run: "run",
            audit: "audit",
            list: "list",
            outdated: "outdated",
            publish: "publish",
            link: "link",
            exec: "dlx",
        },
        bun: {
            init: "init",
            install: "install",
            add: "add",
            remove: "remove",
            update: "update",
            run: "run",
            audit: "audit", // bun doesn't have audit, will fail gracefully
            list: "pm ls",
            outdated: "outdated",
            publish: "publish",
            link: "link",
            exec: "x",
        },
        pnpm: {
            init: "init",
            install: "install",
            add: "add",
            remove: "remove",
            update: "update",
            run: "run",
            audit: "audit",
            list: "list",
            outdated: "outdated",
            publish: "publish",
            link: "link",
            exec: "dlx",
        },
    };
    const subCommand = opMap[pm][operation];
    // Handle special cases
    if (pm === "bun" && operation === "exec") {
        // bunx is separate command
        return { command: "bunx", cmdArgs: args };
    }
    if (pm === "npm" && operation === "exec") {
        // npx is separate command
        return { command: "npx", cmdArgs: args };
    }
    // For bun list, split the subcommand
    if (pm === "bun" && operation === "list") {
        return { command: pm, cmdArgs: ["pm", "ls", ...args] };
    }
    return { command: pm, cmdArgs: [subCommand, ...args] };
}
/**
 * Generate human-readable description
 */
function getOperationDescription(pm, operation, args) {
    const descriptions = {
        init: () => `Initialize new ${pm} project`,
        install: (a) => a.length ? `Install ${a.join(", ")}` : "Install all dependencies",
        add: (a) => `Add package${a.length > 1 ? "s" : ""}: ${a.join(", ")}`,
        remove: (a) => `Remove package${a.length > 1 ? "s" : ""}: ${a.join(", ")}`,
        update: (a) => a.length ? `Update ${a.join(", ")}` : "Update all packages",
        run: (a) => `Run script: ${a[0] || "unknown"}`,
        audit: () => "Security audit",
        list: () => "List installed packages",
        outdated: () => "Check for outdated packages",
        publish: () => "Publish package to registry",
        link: (a) => a.length ? `Link ${a.join(", ")}` : "Link current package globally",
        exec: (a) => `Execute: ${a.join(" ")}`,
    };
    return descriptions[operation](args);
}
export function createNpmToolHandler() {
    return {
        proposeNpmOperation(operation, args, sessionId, agentId, packageManager = "npm") {
            const config = OPERATION_CONFIG[operation];
            const { command, cmdArgs } = buildCommand(packageManager, operation, args);
            const fullCommand = `${command} ${cmdArgs.join(" ")}`.trim();
            return createMessage("tool.propose", sessionId, agentId, {
                tool_name: "npm",
                arguments: {
                    operation,
                    args,
                    package_manager: packageManager,
                    full_command: fullCommand,
                },
                agent: agentId,
                risk_level: config.riskLevel,
                description: getOperationDescription(packageManager, operation, args),
                requires_approval: config.requiresApproval,
                category: config.category,
            });
        },
        async executeNpmOperation(toolProposalId, operation, args, sessionId, agentId, broadcast, workingDir, packageManager) {
            const startTime = Date.now();
            const effectiveWorkDir = workingDir || process.cwd();
            // Auto-detect package manager if not specified
            const pm = packageManager || await detectPackageManager(effectiveWorkDir);
            const config = OPERATION_CONFIG[operation];
            const { command, cmdArgs } = buildCommand(pm, operation, args);
            // Snapshot files before execution (for install/add/remove operations)
            const shouldTrackChanges = ["install", "add", "remove", "update", "init"].includes(operation);
            const beforeSnapshot = shouldTrackChanges
                ? await snapshotDirectory(effectiveWorkDir, 2) // Shallow depth for node_modules
                : new Map();
            // Broadcast execution start
            const startMsg = createMessage("tool.output", sessionId, agentId, {
                tool_proposal: toolProposalId,
                stream: "stdout",
                text: `$ ${command} ${cmdArgs.join(" ")}\n`,
                complete: false,
            });
            broadcast(startMsg);
            // Create shell command
            const shellCmd = {
                command,
                args: cmdArgs,
                category: config.category === "file_read" ? "read" : "write",
                riskLevel: config.riskLevel === "low" ? "safe" : config.riskLevel,
                requiresApproval: config.requiresApproval,
                timeout: config.timeout,
                cwd: effectiveWorkDir,
            };
            let exitCode = null;
            let stdout = "";
            let stderr = "";
            try {
                const result = await executeShellCommand(shellCmd, {}, {
                    onStdout: (data) => {
                        stdout += data;
                        const outputMsg = createMessage("tool.output", sessionId, agentId, {
                            tool_proposal: toolProposalId,
                            stream: "stdout",
                            text: data,
                            complete: false,
                        });
                        broadcast(outputMsg);
                    },
                    onStderr: (data) => {
                        stderr += data;
                        const outputMsg = createMessage("tool.output", sessionId, agentId, {
                            tool_proposal: toolProposalId,
                            stream: "stderr",
                            text: data,
                            complete: false,
                        });
                        broadcast(outputMsg);
                    },
                    onExit: (code) => {
                        exitCode = code;
                    },
                    onError: (error) => {
                        stderr += `\nExecution error: ${error.message}`;
                    },
                });
                exitCode = result.exitCode;
                const executionTime = Date.now() - startTime;
                // Detect and broadcast file changes
                if (shouldTrackChanges) {
                    const changes = await detectChanges(beforeSnapshot, effectiveWorkDir, 2);
                    const changeMessages = createFileChangeMessages(changes, sessionId, agentId, `npm ${operation}`);
                    for (const msg of changeMessages) {
                        broadcast(msg);
                    }
                }
                const success = exitCode === 0;
                // Broadcast completion
                const completeMsg = createMessage("tool.output", sessionId, agentId, {
                    tool_proposal: toolProposalId,
                    stream: success ? "stdout" : "stderr",
                    text: success
                        ? `\n✓ ${operation} completed successfully\n`
                        : `\n✗ ${operation} failed (exit code ${exitCode})\n`,
                    complete: true,
                });
                broadcast(completeMsg);
                // Send result
                const resultMsg = createMessage("tool.result", sessionId, agentId, {
                    tool_proposal: toolProposalId,
                    success,
                    result: success ? { operation, exitCode, stdout: stdout.slice(-2000) } : undefined,
                    error: !success ? `Exit code ${exitCode}: ${stderr.slice(-1000)}` : undefined,
                    duration_ms: executionTime,
                });
                broadcast(resultMsg);
                return {
                    success,
                    operation,
                    exitCode,
                    stdout,
                    stderr,
                    executionTime,
                };
            }
            catch (error) {
                const errorMsg = error instanceof Error ? error.message : "Unknown error";
                const executionTime = Date.now() - startTime;
                // Broadcast error
                const errorOutputMsg = createMessage("tool.output", sessionId, agentId, {
                    tool_proposal: toolProposalId,
                    stream: "stderr",
                    text: `\n✗ Error: ${errorMsg}\n`,
                    complete: true,
                });
                broadcast(errorOutputMsg);
                // Send error result
                const resultMsg = createMessage("tool.result", sessionId, agentId, {
                    tool_proposal: toolProposalId,
                    success: false,
                    error: errorMsg,
                    duration_ms: executionTime,
                });
                broadcast(resultMsg);
                return {
                    success: false,
                    operation,
                    exitCode: null,
                    stdout,
                    stderr,
                    executionTime,
                    error: errorMsg,
                };
            }
        },
    };
}
