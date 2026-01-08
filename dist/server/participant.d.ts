import type { ParticipantState, Role, Capability } from "../protocol/types.js";
export declare class ParticipantManager {
    hasRole(participant: ParticipantState, role: Role): boolean;
    hasCapability(participant: ParticipantState, capability: Capability): boolean;
    hasAnyRole(participant: ParticipantState, roles: Role[]): boolean;
    canApprove(participant: ParticipantState): boolean;
    canPrompt(participant: ParticipantState): boolean;
    canInterrupt(participant: ParticipantState): boolean;
    canFork(participant: ParticipantState): boolean;
    canAddContext(participant: ParticipantState): boolean;
    canManageParticipants(participant: ParticipantState): boolean;
    canEndSession(participant: ParticipantState): boolean;
    changeRoles(participant: ParticipantState, newRoles: Role[]): {
        old: Role[];
        new: Role[];
    };
}
