import { createLogger } from "../utils/logger.js";
const logger = createLogger("participant");
export class ParticipantManager {
    hasRole(participant, role) {
        return participant.info.roles.includes(role);
    }
    hasCapability(participant, capability) {
        return participant.info.capabilities?.includes(capability) || false;
    }
    hasAnyRole(participant, roles) {
        return roles.some((role) => participant.info.roles.includes(role));
    }
    canApprove(participant) {
        return (this.hasRole(participant, "approver") ||
            this.hasCapability(participant, "approve"));
    }
    canPrompt(participant) {
        return (this.hasRole(participant, "driver") ||
            this.hasRole(participant, "navigator") ||
            this.hasCapability(participant, "prompt"));
    }
    canInterrupt(participant) {
        return this.hasCapability(participant, "interrupt");
    }
    canFork(participant) {
        return this.hasCapability(participant, "fork");
    }
    canAddContext(participant) {
        return (this.hasCapability(participant, "add_context") ||
            this.hasRole(participant, "driver") ||
            this.hasRole(participant, "navigator"));
    }
    canManageParticipants(participant) {
        return (this.hasCapability(participant, "manage_participants") ||
            this.hasRole(participant, "admin"));
    }
    canEndSession(participant) {
        return (this.hasCapability(participant, "end_session") ||
            this.hasRole(participant, "admin"));
    }
    changeRoles(participant, newRoles) {
        const oldRoles = participant.info.roles;
        participant.info.roles = newRoles;
        logger.info({ participantId: participant.info.id, oldRoles, newRoles }, "Participant roles changed");
        return { old: oldRoles, new: newRoles };
    }
}
