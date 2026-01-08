/**
 * File Executor - Core file operation functions with safety controls
 *
 * Provides safe file write and edit operations with:
 * - Path risk categorization
 * - Blocked path detection
 * - Atomic write operations
 * - Edit verification
 */
export type RiskLevel = "safe" | "low" | "medium" | "high" | "critical";
export type FileCategory = "file_write" | "file_read" | "file_delete";
/**
 * File path pattern for risk categorization
 */
export interface FilePathPattern {
    pattern: RegExp;
    riskLevel: RiskLevel;
    category: FileCategory;
    blocked?: boolean;
    reason?: string;
}
/**
 * File write command structure
 */
export interface FileWriteCommand {
    path: string;
    content: string;
    createDirs: boolean;
    category: FileCategory;
    riskLevel: RiskLevel;
    requiresApproval: boolean;
}
/**
 * File edit command structure
 */
export interface FileEditCommand {
    path: string;
    oldText: string;
    newText: string;
    occurrence: number;
    category: FileCategory;
    riskLevel: RiskLevel;
    requiresApproval: boolean;
}
/**
 * Result of file operations
 */
export interface FileOperationResult {
    success: boolean;
    path: string;
    bytesWritten?: number;
    matchCount?: number;
    replacements?: number;
    error?: string;
}
/**
 * Categorize a file path for risk assessment
 */
export declare function categorizeFilePath(filePath: string, operation?: FileCategory, cwd?: string): FileWriteCommand | FileEditCommand;
/**
 * Check if a file path is blocked
 */
export declare function isPathBlocked(filePath: string): {
    blocked: boolean;
    reason?: string;
};
/**
 * Write content to a file with safety controls
 */
export declare function writeFile(filePath: string, content: string, options?: {
    createDirs?: boolean;
    cwd?: string;
}): Promise<FileOperationResult>;
/**
 * Edit a file by replacing text with safety controls
 */
export declare function editFile(filePath: string, oldText: string, newText: string, occurrence?: number, // 0 = all, 1+ = specific occurrence
cwd?: string): Promise<FileOperationResult>;
/**
 * Get default configuration for file operations
 */
export declare function getDefaultFileConfig(): {
    maxFileSize: number;
    encoding: BufferEncoding;
};
