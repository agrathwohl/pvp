import { createMessage } from "../protocol/messages.js";
import { createLogger } from "../utils/logger.js";
import { Session } from "./session.js";
import { GateManager } from "./gates.js";
import { ParticipantManager } from "./participant.js";
import { ContextManager } from "./context.js";
import type {
  AnyMessage,
  MessageEnvelope,
  ParticipantId,
  ErrorCode,
  ToolCategory,
  GateRequestPayload,
  MessageId,
} from "../protocol/types.js";

const logger = createLogger("router");

export class MessageRouter {
  private gateManager: GateManager;
  private participantManager: ParticipantManager;
  private contextManager: ContextManager;

  constructor() {
    this.gateManager = new GateManager();
    this.participantManager = new ParticipantManager();
    this.contextManager = new ContextManager();
  }

  async route(
    session: Session,
    message: AnyMessage,
    broadcast: (msg: AnyMessage, filter?: (id: string) => boolean) => void
  ): Promise<void> {
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
    } catch (error) {
      logger.error({ error, messageType: message.type }, "Error routing message");
      const errorMsg = createMessage(
        "error",
        session.getId(),
        "system",
        {
          code: "INTERNAL_ERROR",
          message: error instanceof Error ? error.message : "Unknown error",
          recoverable: true,
          related_to: message.id,
        }
      );
      broadcast(errorMsg);
    }
  }

  private async handleSessionJoin(
    session: Session,
    message: MessageEnvelope<"session.join">,
    broadcast: (msg: AnyMessage, filter?: (id: string) => boolean) => void
  ): Promise<void> {
    const { participant } = message.payload;

    // Get existing participants BEFORE adding new one
    const existingParticipants = Array.from(session.getParticipants().values());

    // Add new participant to session FIRST (required for broadcast to work)
    session.addParticipant(participant);

    // Send existing participants to the new joiner
    for (const existing of existingParticipants) {
      const existingAnnouncement = createMessage(
        "participant.announce",
        session.getId(),
        existing.info.id,
        existing.info
      );
      broadcast(existingAnnouncement, (id) => id === participant.id);
    }

    // Send message history to the new joiner
    // TODO(persistence): When implementing Option 3, load history from SQLiteStorage here
    const messageHistory = session.getMessages();
    for (const msg of messageHistory) {
      broadcast(msg, (id) => id === participant.id);
    }

    // Send session working directory to the new joiner
    const workingDirMsg = createMessage(
      "context.add",
      session.getId(),
      "system",
      {
        key: "session:working_directory",
        content_type: "text",
        content: session.getWorkingDirectory(),
        source: "session",
        tags: ["session_metadata", "working_directory"],
      }
    );
    broadcast(workingDirMsg, (id) => id === participant.id);

    // Broadcast new participant announcement to everyone
    const announcement = createMessage(
      "participant.announce",
      session.getId(),
      participant.id,
      participant
    );
    broadcast(announcement);
  }

  private async handleSessionLeave(
    session: Session,
    message: MessageEnvelope<"session.leave">,
    broadcast: (msg: AnyMessage, filter?: (id: string) => boolean) => void
  ): Promise<void> {
    session.removeParticipant(message.sender);
    broadcast(message);
  }

  private async handleSessionConfigUpdate(
    session: Session,
    message: MessageEnvelope<"session.config_update">,
    broadcast: (msg: AnyMessage, filter?: (id: string) => boolean) => void
  ): Promise<void> {
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

  private async handleRoleChange(
    session: Session,
    message: MessageEnvelope<"participant.role_change">,
    broadcast: (msg: AnyMessage, filter?: (id: string) => boolean) => void
  ): Promise<void> {
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

  private async handleHeartbeat(
    session: Session,
    message: MessageEnvelope<"heartbeat.ping">,
    broadcast: (msg: AnyMessage, filter?: (id: string) => boolean) => void
  ): Promise<void> {
    session.updateHeartbeat(message.sender);

    const pong = createMessage(
      "heartbeat.pong",
      session.getId(),
      message.sender,
      {},
      { ref: message.id }
    );
    broadcast(pong, (id) => id === message.sender);
  }

  private async handlePresenceUpdate(
    session: Session,
    message: MessageEnvelope<"presence.update">,
    broadcast: (msg: AnyMessage, filter?: (id: string) => boolean) => void
  ): Promise<void> {
    session.updatePresence(message.payload.participant, message.payload.status);
    broadcast(message);
  }

  private async handleContextAdd(
    session: Session,
    message: MessageEnvelope<"context.add">,
    broadcast: (msg: AnyMessage, filter?: (id: string) => boolean) => void
  ): Promise<void> {
    const participant = session.getParticipant(message.sender);
    if (!participant || !this.participantManager.canAddContext(participant)) {
      throw this.createUnauthorizedError("Not authorized to add context");
    }

    const contextItem = this.contextManager.createContextItem(
      message.payload,
      message.sender
    );
    session.addContext(contextItem);

    // Broadcast only to participants who can see this context
    broadcast(message, (id: string) => this.contextManager.isVisibleTo(contextItem, id));
  }

  private async handleContextUpdate(
    session: Session,
    message: MessageEnvelope<"context.update">,
    broadcast: (msg: AnyMessage, filter?: (id: string) => boolean) => void
  ): Promise<void> {
    const participant = session.getParticipant(message.sender);
    if (!participant || !this.participantManager.canAddContext(participant)) {
      throw this.createUnauthorizedError("Not authorized to update context");
    }

    const item = session.getContext(message.payload.key);
    if (item) {
      if (message.payload.new_content) {
        this.contextManager.updateContent(item, message.payload.new_content);
      } else if (message.payload.new_content_ref) {
        this.contextManager.updateContentRef(item, message.payload.new_content_ref);
      }
      broadcast(message);
    }
  }

  private async handleContextRemove(
    session: Session,
    message: MessageEnvelope<"context.remove">,
    broadcast: (msg: AnyMessage, filter?: (id: string) => boolean) => void
  ): Promise<void> {
    const participant = session.getParticipant(message.sender);
    if (!participant || !this.participantManager.canAddContext(participant)) {
      throw this.createUnauthorizedError("Not authorized to remove context");
    }

    session.removeContext(message.payload.key);
    broadcast(message);
  }

  private async handlePromptSubmit(
    session: Session,
    message: MessageEnvelope<"prompt.submit">,
    broadcast: (msg: AnyMessage, filter?: (id: string) => boolean) => void
  ): Promise<void> {
    const participant = session.getParticipant(message.sender);
    if (!participant || !this.participantManager.canPrompt(participant)) {
      throw this.createUnauthorizedError("Not authorized to submit prompts");
    }

    broadcast(message);
  }

  private async handleToolPropose(
    session: Session,
    message: MessageEnvelope<"tool.propose">,
    broadcast: (msg: AnyMessage, filter?: (id: string) => boolean) => void
  ): Promise<void> {
    const { requires_approval, category } = message.payload;
    const config = session.getConfig();

    // Check if this tool category requires approval
    const needsApproval =
      requires_approval ||
      config.require_approval_for.includes(category) ||
      config.require_approval_for.includes("all");

    if (needsApproval) {
      // Create gate
      const gatePayload: GateRequestPayload = {
        action_type: "tool",
        action_ref: message.id,
        quorum: config.default_gate_quorum,
        timeout_seconds: 300,
        message: `${message.payload.agent} wants to execute ${message.payload.tool_name}`,
      };

      const gate = this.gateManager.createGate(gatePayload);
      session.addGate(message.id, gate);

      const gateMsg = createMessage(
        "gate.request",
        session.getId(),
        "system",
        gatePayload
      );
      broadcast(gateMsg);
    } else {
      // Auto-approve
      const executeMsg = createMessage(
        "tool.execute",
        session.getId(),
        "system",
        {
          tool_proposal: message.id,
          approved_by: [],
        }
      );
      broadcast(executeMsg);
    }

    broadcast(message);
  }

  private async handleGateApprove(
    session: Session,
    message: MessageEnvelope<"gate.approve">,
    broadcast: (msg: AnyMessage, filter?: (id: string) => boolean) => void
  ): Promise<void> {
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
        const executeMsg = createMessage(
          "tool.execute",
          session.getId(),
          "system",
          {
            tool_proposal: originalMessage.id,
            approved_by: gate.approvals,
          }
        );
        broadcast(executeMsg);
      }
    }
  }

  private async handleGateReject(
    session: Session,
    message: MessageEnvelope<"gate.reject">,
    broadcast: (msg: AnyMessage, filter?: (id: string) => boolean) => void
  ): Promise<void> {
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

  private async handleInterrupt(
    session: Session,
    message: MessageEnvelope<"interrupt.raise">,
    broadcast: (msg: AnyMessage, filter?: (id: string) => boolean) => void
  ): Promise<void> {
    const participant = session.getParticipant(message.sender);
    if (!participant || !this.participantManager.canInterrupt(participant)) {
      throw this.createUnauthorizedError("Not authorized to raise interrupts");
    }

    broadcast(message);

    // If context is injected, add it
    if (message.payload.inject_context) {
      const contextMsg = createMessage(
        "context.add",
        session.getId(),
        message.sender,
        {
          key: `interrupt_${message.id}`,
          content_type: "text",
          content: message.payload.inject_context,
          source: `interrupt from ${message.sender}`,
        }
      );
      await this.route(session, contextMsg, broadcast);
    }
  }

  private async handleForkCreate(
    session: Session,
    message: MessageEnvelope<"fork.create">,
    broadcast: (msg: AnyMessage, filter?: (id: string) => boolean) => void
  ): Promise<void> {
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


  private async handleToolResult(
    session: Session,
    message: MessageEnvelope<"tool.result">,
    broadcast: (msg: AnyMessage, filter?: (id: string) => boolean) => void
  ): Promise<void> {
    const { tool_proposal, success } = message.payload;

    // Always broadcast the tool result
    broadcast(message);

    // Only process file feedback for successful file operations
    if (!success) return;

    // Look up the original tool.propose message
    const proposal = session.getMessage(tool_proposal);
    if (!proposal || proposal.type !== "tool.propose") return;

    const proposalPayload = proposal.payload as {
      category: string;
      arguments: Record<string, unknown>;
      tool_name: string;
    };

    // Check if this was a file write operation
    if (proposalPayload.category !== "file_write") return;

    // Extract file path and content from the proposal arguments
    // Note: field is "path" not "file_path" per file-tool.ts
    const filePath = proposalPayload.arguments.path as string | undefined;
    const content = proposalPayload.arguments.content as string | undefined;

    if (!filePath || content === undefined) return;

    // Emit context.add with the file content for all participants
    const contextMsg = createMessage(
      "context.add",
      session.getId(),
      "system",
      {
        key: `file:${filePath}`,
        content_type: "file",
        content: content,
        source: `tool:${proposalPayload.tool_name}`,
        tags: ["file_write", "auto_context"],
      }
    );

    // Add to session context
    const contextItem = this.contextManager.createContextItem(
      contextMsg.payload,
      "system"
    );
    session.addContext(contextItem);

    // Broadcast to all participants
    broadcast(contextMsg);

    logger.info(
      { sessionId: session.getId(), filePath, tool: proposalPayload.tool_name },
      "File write context added"
    );
  }

  private createUnauthorizedError(message: string): Error {
    const error = new Error(message);
    error.name = "UNAUTHORIZED";
    return error;
  }
}
