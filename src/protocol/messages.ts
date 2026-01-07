/**
 * PVP Protocol Message Utilities
 *
 * Factory functions and utilities for creating and handling PVP protocol messages.
 * All messages in the PVP system use the {@link MessageEnvelope} structure with
 * type-specific payloads.
 *
 * @module protocol/messages
 */

import { ulid } from "ulid";
import type {
  AnyMessage,
  MessageEnvelope,
  PrimitiveType,
  PayloadFor,
  SessionId,
  ParticipantId,
  MessageId,
  ForkId
} from "./types.js";

/**
 * Create a new PVP protocol message with auto-generated ID and timestamp.
 *
 * This is the primary factory function for creating protocol messages.
 * It automatically generates a ULID for the message ID and sets the timestamp
 * to the current time in ISO format.
 *
 * @typeParam T - The message type (e.g., "session.create", "gate.vote")
 * @param type - The message type identifier (discriminator for payload type)
 * @param session - The session ID this message belongs to
 * @param sender - The participant ID of the message sender (or "system" for server messages)
 * @param payload - The type-specific message payload (type-checked against T)
 * @param options - Optional message metadata
 * @param options.ref - Reference to a previous message this is responding to
 * @param options.seq - Sequence number for ordered message delivery
 * @param options.causal_refs - Array of message IDs this message causally depends on
 * @param options.fork - Fork ID for branched conversation threads
 * @returns A fully formed message envelope ready for transmission
 *
 * @example
 * ```typescript
 * import { createMessage } from "pvp/protocol";
 *
 * // Create a session join message
 * const joinMessage = createMessage(
 *   "session.join",
 *   "01ARZ3NDEKTSV4RRFFQ69G5FAV",  // sessionId
 *   "01ARZ3NDEKTSV4RRFFQ69G5FAX",  // participantId
 *   {
 *     participant: {
 *       name: "Alice",
 *       type: "human",
 *       roles: ["driver"]
 *     }
 *   }
 * );
 *
 * // Create a gate vote with reference to the proposal
 * const voteMessage = createMessage(
 *   "gate.vote",
 *   sessionId,
 *   participantId,
 *   { gate: gateId, decision: "approve", reason: "LGTM" },
 *   { ref: proposalMessageId }
 * );
 * ```
 */
export function createMessage<T extends PrimitiveType>(
  type: T,
  session: SessionId,
  sender: ParticipantId,
  payload: PayloadFor<T>,
  options?: {
    ref?: MessageId;
    seq?: number;
    causal_refs?: MessageId[];
    fork?: ForkId;
  }
): MessageEnvelope<T> {
  return {
    v: 1,
    id: ulid(),
    ts: new Date().toISOString(),
    session,
    sender,
    type,
    payload,
    ...options,
  };
}

/**
 * Type guard to check if a message is of a specific type.
 *
 * Use this function to narrow the type of a message before accessing
 * type-specific payload properties.
 *
 * @typeParam T - The message type to check for
 * @param message - The message to check
 * @param type - The expected message type
 * @returns true if the message is of the specified type
 *
 * @example
 * ```typescript
 * import { isMessageType } from "pvp/protocol";
 *
 * function handleMessage(message: AnyMessage) {
 *   if (isMessageType(message, "gate.vote")) {
 *     // TypeScript now knows message.payload has gate, decision, reason
 *     console.log(`Vote on gate ${message.payload.gate}: ${message.payload.decision}`);
 *   }
 * }
 * ```
 */
export function isMessageType<T extends PrimitiveType>(
  message: AnyMessage,
  type: T
): boolean {
  return message.type === type;
}

/**
 * Serialize a message to JSON string for transmission.
 *
 * @param message - The message to serialize
 * @returns JSON string representation of the message
 *
 * @example
 * ```typescript
 * const message = createMessage("heartbeat.ping", sessionId, "system", {});
 * const json = serializeMessage(message);
 * webSocket.send(json);
 * ```
 */
export function serializeMessage(message: AnyMessage): string {
  return JSON.stringify(message);
}

/**
 * Deserialize a JSON string to a message object.
 *
 * @param data - JSON string to parse
 * @returns Parsed message object
 * @throws SyntaxError if the JSON is invalid
 *
 * @example
 * ```typescript
 * webSocket.onmessage = (event) => {
 *   const message = deserializeMessage(event.data);
 *   handleMessage(message);
 * };
 * ```
 */
export function deserializeMessage(data: string): AnyMessage {
  return JSON.parse(data) as AnyMessage;
}
