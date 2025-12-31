import type {
  SessionConfig,
  ParticipantAnnouncePayload,
  ParticipantId,
  Role,
  Capability,
} from "./types.js";

/**
 * Default session configuration used across TUI, agent, and examples.
 * Provides consistent defaults for all session creators.
 */
export const DEFAULT_SESSION_CONFIG: SessionConfig = {
  require_approval_for: [],
  default_gate_quorum: { type: "any", count: 1 },
  allow_forks: true,
  max_participants: 10,
  ordering_mode: "causal",
  on_participant_timeout: "skip",
  heartbeat_interval_seconds: 30,
  idle_timeout_seconds: 120,
  away_timeout_seconds: 300,
};

/**
 * Creates a standardized participant info payload.
 * Used when joining sessions to ensure consistent participant structure.
 */
export function createParticipantInfo(
  id: ParticipantId,
  name: string,
  type: "human" | "agent",
  roles: Role[],
  capabilities?: Capability[]
): ParticipantAnnouncePayload {
  return {
    id,
    name,
    type,
    roles,
    capabilities: capabilities || ["prompt"],
    transport: "websocket",
  };
}
