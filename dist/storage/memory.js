import { createLogger } from "../utils/logger.js";
const logger = createLogger("storage:memory");
export class MemoryStorage {
    dataStore = new Map();
    async store(hash, content) {
        this.dataStore.set(hash, content);
        logger.debug({ hash, size: content.length }, "Content stored");
    }
    async retrieve(hash) {
        const content = this.dataStore.get(hash);
        if (!content) {
            logger.warn({ hash }, "Content not found");
            return null;
        }
        return content;
    }
    async has(hash) {
        return this.dataStore.has(hash);
    }
    async delete(hash) {
        const deleted = this.dataStore.delete(hash);
        if (deleted) {
            logger.debug({ hash }, "Content deleted");
        }
        return deleted;
    }
    async size() {
        return this.dataStore.size;
    }
    async clear() {
        this.dataStore.clear();
        logger.info("Storage cleared");
    }
}
