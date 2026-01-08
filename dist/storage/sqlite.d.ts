import type { ContentHash } from "../protocol/types.js";
export declare class SQLiteStorage {
    private db;
    constructor(filepath?: string);
    private initialize;
    store(hash: ContentHash, content: Buffer): Promise<void>;
    retrieve(hash: ContentHash): Promise<Buffer | null>;
    has(hash: ContentHash): Promise<boolean>;
    delete(hash: ContentHash): Promise<boolean>;
    size(): Promise<number>;
    clear(): Promise<void>;
    vacuum(): Promise<void>;
    close(): void;
    deleteOlderThan(days: number): Promise<number>;
}
