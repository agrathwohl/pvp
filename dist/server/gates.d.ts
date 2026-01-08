import type { GateState, GateRequestPayload, QuorumRule, ParticipantId, ParticipantState } from "../protocol/types.js";
export declare class GateManager {
    evaluateQuorum(gate: GateState, participants: Map<ParticipantId, ParticipantState>): {
        met: boolean;
        reason?: string;
    };
    createGate(request: GateRequestPayload): GateState;
    addApproval(gate: GateState, approverId: ParticipantId): void;
    addRejection(gate: GateState, rejectorId: ParticipantId): void;
    isExpired(gate: GateState): boolean;
    getEligibleApprovers(quorum: QuorumRule, participants: Map<ParticipantId, ParticipantState>): ParticipantId[];
}
