import type { SessionConfig, ParticipantAnnouncePayload, ParticipantId, Role, Capability } from "./types.js";
/**
 * Default session configuration used across TUI, agent, and examples.
 * Provides consistent defaults for all session creators.
 */
export declare const DEFAULT_SESSION_CONFIG: SessionConfig;
/**
 * Creates a standardized participant info payload.
 * Used when joining sessions to ensure consistent participant structure.
 */
export declare function createParticipantInfo(id: ParticipantId, name: string, type: "human" | "agent", roles: Role[], capabilities?: Capability[]): ParticipantAnnouncePayload;
