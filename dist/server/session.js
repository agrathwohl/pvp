import { createLogger } from "../utils/logger.js";
const logger = createLogger("session");
export class Session {
    state;
    constructor(id, name, config, workingDirectory) {
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
            workingDirectory,
        };
        logger.info({ sessionId: id, name, workingDirectory }, "Session created");
    }
    getWorkingDirectory() {
        return this.state.workingDirectory;
    }
    getId() {
        return this.state.id;
    }
    getState() {
        return this.state;
    }
    getConfig() {
        return this.state.config;
    }
    updateConfig(changes) {
        this.state.config = { ...this.state.config, ...changes };
        logger.info({ sessionId: this.state.id, changes }, "Session config updated");
    }
    addParticipant(info) {
        const participant = {
            info,
            presence: "active",
            lastHeartbeat: new Date().toISOString(),
            lastActive: new Date().toISOString(),
        };
        this.state.participants.set(info.id, participant);
        logger.info({ sessionId: this.state.id, participantId: info.id, name: info.name }, "Participant added");
        return participant;
    }
    removeParticipant(participantId) {
        const participant = this.state.participants.get(participantId);
        if (participant) {
            this.state.participants.delete(participantId);
            logger.info({ sessionId: this.state.id, participantId }, "Participant removed");
        }
    }
    getParticipant(participantId) {
        return this.state.participants.get(participantId);
    }
    getParticipants() {
        return this.state.participants;
    }
    updatePresence(participantId, status) {
        const participant = this.state.participants.get(participantId);
        if (participant) {
            participant.presence = status;
            participant.lastActive = new Date().toISOString();
            logger.debug({ sessionId: this.state.id, participantId, status }, "Presence updated");
        }
    }
    updateHeartbeat(participantId) {
        const participant = this.state.participants.get(participantId);
        if (participant) {
            participant.lastHeartbeat = new Date().toISOString();
            participant.lastActive = new Date().toISOString();
        }
    }
    addMessage(message) {
        // Assign sequence number for total ordering mode
        if (this.state.config.ordering_mode === "total") {
            message.seq = this.state.seq++;
        }
        this.state.messageLog.push(message);
        // TODO(persistence): When implementing Option 3, persist message to SQLiteStorage here:
        // this.storage.storeMessage(this.state.id, message);
        logger.debug({
            sessionId: this.state.id,
            messageId: message.id,
            type: message.type,
            seq: message.seq,
        }, "Message logged");
    }
    getMessages() {
        return this.state.messageLog;
    }
    getMessage(messageId) {
        return this.state.messageLog.find((m) => m.id === messageId);
    }
    addContext(item) {
        this.state.context.set(item.key, item);
        logger.info({
            sessionId: this.state.id,
            key: item.key,
            contentType: item.content_type,
        }, "Context added");
    }
    updateContext(key, updates) {
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
    removeContext(key) {
        this.state.context.delete(key);
        logger.info({ sessionId: this.state.id, key }, "Context removed");
    }
    getContext(key) {
        return this.state.context.get(key);
    }
    getAllContext() {
        return this.state.context;
    }
    addGate(messageId, gate) {
        this.state.pendingGates.set(messageId, gate);
        logger.info({ sessionId: this.state.id, gateId: messageId }, "Gate created");
    }
    removeGate(messageId) {
        this.state.pendingGates.delete(messageId);
        logger.info({ sessionId: this.state.id, gateId: messageId }, "Gate resolved");
    }
    getGate(messageId) {
        return this.state.pendingGates.get(messageId);
    }
    getPendingGates() {
        return this.state.pendingGates;
    }
    createFork(fork) {
        this.state.forks.set(fork.id, fork);
        logger.info({ sessionId: this.state.id, forkId: fork.id }, "Fork created");
    }
    switchFork(forkId) {
        if (this.state.forks.has(forkId)) {
            this.state.currentFork = forkId;
            logger.info({ sessionId: this.state.id, forkId }, "Switched to fork");
        }
    }
    getCurrentFork() {
        return this.state.currentFork;
    }
    getFork(forkId) {
        return this.state.forks.get(forkId);
    }
    getAllForks() {
        return this.state.forks;
    }
}
