import { createLogger } from "../utils/logger.js";
import type { ContentHash } from "../protocol/types.js";

const logger = createLogger("storage:memory");

export class MemoryStorage {
  private dataStore: Map<ContentHash, Buffer> = new Map();

  async store(hash: ContentHash, content: Buffer): Promise<void> {
    this.dataStore.set(hash, content);
    logger.debug({ hash, size: content.length }, "Content stored");
  }

  async retrieve(hash: ContentHash): Promise<Buffer | null> {
    const content = this.dataStore.get(hash);
    if (!content) {
      logger.warn({ hash }, "Content not found");
      return null;
    }
    return content;
  }

  async has(hash: ContentHash): Promise<boolean> {
    return this.dataStore.has(hash);
  }

  async delete(hash: ContentHash): Promise<boolean> {
    const deleted = this.dataStore.delete(hash);
    if (deleted) {
      logger.debug({ hash }, "Content deleted");
    }
    return deleted;
  }

  async size(): Promise<number> {
    return this.dataStore.size;
  }

  async clear(): Promise<void> {
    this.dataStore.clear();
    logger.info("Storage cleared");
  }
}
