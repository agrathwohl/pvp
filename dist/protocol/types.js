/**
 * Pair Vibecoding Protocol (PVP) - Type Definitions
 * Version: 1.0.0-draft
 */
export function isStructuredToolResult(result) {
    return typeof result === "object" && result !== null && "exitCode" in result;
}
