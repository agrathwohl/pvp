import { type ShellCommand } from "./shell-executor.js";
import type { SessionId, ParticipantId, MessageId, AnyMessage } from "../../protocol/types.js";
export interface ShellToolHandler {
    proposeCommand(command: string, sessionId: SessionId, agentId: ParticipantId): AnyMessage;
    executeCommand(toolProposalId: MessageId, shellCmd: ShellCommand, sessionId: SessionId, agentId: ParticipantId, broadcast: (msg: AnyMessage) => void): Promise<void>;
}
/**
 * Creates shell tool proposal messages for PVP protocol
 */
export declare function createShellToolHandler(): ShellToolHandler;
