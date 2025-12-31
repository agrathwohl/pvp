import type { AnyMessage, ParticipantId } from "../protocol/types.js";

export interface Transport {
  readonly participantId: ParticipantId;

  send(message: AnyMessage): Promise<void>;
  onMessage(handler: (message: AnyMessage) => void): void;
  onClose(handler: () => void): void;
  close(): void;
  isConnected(): boolean;
}

export interface TransportServer {
  onConnection(handler: (transport: Transport) => void): void;
  broadcast(message: AnyMessage, filter?: (id: ParticipantId) => boolean): void;
  close(): void;
}
