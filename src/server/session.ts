import { ulid } from "../utils/ulid.js";
import { createLogger } from "../utils/logger.js";
import type {
  SessionId,
  SessionState,
  SessionConfig,
  ParticipantId,
  ParticipantState,
  ParticipantAnnouncePayload,
  PresenceStatus,
  AnyMessage,
  ContextItem,
  MessageId,
  GateState,
  ForkId,
  ForkState,
} from "../protocol/types.js";

const logger = createLogger("session");

export class Session {
  private state: SessionState;

  constructor(id: SessionId, name: string | undefined, config: SessionConfig) {
    this.state = {
      id,
      name,
      config,
      participants: new Map(),
      context: new Map(),
      forks: new Map(),
      currentFork: null,
      messageLog: [],
      pendingGates: new Map(),
      createdAt: new Date().toISOString(),
      seq: 0,
    };

    logger.info({ sessionId: id, name }, "Session created");
  }

  getId(): SessionId {
    return this.state.id;
  }

  getState(): SessionState {
    return this.state;
  }

  getConfig(): SessionConfig {
    return this.state.config;
  }

  updateConfig(changes: Partial<SessionConfig>): void {
    this.state.config = { ...this.state.config, ...changes };
    logger.info({ sessionId: this.state.id, changes }, "Session config updated");
  }

  addParticipant(info: ParticipantAnnouncePayload): ParticipantState {
    const participant: ParticipantState = {
      info,
      presence: "active",
      lastHeartbeat: new Date().toISOString(),
      lastActive: new Date().toISOString(),
    };

    this.state.participants.set(info.id, participant);
    logger.info(
      { sessionId: this.state.id, participantId: info.id, name: info.name },
      "Participant added"
    );

    return participant;
  }

  removeParticipant(participantId: ParticipantId): void {
    const participant = this.state.participants.get(participantId);
    if (participant) {
      this.state.participants.delete(participantId);
      logger.info(
        { sessionId: this.state.id, participantId },
        "Participant removed"
      );
    }
  }

  getParticipant(participantId: ParticipantId): ParticipantState | undefined {
    return this.state.participants.get(participantId);
  }

  getParticipants(): Map<ParticipantId, ParticipantState> {
    return this.state.participants;
  }

  updatePresence(
    participantId: ParticipantId,
    status: PresenceStatus
  ): void {
    const participant = this.state.participants.get(participantId);
    if (participant) {
      participant.presence = status;
      participant.lastActive = new Date().toISOString();
      logger.debug(
        { sessionId: this.state.id, participantId, status },
        "Presence updated"
      );
    }
  }

  updateHeartbeat(participantId: ParticipantId): void {
    const participant = this.state.participants.get(participantId);
    if (participant) {
      participant.lastHeartbeat = new Date().toISOString();
      participant.lastActive = new Date().toISOString();
    }
  }

  addMessage(message: AnyMessage): void {
    // Assign sequence number for total ordering mode
    if (this.state.config.ordering_mode === "total") {
      (message as any).seq = this.state.seq++;
    }

    this.state.messageLog.push(message);

    // TODO(persistence): When implementing Option 3, persist message to SQLiteStorage here:
    // this.storage.storeMessage(this.state.id, message);
    logger.debug(
      {
        sessionId: this.state.id,
        messageId: message.id,
        type: message.type,
        seq: message.seq,
      },
      "Message logged"
    );
  }

  getMessages(): AnyMessage[] {
    return this.state.messageLog;
  }

  getMessage(messageId: MessageId): AnyMessage | undefined {
    return this.state.messageLog.find((m) => m.id === messageId);
  }

  addContext(item: ContextItem): void {
    this.state.context.set(item.key, item);
    logger.info(
      {
        sessionId: this.state.id,
        key: item.key,
        contentType: item.content_type,
      },
      "Context added"
    );
  }

  updateContext(
    key: string,
    updates: Partial<Omit<ContextItem, "key">>
  ): void {
    const existing = this.state.context.get(key);
    if (existing) {
      this.state.context.set(key, {
        ...existing,
        ...updates,
        updated_at: new Date().toISOString(),
      });
      logger.info({ sessionId: this.state.id, key }, "Context updated");
    }
  }

  removeContext(key: string): void {
    this.state.context.delete(key);
    logger.info({ sessionId: this.state.id, key }, "Context removed");
  }

  getContext(key: string): ContextItem | undefined {
    return this.state.context.get(key);
  }

  getAllContext(): Map<string, ContextItem> {
    return this.state.context;
  }

  addGate(messageId: MessageId, gate: GateState): void {
    this.state.pendingGates.set(messageId, gate);
    logger.info(
      { sessionId: this.state.id, gateId: messageId },
      "Gate created"
    );
  }

  removeGate(messageId: MessageId): void {
    this.state.pendingGates.delete(messageId);
    logger.info({ sessionId: this.state.id, gateId: messageId }, "Gate resolved");
  }

  getGate(messageId: MessageId): GateState | undefined {
    return this.state.pendingGates.get(messageId);
  }

  getPendingGates(): Map<MessageId, GateState> {
    return this.state.pendingGates;
  }

  createFork(fork: ForkState): void {
    this.state.forks.set(fork.id, fork);
    logger.info({ sessionId: this.state.id, forkId: fork.id }, "Fork created");
  }

  switchFork(forkId: ForkId): void {
    if (this.state.forks.has(forkId)) {
      this.state.currentFork = forkId;
      logger.info({ sessionId: this.state.id, forkId }, "Switched to fork");
    }
  }

  getCurrentFork(): ForkId | null {
    return this.state.currentFork;
  }

  getFork(forkId: ForkId): ForkState | undefined {
    return this.state.forks.get(forkId);
  }

  getAllForks(): Map<ForkId, ForkState> {
    return this.state.forks;
  }
}
