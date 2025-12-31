import { createLogger } from "../utils/logger.js";
import type {
  GateState,
  GateRequestPayload,
  QuorumRule,
  ParticipantId,
  ParticipantState,
  Role,
} from "../protocol/types.js";

const logger = createLogger("gates");

export class GateManager {
  evaluateQuorum(
    gate: GateState,
    participants: Map<ParticipantId, ParticipantState>
  ): { met: boolean; reason?: string } {
    const { quorum } = gate.request;
    const approvals = gate.approvals.length;
    const rejections = gate.rejections.length;

    // Any rejection immediately fails the gate
    if (rejections > 0) {
      return { met: false, reason: "Gate rejected" };
    }

    switch (quorum.type) {
      case "any": {
        const met = approvals >= quorum.count;
        return {
          met,
          reason: met ? undefined : `Need ${quorum.count} approvals, have ${approvals}`,
        };
      }

      case "all": {
        const approvers = Array.from(participants.values()).filter(
          (p) =>
            p.info.roles.includes("approver") ||
            p.info.capabilities?.includes("approve")
        );
        const met = approvals >= approvers.length && approvers.length > 0;
        return {
          met,
          reason: met
            ? undefined
            : `Need all ${approvers.length} approvers, have ${approvals}`,
        };
      }

      case "role": {
        const roleApprovers = Array.from(participants.values()).filter((p) =>
          p.info.roles.includes(quorum.role)
        );
        const roleApprovals = gate.approvals.filter((approverId) => {
          const participant = participants.get(approverId);
          return participant?.info.roles.includes(quorum.role);
        }).length;

        const met = roleApprovals >= quorum.count;
        return {
          met,
          reason: met
            ? undefined
            : `Need ${quorum.count} approvals from ${quorum.role}, have ${roleApprovals}`,
        };
      }

      case "specific": {
        const allApproved = quorum.participants.every((id) =>
          gate.approvals.includes(id)
        );
        return {
          met: allApproved,
          reason: allApproved
            ? undefined
            : `Need approvals from specific participants`,
        };
      }

      case "majority": {
        const approvers = Array.from(participants.values()).filter(
          (p) =>
            p.info.roles.includes("approver") ||
            p.info.capabilities?.includes("approve")
        );
        const required = Math.ceil(approvers.length / 2);
        const met = approvals >= required;
        return {
          met,
          reason: met
            ? undefined
            : `Need majority (${required}/${approvers.length}), have ${approvals}`,
        };
      }

      default:
        return { met: false, reason: "Unknown quorum type" };
    }
  }

  createGate(request: GateRequestPayload): GateState {
    const now = new Date().toISOString();
    const expiresAt = request.timeout_seconds > 0
      ? new Date(Date.now() + request.timeout_seconds * 1000).toISOString()
      : null;

    return {
      request,
      approvals: [],
      rejections: [],
      created_at: now,
      expires_at: expiresAt,
    };
  }

  addApproval(gate: GateState, approverId: ParticipantId): void {
    if (!gate.approvals.includes(approverId)) {
      gate.approvals.push(approverId);
      logger.info({ approverId, gateAction: gate.request.action_type }, "Gate approved");
    }
  }

  addRejection(gate: GateState, rejectorId: ParticipantId): void {
    if (!gate.rejections.includes(rejectorId)) {
      gate.rejections.push(rejectorId);
      logger.info({ rejectorId, gateAction: gate.request.action_type }, "Gate rejected");
    }
  }

  isExpired(gate: GateState): boolean {
    if (!gate.expires_at) return false;
    return new Date(gate.expires_at) < new Date();
  }

  getEligibleApprovers(
    quorum: QuorumRule,
    participants: Map<ParticipantId, ParticipantState>
  ): ParticipantId[] {
    switch (quorum.type) {
      case "any":
      case "all":
      case "majority":
        return Array.from(participants.values())
          .filter(
            (p) =>
              p.info.roles.includes("approver") ||
              p.info.capabilities?.includes("approve")
          )
          .map((p) => p.info.id);

      case "role":
        return Array.from(participants.values())
          .filter((p) => p.info.roles.includes(quorum.role))
          .map((p) => p.info.id);

      case "specific":
        return quorum.participants;

      default:
        return [];
    }
  }
}
