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

export function isMessageType<T extends PrimitiveType>(
  message: AnyMessage,
  type: T
): boolean {
  return message.type === type;
}

export function serializeMessage(message: AnyMessage): string {
  return JSON.stringify(message);
}

export function deserializeMessage(data: string): AnyMessage {
  return JSON.parse(data) as AnyMessage;
}
