/**
 * Session Logger — JSONL transcript persistence
 *
 * Writes every protocol message to a per-session JSONL file for
 * complete conversation provenance. Git commits reference session IDs
 * and message IDs via PVP trailers; this logger ensures those IDs
 * resolve to actual conversation history.
 *
 * Files: ~/.pvp/sessions/{sessionId}.jsonl
 * Format: one JSON object per line, raw MessageEnvelope
 */
import type { AnyMessage, SessionId } from "../protocol/types.js";
export declare class SessionLogger {
    private logDir;
    private streams;
    private dirReady;
    constructor(logDir?: string);
    /**
     * Ensure the log directory exists (lazy, on first write).
     */
    private ensureDir;
    /**
     * Get or create a write stream for a session.
     */
    private getStream;
    /**
     * Append a message to the session's JSONL log.
     */
    writeMessage(sessionId: SessionId, message: AnyMessage): void;
    /**
     * Get the file path for a session's log.
     */
    getSessionLogPath(sessionId: SessionId): string;
    /**
     * Get the log directory path.
     */
    getLogDir(): string;
    /**
     * Close the stream for a specific session.
     */
    closeSession(sessionId: SessionId): void;
    /**
     * Close all streams (server shutdown).
     */
    close(): void;
}
