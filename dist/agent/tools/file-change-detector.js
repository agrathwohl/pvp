/**
 * File Change Detector - Detects file modifications after shell execution
 *
 * Used to emit context.update messages for files changed by shell commands
 * or git operations, keeping all session participants synchronized.
 */
import { readdir, stat, readFile } from "node:fs/promises";
import { join, relative } from "node:path";
import { createMessage } from "../../protocol/messages.js";
// Files/directories to ignore during scanning
const IGNORE_PATTERNS = [
    /^\.git$/,
    /^node_modules$/,
    /^\.next$/,
    /^dist$/,
    /^build$/,
    /^coverage$/,
    /^\.cache$/,
    /^__pycache__$/,
    /\.pyc$/,
    /^\.DS_Store$/,
    /^\.env/,
];
function shouldIgnore(name) {
    return IGNORE_PATTERNS.some(pattern => pattern.test(name));
}
/**
 * Recursively scan directory and build file snapshot (mtime + size)
 */
export async function snapshotDirectory(dir, maxDepth = 5, currentDepth = 0) {
    const snapshot = new Map();
    if (currentDepth >= maxDepth)
        return snapshot;
    try {
        const entries = await readdir(dir, { withFileTypes: true });
        for (const entry of entries) {
            if (shouldIgnore(entry.name))
                continue;
            const fullPath = join(dir, entry.name);
            if (entry.isFile()) {
                try {
                    const stats = await stat(fullPath);
                    snapshot.set(fullPath, {
                        path: fullPath,
                        mtimeMs: stats.mtimeMs,
                        size: stats.size,
                    });
                }
                catch {
                    // Skip files we can't stat
                }
            }
            else if (entry.isDirectory()) {
                const subSnapshot = await snapshotDirectory(fullPath, maxDepth, currentDepth + 1);
                for (const [path, info] of subSnapshot) {
                    snapshot.set(path, info);
                }
            }
        }
    }
    catch {
        // Directory doesn't exist or can't be read
    }
    return snapshot;
}
/**
 * Compare two snapshots and detect changed/new files
 */
export async function detectChanges(before, workingDir, maxDepth = 5) {
    const after = await snapshotDirectory(workingDir, maxDepth);
    const changes = [];
    for (const [path, afterInfo] of after) {
        const beforeInfo = before.get(path);
        // New file or modified file (mtime or size changed)
        if (!beforeInfo ||
            beforeInfo.mtimeMs !== afterInfo.mtimeMs ||
            beforeInfo.size !== afterInfo.size) {
            try {
                const content = await readFile(path, "utf-8");
                const relativePath = relative(workingDir, path);
                changes.push({
                    path,
                    relativePath,
                    content,
                    changeType: beforeInfo ? "modified" : "created",
                });
            }
            catch {
                // Skip files we can't read (binary, permissions, etc.)
            }
        }
    }
    return changes;
}
/**
 * Create context.update messages for detected file changes
 */
export function createFileChangeMessages(changes, sessionId, agentId, source) {
    return changes.map(change => createMessage("context.update", sessionId, agentId, {
        key: `file:${change.relativePath}`,
        new_content: change.content,
        reason: `File ${change.changeType} by ${source}`,
    }));
}
/**
 * Get list of files affected by the most recent git commit
 */
export async function getCommittedFiles(workingDir) {
    const { spawn } = await import("bun");
    try {
        const proc = spawn(["git", "diff-tree", "--no-commit-id", "--name-only", "-r", "HEAD"], {
            cwd: workingDir,
            stdout: "pipe",
            stderr: "pipe",
        });
        const stdout = await new Response(proc.stdout).text();
        await proc.exited;
        return stdout
            .trim()
            .split("\n")
            .filter(line => line.length > 0);
    }
    catch {
        return [];
    }
}
/**
 * Create context.update messages for committed files
 */
export async function createCommitFileMessages(workingDir, sessionId, agentId, agentName) {
    const files = await getCommittedFiles(workingDir);
    const messages = [];
    for (const relativePath of files) {
        const fullPath = join(workingDir, relativePath);
        try {
            const content = await readFile(fullPath, "utf-8");
            messages.push(createMessage("context.update", sessionId, agentId, {
                key: `file:${relativePath}`,
                new_content: content,
                reason: `File committed by ${agentName}`,
            }));
        }
        catch {
            // Skip files we can't read (deleted in commit, binary, etc.)
        }
    }
    return messages;
}
