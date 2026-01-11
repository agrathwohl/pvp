/**
 * File Change Detector - Detects file modifications after shell execution
 *
 * Used to emit context.update messages for files changed by shell commands
 * or git operations, keeping all session participants synchronized.
 */
import type { SessionId, ParticipantId, AnyMessage } from "../../protocol/types.js";
export interface FileSnapshot {
    path: string;
    mtimeMs: number;
    size: number;
}
export interface FileChange {
    path: string;
    relativePath: string;
    content: string;
    changeType: "modified" | "created";
}
/**
 * Recursively scan directory and build file snapshot (mtime + size)
 */
export declare function snapshotDirectory(dir: string, maxDepth?: number, currentDepth?: number): Promise<Map<string, FileSnapshot>>;
/**
 * Compare two snapshots and detect changed/new files
 */
export declare function detectChanges(before: Map<string, FileSnapshot>, workingDir: string, maxDepth?: number): Promise<FileChange[]>;
/**
 * Create context.update messages for detected file changes
 */
export declare function createFileChangeMessages(changes: FileChange[], sessionId: SessionId, agentId: ParticipantId, source: string): AnyMessage[];
/**
 * Get list of files affected by the most recent git commit
 */
export declare function getCommittedFiles(workingDir: string): Promise<string[]>;
/**
 * Create context.update messages for committed files
 */
export declare function createCommitFileMessages(workingDir: string, sessionId: SessionId, agentId: ParticipantId, agentName: string): Promise<AnyMessage[]>;
