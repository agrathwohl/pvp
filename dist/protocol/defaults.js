/**
 * Default session configuration used across TUI, agent, and examples.
 * Provides consistent defaults for all session creators.
 */
export const DEFAULT_SESSION_CONFIG = {
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
export function createParticipantInfo(id, name, type, roles, capabilities) {
    return {
        id,
        name,
        type,
        roles,
        capabilities: capabilities || ["prompt"],
        transport: "websocket",
    };
}
