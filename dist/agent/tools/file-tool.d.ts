/**
 * File Tool Handler - PVP protocol integration for file operations
 *
 * Provides file_write and file_edit tool handlers following the
 * shell-tool.ts handler pattern with:
 * - Proposal message creation
 * - Execution with streaming output
 * - Result broadcasting
 */
import { type FileOperationResult } from "./file-executor.js";
import type { SessionId, ParticipantId, MessageId, AnyMessage } from "../../protocol/types.js";
export interface FileToolHandler {
    /**
     * Create a proposal for writing a file
     */
    proposeFileWrite(filePath: string, content: string, createDirs: boolean, sessionId: SessionId, agentId: ParticipantId): AnyMessage;
    /**
     * Execute an approved file write operation
     */
    executeFileWrite(toolProposalId: MessageId, filePath: string, content: string, createDirs: boolean, sessionId: SessionId, agentId: ParticipantId, broadcast: (msg: AnyMessage) => void): Promise<FileOperationResult>;
    /**
     * Create a proposal for editing a file
     */
    proposeFileEdit(filePath: string, oldText: string, newText: string, occurrence: number, sessionId: SessionId, agentId: ParticipantId): AnyMessage;
    /**
     * Execute an approved file edit operation
     */
    executeFileEdit(toolProposalId: MessageId, filePath: string, oldText: string, newText: string, occurrence: number, sessionId: SessionId, agentId: ParticipantId, broadcast: (msg: AnyMessage) => void): Promise<FileOperationResult>;
}
/**
 * Creates file tool handlers for PVP protocol
 */
export declare function createFileToolHandler(): FileToolHandler;
