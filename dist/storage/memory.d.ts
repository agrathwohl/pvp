import type { ContentHash } from "../protocol/types.js";
export declare class MemoryStorage {
    private dataStore;
    store(hash: ContentHash, content: Buffer): Promise<void>;
    retrieve(hash: ContentHash): Promise<Buffer | null>;
    has(hash: ContentHash): Promise<boolean>;
    delete(hash: ContentHash): Promise<boolean>;
    size(): Promise<number>;
    clear(): Promise<void>;
}
