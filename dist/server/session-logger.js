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
import { createWriteStream, mkdirSync, existsSync } from "fs";
import { homedir } from "os";
import { join } from "path";
import { createLogger } from "../utils/logger.js";
const logger = createLogger("session-logger");
export class SessionLogger {
    logDir;
    streams = new Map();
    dirReady = false;
    constructor(logDir) {
        this.logDir = logDir || process.env.PVP_SESSION_LOG_DIR || join(homedir(), ".pvp", "sessions");
    }
    /**
     * Ensure the log directory exists (lazy, on first write).
     */
    ensureDir() {
        if (this.dirReady)
            return;
        if (!existsSync(this.logDir)) {
            mkdirSync(this.logDir, { recursive: true });
            logger.info({ logDir: this.logDir }, "Created session log directory");
        }
        this.dirReady = true;
    }
    /**
     * Get or create a write stream for a session.
     */
    getStream(sessionId) {
        let stream = this.streams.get(sessionId);
        if (stream && !stream.destroyed)
            return stream;
        this.ensureDir();
        const filePath = join(this.logDir, `${sessionId}.jsonl`);
        stream = createWriteStream(filePath, { flags: "a" });
        stream.on("error", (err) => {
            logger.warn({ error: err.message, sessionId }, "Session log write error");
        });
        this.streams.set(sessionId, stream);
        logger.debug({ sessionId, filePath }, "Opened session log");
        return stream;
    }
    /**
     * Append a message to the session's JSONL log.
     */
    writeMessage(sessionId, message) {
        try {
            const stream = this.getStream(sessionId);
            stream.write(JSON.stringify(message) + "\n");
        }
        catch (err) {
            logger.warn({ error: err.message, sessionId, messageId: message.id }, "Failed to write session log");
        }
    }
    /**
     * Get the file path for a session's log.
     */
    getSessionLogPath(sessionId) {
        return join(this.logDir, `${sessionId}.jsonl`);
    }
    /**
     * Get the log directory path.
     */
    getLogDir() {
        return this.logDir;
    }
    /**
     * Close the stream for a specific session.
     */
    closeSession(sessionId) {
        const stream = this.streams.get(sessionId);
        if (stream && !stream.destroyed) {
            stream.end();
            this.streams.delete(sessionId);
            logger.debug({ sessionId }, "Closed session log");
        }
    }
    /**
     * Close all streams (server shutdown).
     */
    close() {
        for (const [sessionId, stream] of this.streams) {
            if (!stream.destroyed) {
                stream.end();
            }
            this.streams.delete(sessionId);
        }
        logger.info("All session logs closed");
    }
}
