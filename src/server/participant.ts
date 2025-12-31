import { createLogger } from "../utils/logger.js";
import type {
  ParticipantId,
  ParticipantState,
  Role,
  Capability,
} from "../protocol/types.js";

const logger = createLogger("participant");

export class ParticipantManager {
  hasRole(participant: ParticipantState, role: Role): boolean {
    return participant.info.roles.includes(role);
  }

  hasCapability(participant: ParticipantState, capability: Capability): boolean {
    return participant.info.capabilities?.includes(capability) || false;
  }

  hasAnyRole(participant: ParticipantState, roles: Role[]): boolean {
    return roles.some((role) => participant.info.roles.includes(role));
  }

  canApprove(participant: ParticipantState): boolean {
    return (
      this.hasRole(participant, "approver") ||
      this.hasCapability(participant, "approve")
    );
  }

  canPrompt(participant: ParticipantState): boolean {
    return (
      this.hasRole(participant, "driver") ||
      this.hasRole(participant, "navigator") ||
      this.hasCapability(participant, "prompt")
    );
  }

  canInterrupt(participant: ParticipantState): boolean {
    return this.hasCapability(participant, "interrupt");
  }

  canFork(participant: ParticipantState): boolean {
    return this.hasCapability(participant, "fork");
  }

  canAddContext(participant: ParticipantState): boolean {
    return (
      this.hasCapability(participant, "add_context") ||
      this.hasRole(participant, "driver") ||
      this.hasRole(participant, "navigator")
    );
  }

  canManageParticipants(participant: ParticipantState): boolean {
    return (
      this.hasCapability(participant, "manage_participants") ||
      this.hasRole(participant, "admin")
    );
  }

  canEndSession(participant: ParticipantState): boolean {
    return (
      this.hasCapability(participant, "end_session") ||
      this.hasRole(participant, "admin")
    );
  }

  changeRoles(
    participant: ParticipantState,
    newRoles: Role[]
  ): { old: Role[]; new: Role[] } {
    const oldRoles = participant.info.roles;
    participant.info.roles = newRoles;
    logger.info(
      { participantId: participant.info.id, oldRoles, newRoles },
      "Participant roles changed"
    );
    return { old: oldRoles, new: newRoles };
  }
}
