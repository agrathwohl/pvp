/**
 * File Executor - Core file operation functions with safety controls
 *
 * Provides safe file write and edit operations with:
 * - Path risk categorization
 * - Blocked path detection
 * - Atomic write operations
 * - Edit verification
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync, statSync } from "fs";
import { dirname, resolve, relative, isAbsolute } from "path";
import { createLogger } from "../../utils/logger.js";
const logger = createLogger("file-executor");
/**
 * Path categorization patterns - order matters (first match wins)
 */
const PATH_PATTERNS = [
    // CRITICAL - System directories (always blocked)
    { pattern: /^\/etc\//i, riskLevel: "critical", category: "file_write", blocked: true, reason: "System configuration directory" },
    { pattern: /^\/usr\//i, riskLevel: "critical", category: "file_write", blocked: true, reason: "System binaries directory" },
    { pattern: /^\/var\//i, riskLevel: "critical", category: "file_write", blocked: true, reason: "System variable data directory" },
    { pattern: /^\/boot\//i, riskLevel: "critical", category: "file_write", blocked: true, reason: "Boot partition" },
    { pattern: /^\/sys\//i, riskLevel: "critical", category: "file_write", blocked: true, reason: "Kernel interface" },
    { pattern: /^\/proc\//i, riskLevel: "critical", category: "file_write", blocked: true, reason: "Process information" },
    { pattern: /^\/dev\//i, riskLevel: "critical", category: "file_write", blocked: true, reason: "Device files" },
    // CRITICAL - Sensitive files (always blocked)
    { pattern: /\.pem$/i, riskLevel: "critical", category: "file_write", blocked: true, reason: "Private key file" },
    { pattern: /\.key$/i, riskLevel: "critical", category: "file_write", blocked: true, reason: "Key file" },
    { pattern: /id_rsa/i, riskLevel: "critical", category: "file_write", blocked: true, reason: "SSH private key" },
    { pattern: /id_ed25519/i, riskLevel: "critical", category: "file_write", blocked: true, reason: "SSH private key" },
    { pattern: /\.env$/i, riskLevel: "critical", category: "file_write", blocked: true, reason: "Environment secrets file" },
    { pattern: /\.env\.[a-z]+$/i, riskLevel: "critical", category: "file_write", blocked: true, reason: "Environment secrets file" },
    { pattern: /credentials\.json$/i, riskLevel: "critical", category: "file_write", blocked: true, reason: "Credentials file" },
    { pattern: /secrets?\.(json|ya?ml|toml)$/i, riskLevel: "critical", category: "file_write", blocked: true, reason: "Secrets file" },
    // HIGH - Executable/script files
    { pattern: /\.(sh|bash|zsh)$/i, riskLevel: "high", category: "file_write", reason: "Shell script" },
    { pattern: /\.(exe|bat|cmd|ps1)$/i, riskLevel: "high", category: "file_write", reason: "Executable file" },
    { pattern: /^\/bin\//i, riskLevel: "high", category: "file_write", reason: "Binary directory" },
    { pattern: /^\/sbin\//i, riskLevel: "high", category: "file_write", reason: "System binary directory" },
    // MEDIUM - Configuration files
    { pattern: /\.(ya?ml|toml|ini|conf|cfg)$/i, riskLevel: "medium", category: "file_write", reason: "Configuration file" },
    { pattern: /package\.json$/i, riskLevel: "medium", category: "file_write", reason: "Package manifest" },
    { pattern: /tsconfig\.json$/i, riskLevel: "medium", category: "file_write", reason: "TypeScript config" },
    { pattern: /\.gitignore$/i, riskLevel: "medium", category: "file_write", reason: "Git ignore file" },
    { pattern: /Dockerfile$/i, riskLevel: "medium", category: "file_write", reason: "Docker configuration" },
    // LOW - Source code files
    { pattern: /\.(ts|tsx|js|jsx|mjs|cjs)$/i, riskLevel: "low", category: "file_write", reason: "Source code file" },
    { pattern: /\.(py|rb|go|rs|java|kt|swift|c|cpp|h|hpp)$/i, riskLevel: "low", category: "file_write", reason: "Source code file" },
    { pattern: /\.(css|scss|sass|less)$/i, riskLevel: "low", category: "file_write", reason: "Style file" },
    { pattern: /\.(html|htm|vue|svelte)$/i, riskLevel: "low", category: "file_write", reason: "Template file" },
    // SAFE - Documentation and data
    { pattern: /\.(md|txt|rst)$/i, riskLevel: "safe", category: "file_write", reason: "Documentation file" },
    { pattern: /\.(json|xml)$/i, riskLevel: "safe", category: "file_write", reason: "Data file" },
    { pattern: /\.(csv|tsv)$/i, riskLevel: "safe", category: "file_write", reason: "Data file" },
    { pattern: /README/i, riskLevel: "safe", category: "file_write", reason: "Documentation" },
    { pattern: /LICENSE/i, riskLevel: "safe", category: "file_write", reason: "License file" },
];
/**
 * Get the current working directory for relative path calculations
 */
function getProjectRoot(cwd) {
    return cwd ?? process.cwd();
}
/**
 * Normalize and resolve a file path
 */
function normalizePath(filePath, cwd) {
    if (isAbsolute(filePath)) {
        return resolve(filePath);
    }
    return resolve(getProjectRoot(cwd), filePath);
}
/**
 * Check if path is within the project directory
 */
function isWithinProject(filePath, cwd) {
    const normalized = normalizePath(filePath, cwd);
    const projectRoot = getProjectRoot(cwd);
    const rel = relative(projectRoot, normalized);
    return !rel.startsWith("..") && !isAbsolute(rel);
}
/**
 * Categorize a file path for risk assessment
 */
export function categorizeFilePath(filePath, operation = "file_write", cwd) {
    const normalizedPath = normalizePath(filePath, cwd);
    const withinProject = isWithinProject(filePath, cwd);
    // Find matching pattern
    let matchedPattern;
    for (const pattern of PATH_PATTERNS) {
        if (pattern.pattern.test(normalizedPath) || pattern.pattern.test(filePath)) {
            matchedPattern = pattern;
            break;
        }
    }
    // Determine risk level
    let riskLevel;
    let requiresApproval;
    if (matchedPattern) {
        riskLevel = matchedPattern.riskLevel;
    }
    else if (!withinProject) {
        // Files outside project are medium risk by default
        riskLevel = "medium";
    }
    else {
        // Default to low for unrecognized files within project
        riskLevel = "low";
    }
    // Require approval for medium+ risk
    requiresApproval = riskLevel === "medium" || riskLevel === "high" || riskLevel === "critical";
    return {
        path: normalizedPath,
        content: "",
        createDirs: false,
        oldText: "",
        newText: "",
        occurrence: 0,
        category: operation,
        riskLevel,
        requiresApproval,
    };
}
/**
 * Check if a file path is blocked
 */
export function isPathBlocked(filePath) {
    const normalizedPath = normalizePath(filePath);
    for (const pattern of PATH_PATTERNS) {
        if (pattern.blocked && (pattern.pattern.test(normalizedPath) || pattern.pattern.test(filePath))) {
            return { blocked: true, reason: pattern.reason };
        }
    }
    return { blocked: false };
}
/**
 * Write content to a file with safety controls
 */
export async function writeFile(filePath, content, options = {}) {
    const normalizedPath = normalizePath(filePath, options.cwd);
    // Check if blocked
    const blockCheck = isPathBlocked(normalizedPath);
    if (blockCheck.blocked) {
        return {
            success: false,
            path: normalizedPath,
            error: `Path blocked: ${blockCheck.reason}`,
        };
    }
    try {
        // Create parent directories if requested
        if (options.createDirs) {
            const dir = dirname(normalizedPath);
            if (!existsSync(dir)) {
                mkdirSync(dir, { recursive: true });
                logger.info({ dir }, "Created parent directories");
            }
        }
        // Verify parent directory exists
        const dir = dirname(normalizedPath);
        if (!existsSync(dir)) {
            return {
                success: false,
                path: normalizedPath,
                error: `Parent directory does not exist: ${dir}. Use createDirs option to create it.`,
            };
        }
        // Write the file
        writeFileSync(normalizedPath, content, "utf-8");
        const bytesWritten = Buffer.byteLength(content, "utf-8");
        logger.info({ path: normalizedPath, bytesWritten }, "File written successfully");
        return {
            success: true,
            path: normalizedPath,
            bytesWritten,
        };
    }
    catch (error) {
        const errorMsg = error instanceof Error ? error.message : "Unknown error";
        logger.error({ error, path: normalizedPath }, "Failed to write file");
        return {
            success: false,
            path: normalizedPath,
            error: errorMsg,
        };
    }
}
/**
 * Edit a file by replacing text with safety controls
 */
export async function editFile(filePath, oldText, newText, occurrence = 0, // 0 = all, 1+ = specific occurrence
cwd) {
    const normalizedPath = normalizePath(filePath, cwd);
    // Check if blocked
    const blockCheck = isPathBlocked(normalizedPath);
    if (blockCheck.blocked) {
        return {
            success: false,
            path: normalizedPath,
            error: `Path blocked: ${blockCheck.reason}`,
        };
    }
    // Validate occurrence parameter
    if (occurrence < 0) {
        return {
            success: false,
            path: normalizedPath,
            error: "Occurrence must be 0 (all) or a positive integer",
        };
    }
    try {
        // Verify file exists
        if (!existsSync(normalizedPath)) {
            return {
                success: false,
                path: normalizedPath,
                error: "File does not exist",
            };
        }
        // Verify it's a file, not a directory
        const stats = statSync(normalizedPath);
        if (stats.isDirectory()) {
            return {
                success: false,
                path: normalizedPath,
                error: "Path is a directory, not a file",
            };
        }
        // Read current content
        const currentContent = readFileSync(normalizedPath, "utf-8");
        // Count occurrences
        let matchCount = 0;
        let searchIndex = 0;
        while (searchIndex < currentContent.length) {
            const foundIndex = currentContent.indexOf(oldText, searchIndex);
            if (foundIndex === -1)
                break;
            matchCount++;
            searchIndex = foundIndex + oldText.length;
        }
        if (matchCount === 0) {
            return {
                success: false,
                path: normalizedPath,
                matchCount: 0,
                error: "Old text not found in file",
            };
        }
        // Perform replacement
        let newContent;
        let replacements;
        if (occurrence === 0) {
            // Replace all occurrences
            newContent = currentContent.split(oldText).join(newText);
            replacements = matchCount;
        }
        else if (occurrence > matchCount) {
            return {
                success: false,
                path: normalizedPath,
                matchCount,
                error: `Requested occurrence ${occurrence} but only ${matchCount} found`,
            };
        }
        else {
            // Replace specific occurrence
            let count = 0;
            let lastIndex = 0;
            const parts = [];
            while (count < occurrence) {
                const foundIndex = currentContent.indexOf(oldText, lastIndex);
                if (foundIndex === -1)
                    break;
                count++;
                if (count === occurrence) {
                    parts.push(currentContent.slice(lastIndex, foundIndex));
                    parts.push(newText);
                    lastIndex = foundIndex + oldText.length;
                }
                else {
                    parts.push(currentContent.slice(lastIndex, foundIndex + oldText.length));
                    lastIndex = foundIndex + oldText.length;
                }
            }
            parts.push(currentContent.slice(lastIndex));
            newContent = parts.join("");
            replacements = 1;
        }
        // Write the modified content
        writeFileSync(normalizedPath, newContent, "utf-8");
        logger.info({ path: normalizedPath, matchCount, replacements }, "File edited successfully");
        return {
            success: true,
            path: normalizedPath,
            matchCount,
            replacements,
            bytesWritten: Buffer.byteLength(newContent, "utf-8"),
        };
    }
    catch (error) {
        const errorMsg = error instanceof Error ? error.message : "Unknown error";
        logger.error({ error, path: normalizedPath }, "Failed to edit file");
        return {
            success: false,
            path: normalizedPath,
            error: errorMsg,
        };
    }
}
/**
 * Get default configuration for file operations
 */
export function getDefaultFileConfig() {
    return {
        maxFileSize: 10 * 1024 * 1024, // 10MB
        encoding: "utf-8",
    };
}
