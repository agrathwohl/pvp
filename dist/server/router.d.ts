import { Session } from "./session.js";
import type { AnyMessage } from "../protocol/types.js";
export declare class MessageRouter {
    private gateManager;
    private participantManager;
    private contextManager;
    constructor();
    route(session: Session, message: AnyMessage, broadcast: (msg: AnyMessage, filter?: (id: string) => boolean) => void): Promise<void>;
    private handleSessionJoin;
    private handleSessionLeave;
    private handleSessionConfigUpdate;
    private handleRoleChange;
    private handleHeartbeat;
    private handlePresenceUpdate;
    private handleContextAdd;
    private handleContextUpdate;
    private handleContextRemove;
    private handlePromptSubmit;
    private handleToolPropose;
    private handleGateApprove;
    private handleGateReject;
    private handleInterrupt;
    private handleForkCreate;
    private handleToolResult;
    private createUnauthorizedError;
}
