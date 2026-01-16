/**
 * NPM Tool Handler - PVP protocol integration for npm/yarn/bun package management
 *
 * Provides package management operations following the shell-tool.ts pattern:
 * - Proposal message creation with risk assessment
 * - Execution with streaming output
 * - File change detection for package.json, lockfiles, node_modules
 */
import type { SessionId, ParticipantId, MessageId, AnyMessage, RiskLevel, ToolCategory } from "../../protocol/types.js";
export type PackageManager = "npm" | "yarn" | "bun" | "pnpm";
export type NpmOperation = "init" | "install" | "add" | "remove" | "update" | "run" | "audit" | "list" | "outdated" | "publish" | "link" | "exec";
export interface NpmOperationConfig {
    riskLevel: RiskLevel;
    category: ToolCategory;
    requiresApproval: boolean;
    timeout: number;
}
export interface NpmExecutionResult {
    success: boolean;
    operation: NpmOperation;
    exitCode: number | null;
    stdout: string;
    stderr: string;
    executionTime: number;
    error?: string;
}
export interface NpmToolHandler {
    /**
     * Create a proposal for an npm operation
     */
    proposeNpmOperation(operation: NpmOperation, args: string[], sessionId: SessionId, agentId: ParticipantId, packageManager?: PackageManager): AnyMessage;
    /**
     * Execute an npm operation with streaming output
     */
    executeNpmOperation(toolProposalId: MessageId, operation: NpmOperation, args: string[], sessionId: SessionId, agentId: ParticipantId, broadcast: (msg: AnyMessage) => void, workingDir?: string, packageManager?: PackageManager): Promise<NpmExecutionResult>;
}
export declare function createNpmToolHandler(): NpmToolHandler;
