import Anthropic from "@anthropic-ai/sdk";
import { WebSocketClient } from "../transports/websocket.js";
import { createMessage } from "../protocol/messages.js";
import { createParticipantInfo } from "../protocol/defaults.js";
import { ulid } from "../utils/ulid.js";
import { logger } from "../utils/logger.js";
import type {
  AnyMessage,
  ParticipantId,
  SessionId,
  MessageId,
} from "../protocol/types.js";

export interface ClaudeAgentConfig {
  serverUrl: string;
  sessionId?: SessionId;
  agentName?: string;
  model?: string;
  apiKey?: string;
}

export class ClaudeAgent {
  private client: WebSocketClient;
  private anthropic: Anthropic;
  private participantId: ParticipantId;
  private sessionId: SessionId | null = null;
  private agentName: string;
  private model: string;
  private conversationHistory: Array<{ role: "user" | "assistant"; content: string }> = [];

  constructor(config: ClaudeAgentConfig) {
    this.participantId = ulid();
    this.agentName = config.agentName || "Claude Assistant";
    this.model = config.model || "claude-sonnet-4-5-20250929";

    // Initialize Anthropic client
    this.anthropic = new Anthropic({
      apiKey: config.apiKey || process.env.ANTHROPIC_API_KEY,
    });

    // Initialize WebSocket client
    this.client = new WebSocketClient(config.serverUrl, this.participantId);

    this.setupEventHandlers();

    if (config.sessionId) {
      this.sessionId = config.sessionId;
    }
  }

  private setupEventHandlers(): void {
    this.client.on("connected", async () => {
      logger.info(`[${this.agentName}] Connected to server`);

      if (this.sessionId) {
        // Join existing session
        await this.joinSession(this.sessionId);
      }
    });

    this.client.on("disconnected", () => {
      logger.info(`[${this.agentName}] Disconnected from server`);
    });

    this.client.on("message", async (message: AnyMessage) => {
      await this.handleMessage(message);
    });
  }

  async connect(): Promise<void> {
    this.client.connect();
  }

  async disconnect(): Promise<void> {
    this.client.close();
  }

  private async joinSession(sessionId: SessionId): Promise<void> {
    this.sessionId = sessionId;

    const joinMsg = createMessage("session.join", sessionId, this.participantId, {
      participant: createParticipantInfo(
        this.participantId,
        this.agentName,
        "agent",
        ["observer"],
        ["prompt"]
      ),
      supported_versions: [1],
    });

    this.client.send(joinMsg);
    logger.info(`[${this.agentName}] Joined session: ${sessionId}`);
  }

  private async handleMessage(message: AnyMessage): Promise<void> {
    try {
      switch (message.type) {
        case "prompt.submit":
          // Only respond to prompts targeted at this agent
          if (message.payload.target_agent === this.participantId) {
            await this.handlePrompt(message);
          }
          break;

        case "tool.execute":
          // Handle tool execution requests
          await this.handleToolExecution(message);
          break;

        case "interrupt.raise":
          // Handle human interruptions
          await this.handleInterrupt(message);
          break;

        default:
          // Log other message types for debugging
          logger.debug({ type: message.type }, "Received message");
          break;
      }
    } catch (error) {
      logger.error({ error, messageType: message.type }, "Error handling message");
    }
  }

  private async handlePrompt(message: AnyMessage): Promise<void> {
    if (message.type !== "prompt.submit") return;
    if (!this.sessionId) return;

    const { content, contributors } = message.payload;

    logger.info(`[${this.agentName}] Processing prompt: ${content.slice(0, 100)}...`);

    // Add user prompt to conversation history
    this.conversationHistory.push({
      role: "user",
      content,
    });

    // Send thinking start
    const thinkingStartMsg = createMessage(
      "thinking.start",
      this.sessionId,
      this.participantId,
      {
        agent: this.participantId,
        prompt_ref: message.id,
        visible_to: "all",
      }
    );
    this.client.send(thinkingStartMsg);

    // Send response start
    const responseStartMsg = createMessage(
      "response.start",
      this.sessionId,
      this.participantId,
      {
        agent: this.participantId,
        prompt_ref: message.id,
      }
    );
    this.client.send(responseStartMsg);

    try {
      // Stream response from Claude
      const stream = await this.anthropic.messages.stream({
        model: this.model,
        max_tokens: 4096,
        messages: this.conversationHistory,
      });

      let fullResponse = "";

      // Handle streaming chunks
      stream.on("text", (text: string) => {
        fullResponse += text;

        // Send response chunk
        const chunkMsg = createMessage(
          "response.chunk",
          this.sessionId!,
          this.participantId,
          {
            text,
          }
        );
        this.client.send(chunkMsg);
      });

      // Wait for stream to complete
      await stream.finalMessage();

      // Add assistant response to conversation history
      this.conversationHistory.push({
        role: "assistant",
        content: fullResponse,
      });

      // Send thinking end
      const thinkingEndMsg = createMessage(
        "thinking.end",
        this.sessionId,
        this.participantId,
        {
          summary: `Generated ${fullResponse.length} character response`,
        }
      );
      this.client.send(thinkingEndMsg);

      // Send response end
      const responseEndMsg = createMessage(
        "response.end",
        this.sessionId,
        this.participantId,
        {
          finish_reason: "complete",
        }
      );
      this.client.send(responseEndMsg);

      logger.info(`[${this.agentName}] Response sent (${fullResponse.length} chars)`);
    } catch (error) {
      logger.error({ error }, "Error streaming response");

      // Send error message
      const errorMsg = createMessage("error", this.sessionId, this.participantId, {
        code: "AGENT_ERROR",
        message: error instanceof Error ? error.message : "Unknown error",
        recoverable: true,
        related_to: message.id,
      });
      this.client.send(errorMsg);
    }
  }

  private async handleToolExecution(message: AnyMessage): Promise<void> {
    // Tool execution intentionally not implemented in this version.
    //
    // Rationale: This agent currently only handles prompt/response flows.
    // Full tool execution requires:
    // - Tool definition/registration system
    // - Approval gate integration and quorum evaluation
    // - Result formatting and error handling
    // - Security sandboxing for tool execution
    //
    // See AGENT_SETUP.md under "Not Implemented Yet" for roadmap.

    logger.info("Tool execution not supported by this agent");

    // Send informative error back to session
    if (this.sessionId) {
      const errorMsg = createMessage("error", this.sessionId, this.participantId, {
        code: "INVALID_STATE",
        message: "This agent does not support tool execution",
        recoverable: true,
        related_to: message.id,
      });
      this.client.send(errorMsg);
    }
  }

  private async handleInterrupt(message: AnyMessage): Promise<void> {
    if (message.type !== "interrupt.raise") return;
    if (!this.sessionId) return;

    logger.info(`[${this.agentName}] Interrupt received: ${message.payload.message}`);

    // Acknowledge interrupt
    const ackMsg = createMessage(
      "interrupt.acknowledge",
      this.sessionId,
      this.participantId,
      {
        interrupt: message.id,
        by: this.participantId,
        action_taken: "acknowledged",
      }
    );
    this.client.send(ackMsg);

    // Clear conversation context on emergency interrupts
    if (message.payload.urgency === "emergency") {
      this.conversationHistory = [];
      logger.info(`[${this.agentName}] Conversation history cleared`);
    }
  }
}
