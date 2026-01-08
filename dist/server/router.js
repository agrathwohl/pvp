import { createMessage } from "../protocol/messages.js";
import { createLogger } from "../utils/logger.js";
import { GateManager } from "./gates.js";
import { ParticipantManager } from "./participant.js";
import { ContextManager } from "./context.js";
const logger = createLogger("router");
export class MessageRouter {
    gateManager;
    participantManager;
    contextManager;
    constructor() {
        this.gateManager = new GateManager();
        this.participantManager = new ParticipantManager();
        this.contextManager = new ContextManager();
    }
    async route(session, message, broadcast) {
        try {
            // Log the message
            session.addMessage(message);
            // Route based on message type
            switch (message.type) {
                case "session.join":
                    await this.handleSessionJoin(session, message, broadcast);
                    break;
                case "session.leave":
                    await this.handleSessionLeave(session, message, broadcast);
                    break;
                case "session.config_update":
                    await this.handleSessionConfigUpdate(session, message, broadcast);
                    break;
                case "participant.role_change":
                    await this.handleRoleChange(session, message, broadcast);
                    break;
                case "heartbeat.ping":
                    await this.handleHeartbeat(session, message, broadcast);
                    break;
                case "presence.update":
                    await this.handlePresenceUpdate(session, message, broadcast);
                    break;
                case "context.add":
                    await this.handleContextAdd(session, message, broadcast);
                    break;
                case "context.update":
                    await this.handleContextUpdate(session, message, broadcast);
                    break;
                case "context.remove":
                    await this.handleContextRemove(session, message, broadcast);
                    break;
                case "prompt.submit":
                    await this.handlePromptSubmit(session, message, broadcast);
                    break;
                case "tool.propose":
                    await this.handleToolPropose(session, message, broadcast);
                    break;
                case "gate.approve":
                    await this.handleGateApprove(session, message, broadcast);
                    break;
                case "gate.reject":
                    await this.handleGateReject(session, message, broadcast);
                    break;
                case "interrupt.raise":
                    await this.handleInterrupt(session, message, broadcast);
                    break;
                case "fork.create":
                    await this.handleForkCreate(session, message, broadcast);
                    break;
                case "tool.result":
                    await this.handleToolResult(session, message, broadcast);
                    break;
                default:
                    // Broadcast other message types as-is
                    broadcast(message);
                    break;
            }
        }
        catch (error) {
            logger.error({ error, messageType: message.type }, "Error routing message");
            const errorMsg = createMessage("error", session.getId(), "system", {
                code: "INTERNAL_ERROR",
                message: error instanceof Error ? error.message : "Unknown error",
                recoverable: true,
                related_to: message.id,
            });
            broadcast(errorMsg);
        }
    }
    async handleSessionJoin(session, message, broadcast) {
        const { participant } = message.payload;
        // Get existing participants BEFORE adding new one
        const existingParticipants = Array.from(session.getParticipants().values());
        // Add new participant to session FIRST (required for broadcast to work)
        session.addParticipant(participant);
        // Send existing participants to the new joiner
        for (const existing of existingParticipants) {
            const existingAnnouncement = createMessage("participant.announce", session.getId(), existing.info.id, existing.info);
            broadcast(existingAnnouncement, (id) => id === participant.id);
        }
        // Send message history to the new joiner
        // TODO(persistence): When implementing Option 3, load history from SQLiteStorage here
        const messageHistory = session.getMessages();
        for (const msg of messageHistory) {
            broadcast(msg, (id) => id === participant.id);
        }
        // Send session working directory to the new joiner
        const workingDirMsg = createMessage("context.add", session.getId(), "system", {
            key: "session:working_directory",
            content_type: "text",
            content: session.getWorkingDirectory(),
            source: "session",
            tags: ["session_metadata", "working_directory"],
        });
        broadcast(workingDirMsg, (id) => id === participant.id);
        // Broadcast new participant announcement to everyone
        const announcement = createMessage("participant.announce", session.getId(), participant.id, participant);
        broadcast(announcement);
    }
    async handleSessionLeave(session, message, broadcast) {
        session.removeParticipant(message.sender);
        broadcast(message);
    }
    async handleSessionConfigUpdate(session, message, broadcast) {
        const participant = session.getParticipant(message.sender);
        if (!participant) {
            throw new Error("Participant not found");
        }
        if (!this.participantManager.hasRole(participant, "admin")) {
            throw this.createUnauthorizedError("Only admins can update session config");
        }
        session.updateConfig(message.payload.changes);
        broadcast(message);
    }
    async handleRoleChange(session, message, broadcast) {
        const changer = session.getParticipant(message.payload.changed_by);
        if (!changer || !this.participantManager.canManageParticipants(changer)) {
            throw this.createUnauthorizedError("Not authorized to change roles");
        }
        const target = session.getParticipant(message.payload.participant);
        if (target) {
            this.participantManager.changeRoles(target, message.payload.new_roles);
            broadcast(message);
        }
    }
    async handleHeartbeat(session, message, broadcast) {
        session.updateHeartbeat(message.sender);
        const pong = createMessage("heartbeat.pong", session.getId(), message.sender, {}, { ref: message.id });
        broadcast(pong, (id) => id === message.sender);
    }
    async handlePresenceUpdate(session, message, broadcast) {
        session.updatePresence(message.payload.participant, message.payload.status);
        broadcast(message);
    }
    async handleContextAdd(session, message, broadcast) {
        const participant = session.getParticipant(message.sender);
        if (!participant || !this.participantManager.canAddContext(participant)) {
            throw this.createUnauthorizedError("Not authorized to add context");
        }
        const contextItem = this.contextManager.createContextItem(message.payload, message.sender);
        session.addContext(contextItem);
        // Broadcast only to participants who can see this context
        broadcast(message, (id) => this.contextManager.isVisibleTo(contextItem, id));
    }
    async handleContextUpdate(session, message, broadcast) {
        const participant = session.getParticipant(message.sender);
        if (!participant || !this.participantManager.canAddContext(participant)) {
            throw this.createUnauthorizedError("Not authorized to update context");
        }
        const item = session.getContext(message.payload.key);
        if (item) {
            if (message.payload.new_content) {
                this.contextManager.updateContent(item, message.payload.new_content);
            }
            else if (message.payload.new_content_ref) {
                this.contextManager.updateContentRef(item, message.payload.new_content_ref);
            }
            broadcast(message);
        }
    }
    async handleContextRemove(session, message, broadcast) {
        const participant = session.getParticipant(message.sender);
        if (!participant || !this.participantManager.canAddContext(participant)) {
            throw this.createUnauthorizedError("Not authorized to remove context");
        }
        session.removeContext(message.payload.key);
        broadcast(message);
    }
    async handlePromptSubmit(session, message, broadcast) {
        const participant = session.getParticipant(message.sender);
        if (!participant || !this.participantManager.canPrompt(participant)) {
            throw this.createUnauthorizedError("Not authorized to submit prompts");
        }
        broadcast(message);
    }
    async handleToolPropose(session, message, broadcast) {
        const { requires_approval, category } = message.payload;
        const config = session.getConfig();
        // Check if this tool category requires approval
        const needsApproval = requires_approval ||
            config.require_approval_for.includes(category) ||
            config.require_approval_for.includes("all");
        if (needsApproval) {
            // Create gate
            const gatePayload = {
                action_type: "tool",
                action_ref: message.id,
                quorum: config.default_gate_quorum,
                timeout_seconds: 300,
                message: `${message.payload.agent} wants to execute ${message.payload.tool_name}`,
            };
            const gate = this.gateManager.createGate(gatePayload);
            session.addGate(message.id, gate);
            const gateMsg = createMessage("gate.request", session.getId(), "system", gatePayload);
            broadcast(gateMsg);
        }
        else {
            // Auto-approve
            const executeMsg = createMessage("tool.execute", session.getId(), "system", {
                tool_proposal: message.id,
                approved_by: [],
            });
            broadcast(executeMsg);
        }
        broadcast(message);
    }
    async handleGateApprove(session, message, broadcast) {
        const participant = session.getParticipant(message.sender);
        if (!participant || !this.participantManager.canApprove(participant)) {
            throw this.createUnauthorizedError("Not authorized to approve gates");
        }
        const gate = session.getGate(message.payload.gate);
        if (!gate) {
            throw new Error("Gate not found");
        }
        this.gateManager.addApproval(gate, message.payload.approver);
        broadcast(message);
        // Check if quorum is met
        const { met } = this.gateManager.evaluateQuorum(gate, session.getParticipants());
        if (met) {
            session.removeGate(message.payload.gate);
            // Execute the gated action
            const originalMessage = session.getMessage(gate.request.action_ref);
            if (originalMessage?.type === "tool.propose") {
                const executeMsg = createMessage("tool.execute", session.getId(), "system", {
                    tool_proposal: originalMessage.id,
                    approved_by: gate.approvals,
                });
                broadcast(executeMsg);
            }
        }
    }
    async handleGateReject(session, message, broadcast) {
        const participant = session.getParticipant(message.sender);
        if (!participant || !this.participantManager.canApprove(participant)) {
            throw this.createUnauthorizedError("Not authorized to reject gates");
        }
        const gate = session.getGate(message.payload.gate);
        if (!gate) {
            throw new Error("Gate not found");
        }
        this.gateManager.addRejection(gate, message.payload.rejector);
        session.removeGate(message.payload.gate);
        broadcast(message);
    }
    async handleInterrupt(session, message, broadcast) {
        const participant = session.getParticipant(message.sender);
        if (!participant || !this.participantManager.canInterrupt(participant)) {
            throw this.createUnauthorizedError("Not authorized to raise interrupts");
        }
        broadcast(message);
        // If context is injected, add it
        if (message.payload.inject_context) {
            const contextMsg = createMessage("context.add", session.getId(), message.sender, {
                key: `interrupt_${message.id}`,
                content_type: "text",
                content: message.payload.inject_context,
                source: `interrupt from ${message.sender}`,
            });
            await this.route(session, contextMsg, broadcast);
        }
    }
    async handleForkCreate(session, message, broadcast) {
        const participant = session.getParticipant(message.sender);
        if (!participant || !this.participantManager.canFork(participant)) {
            throw this.createUnauthorizedError("Not authorized to create forks");
        }
        if (!session.getConfig().allow_forks) {
            throw new Error("Forks are not allowed in this session");
        }
        const fork = {
            id: `fork_${Date.now()}`,
            name: message.payload.name,
            from_point: message.payload.from_point,
            created_at: new Date().toISOString(),
            created_by: message.sender,
            participants: message.payload.participants,
        };
        session.createFork(fork);
        broadcast(message);
    }
    async handleToolResult(session, message, broadcast) {
        const { tool_proposal, success } = message.payload;
        // Always broadcast the tool result
        broadcast(message);
        // Only process file feedback for successful file operations
        if (!success)
            return;
        // Look up the original tool.propose message
        const proposal = session.getMessage(tool_proposal);
        if (!proposal || proposal.type !== "tool.propose")
            return;
        const proposalPayload = proposal.payload;
        // Check if this was a file write operation
        if (proposalPayload.category !== "file_write")
            return;
        // Extract file path and content from the proposal arguments
        // Note: field is "path" not "file_path" per file-tool.ts
        const filePath = proposalPayload.arguments.path;
        const content = proposalPayload.arguments.content;
        if (!filePath || content === undefined)
            return;
        // Emit context.add with the file content for all participants
        const contextMsg = createMessage("context.add", session.getId(), "system", {
            key: `file:${filePath}`,
            content_type: "file",
            content: content,
            source: `tool:${proposalPayload.tool_name}`,
            tags: ["file_write", "auto_context"],
        });
        // Add to session context
        const contextItem = this.contextManager.createContextItem(contextMsg.payload, "system");
        session.addContext(contextItem);
        // Broadcast to all participants
        broadcast(contextMsg);
        logger.info({ sessionId: session.getId(), filePath, tool: proposalPayload.tool_name }, "File write context added");
    }
    createUnauthorizedError(message) {
        const error = new Error(message);
        error.name = "UNAUTHORIZED";
        return error;
    }
}
