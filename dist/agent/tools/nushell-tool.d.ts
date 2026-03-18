import { type NushellCommand, type NushellResult } from "./nushell-executor.js";
import type { SessionId, ParticipantId, MessageId, AnyMessage } from "../../protocol/types.js";
export interface NushellToolHandler {
    proposeCommand(nuCmd: NushellCommand, sessionId: SessionId, agentId: ParticipantId): AnyMessage;
    executeCommand(toolProposalId: MessageId, nuCmd: NushellCommand, nuPath: string, sessionId: SessionId, agentId: ParticipantId, broadcast: (msg: AnyMessage) => void, workingDir?: string): Promise<NushellResult>;
}
/**
 * Creates nushell tool proposal and execution handlers for PVP protocol
 */
export declare function createNushellToolHandler(): NushellToolHandler;
