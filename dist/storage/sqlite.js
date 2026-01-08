import Database from "better-sqlite3";
import { createLogger } from "../utils/logger.js";
const logger = createLogger("storage:sqlite");
export class SQLiteStorage {
    db;
    constructor(filepath = ":memory:") {
        this.db = new Database(filepath);
        this.initialize();
        logger.info({ filepath }, "SQLite storage initialized");
    }
    initialize() {
        this.db.exec(`
      CREATE TABLE IF NOT EXISTS content (
        hash TEXT PRIMARY KEY,
        data BLOB NOT NULL,
        size INTEGER NOT NULL,
        created_at TEXT NOT NULL,
        accessed_at TEXT NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_created_at ON content(created_at);
      CREATE INDEX IF NOT EXISTS idx_accessed_at ON content(accessed_at);
    `);
    }
    async store(hash, content) {
        const stmt = this.db.prepare(`
      INSERT OR REPLACE INTO content (hash, data, size, created_at, accessed_at)
      VALUES (?, ?, ?, ?, ?)
    `);
        const now = new Date().toISOString();
        stmt.run(hash, content, content.length, now, now);
        logger.debug({ hash, size: content.length }, "Content stored");
    }
    async retrieve(hash) {
        const stmt = this.db.prepare(`
      SELECT data FROM content WHERE hash = ?
    `);
        const row = stmt.get(hash);
        if (!row) {
            logger.warn({ hash }, "Content not found");
            return null;
        }
        // Update accessed_at
        const updateStmt = this.db.prepare(`
      UPDATE content SET accessed_at = ? WHERE hash = ?
    `);
        updateStmt.run(new Date().toISOString(), hash);
        return row.data;
    }
    async has(hash) {
        const stmt = this.db.prepare(`
      SELECT 1 FROM content WHERE hash = ? LIMIT 1
    `);
        const row = stmt.get(hash);
        return row !== undefined;
    }
    async delete(hash) {
        const stmt = this.db.prepare(`
      DELETE FROM content WHERE hash = ?
    `);
        const result = stmt.run(hash);
        const deleted = result.changes > 0;
        if (deleted) {
            logger.debug({ hash }, "Content deleted");
        }
        return deleted;
    }
    async size() {
        const stmt = this.db.prepare(`
      SELECT COUNT(*) as count FROM content
    `);
        const row = stmt.get();
        return row.count;
    }
    async clear() {
        this.db.exec(`DELETE FROM content`);
        logger.info("Storage cleared");
    }
    async vacuum() {
        this.db.exec(`VACUUM`);
        logger.info("Storage vacuumed");
    }
    close() {
        this.db.close();
        logger.info("Storage closed");
    }
    // Cleanup old content
    async deleteOlderThan(days) {
        const cutoff = new Date();
        cutoff.setDate(cutoff.getDate() - days);
        const stmt = this.db.prepare(`
      DELETE FROM content WHERE accessed_at < ?
    `);
        const result = stmt.run(cutoff.toISOString());
        const deleted = result.changes;
        logger.info({ days, deleted }, "Deleted old content");
        return deleted;
    }
}
