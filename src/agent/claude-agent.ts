import Anthropic from "@anthropic-ai/sdk";
import type { MessageParam, ToolUseBlock, Tool, ToolResultBlockParam } from "@anthropic-ai/sdk/resources/messages.js";
import { WebSocketClient } from "../transports/websocket.js";
import { createMessage } from "../protocol/messages.js";
import { createParticipantInfo } from "../protocol/defaults.js";
import { ulid } from "../utils/ulid.js";
import { logger } from "../utils/logger.js";
import { createShellToolHandler } from "./tools/shell-tool.js";
import { categorizeCommand } from "./tools/shell-executor.js";
import type {
  AnyMessage,
  ParticipantId,
  SessionId,
  MessageId,
} from "../protocol/types.js";
import type { ShellCommand } from "./tools/shell-executor.js";

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
  private conversationHistory: MessageParam[] = [];
  private shellToolHandler: ReturnType<typeof createShellToolHandler>;
  private toolProposals: Map<MessageId, { command: ShellCommand; proposalMsg: AnyMessage }> = new Map();
  private toolUseIdToProposalId: Map<MessageId, string> = new Map();
  private currentPromptRef: MessageId | null = null;

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

    // Initialize shell tool handler
    this.shellToolHandler = createShellToolHandler();

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

    const { content } = message.payload;

    logger.info(`[${this.agentName}] Processing prompt: ${content.slice(0, 100)}...`);

    // Store prompt ref for tool result responses
    this.currentPromptRef = message.id;

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
      // Add user message to history
      this.conversationHistory.push({
        role: "user",
        content: content
      });

      // Call Claude with tool
      const response = await this.anthropic.messages.create({
        model: this.model,
        max_tokens: 4096,
        messages: this.conversationHistory,
        tools: [this.getShellTool()]
      });

      // Handle response content
      let fullResponse = "";
      const toolUses: ToolUseBlock[] = [];

      for (const block of response.content) {
        if (block.type === "text") {
          fullResponse += block.text;
          const chunkMsg = createMessage(
            "response.chunk",
            this.sessionId,
            this.participantId,
            {
              text: block.text
            }
          );
          this.client.send(chunkMsg);
        } else if (block.type === "tool_use") {
          toolUses.push(block as ToolUseBlock);
        }
      }

      // Add assistant response to history
      this.conversationHistory.push({
        role: "assistant",
        content: response.content
      });

      // Propose shell commands that Claude wants to execute
      for (const toolUse of toolUses) {
        if (toolUse.name === "execute_shell_command") {
          const input = toolUse.input as { command: string };
          logger.info({ command: input.command, toolUseId: toolUse.id }, "Claude requested shell command execution");
          
          // Propose the command through PVP protocol
          await this.proposeShellCommand(input.command, toolUse.id);
        }
      }

      // Send thinking end
      const thinkingEndMsg = createMessage(
        "thinking.end",
        this.sessionId,
        this.participantId,
        {
          summary: `Generated ${fullResponse.length} character response with ${toolUses.length} tool requests`,
        }
      );
      this.client.send(thinkingEndMsg);

      // Send response end
      const responseEndMsg = createMessage(
        "response.end",
        this.sessionId,
        this.participantId,
        {
          finish_reason: response.stop_reason === "tool_use" ? "tool_use" : "complete",
        }
      );
      this.client.send(responseEndMsg);

      logger.info(`[${this.agentName}] Response sent (${fullResponse.length} chars, ${toolUses.length} tools)`);
    } catch (error) {
      logger.error({ error }, "Error in tool-enabled response");

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
    if (message.type !== "tool.execute") return;
    if (!this.sessionId) return;

    const { tool_proposal, approved_by } = message.payload;

    // Retrieve the tool proposal
    const proposal = this.toolProposals.get(tool_proposal);
    if (!proposal) {
      logger.warn({ toolProposal: tool_proposal }, "Tool proposal not found");
      return;
    }

    logger.info({
      toolProposal: tool_proposal,
      approvers: approved_by,
      command: `${proposal.command.command} ${proposal.command.args.join(" ")}`
    }, "Executing approved shell command");

    // Store tool execution result
    let toolResult: { success: boolean; output: string; error?: string } | null = null;

    try {
      // Execute the shell command with streaming output
      await this.shellToolHandler.executeCommand(
        tool_proposal,
        proposal.command,
        this.sessionId,
        this.participantId,
        (msg: AnyMessage) => {
          this.client.send(msg);

          // Capture tool.result message
          if (msg.type === "tool.result") {
            const result = msg.payload.result as { exitCode?: number; stdout?: string; stderr?: string } | undefined;
            const stdout = result?.stdout || "";
            const stderr = result?.stderr || "";
            const exitCode = result?.exitCode ?? null;

            toolResult = {
              success: msg.payload.success,
              output: `Exit code: ${exitCode}\n${stdout}${stderr ? `\nStderr: ${stderr}` : ""}`.trim(),
              error: msg.payload.error
            };
          }
        }
      );
    } catch (error) {
      // Send error result back to Claude
      toolResult = {
        success: false,
        output: "",
        error: error instanceof Error ? error.message : "Unknown execution error"
      };

      logger.error({ error, toolProposal: tool_proposal }, "Tool execution failed");
    }

    // Clean up
    this.toolProposals.delete(tool_proposal);

    // CRITICAL: Send tool result back to Claude to continue conversation
    if (toolResult) {
      await this.sendToolResultToClaude(tool_proposal, toolResult);
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

  /**
   * Send tool execution result back to Claude to continue the conversation
   */
  private async sendToolResultToClaude(
    proposalId: MessageId,
    result: { success: boolean; output: string; error?: string }
  ): Promise<void> {
    if (!this.sessionId) return;

    // Get the original Claude tool use ID
    const toolUseId = this.toolUseIdToProposalId.get(proposalId);
    if (!toolUseId) {
      logger.warn({ proposalId }, "No tool use ID found for proposal");
      return;
    }

    // Clean up tracking
    this.toolUseIdToProposalId.delete(proposalId);

    try {
      // Send thinking start for processing tool result
      const thinkingStartMsg = createMessage(
        "thinking.start",
        this.sessionId,
        this.participantId,
        {
          agent: this.participantId,
          prompt_ref: this.currentPromptRef || proposalId,
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
          prompt_ref: this.currentPromptRef || proposalId,
        }
      );
      this.client.send(responseStartMsg);

      // Add tool result to conversation history
      this.conversationHistory.push({
        role: "user",
        content: [
          {
            type: "tool_result",
            tool_use_id: toolUseId,
            content: result.error ? `Error: ${result.error}` : result.output,
            is_error: !result.success
          } as ToolResultBlockParam
        ]
      });

      // Call Claude again with the tool result
      const response = await this.anthropic.messages.create({
        model: this.model,
        max_tokens: 4096,
        messages: this.conversationHistory,
        tools: [this.getShellTool()]
      });

      // Handle Claude's response to the tool result
      let fullResponse = "";
      const toolUses: ToolUseBlock[] = [];

      for (const block of response.content) {
        if (block.type === "text") {
          fullResponse += block.text;
          const chunkMsg = createMessage(
            "response.chunk",
            this.sessionId,
            this.participantId,
            {
              text: block.text
            }
          );
          this.client.send(chunkMsg);
        } else if (block.type === "tool_use") {
          toolUses.push(block as ToolUseBlock);
        }
      }

      // Add Claude's response to history
      this.conversationHistory.push({
        role: "assistant",
        content: response.content
      });

      // Propose any additional tools Claude wants to use
      for (const toolUse of toolUses) {
        if (toolUse.name === "execute_shell_command") {
          const input = toolUse.input as { command: string };
          logger.info({ command: input.command, toolUseId: toolUse.id }, "Claude requested additional shell command execution");
          await this.proposeShellCommand(input.command, toolUse.id);
        }
      }

      // Send thinking end
      const thinkingEndMsg = createMessage(
        "thinking.end",
        this.sessionId,
        this.participantId,
        {
          summary: `Processed tool result and generated ${fullResponse.length} character response with ${toolUses.length} additional tool requests`,
        }
      );
      this.client.send(thinkingEndMsg);

      // Send response end
      const responseEndMsg = createMessage(
        "response.end",
        this.sessionId,
        this.participantId,
        {
          finish_reason: response.stop_reason === "tool_use" ? "tool_use" : "complete",
        }
      );
      this.client.send(responseEndMsg);

      logger.info(`[${this.agentName}] Sent tool result to Claude and received response (${fullResponse.length} chars, ${toolUses.length} additional tools)`);
    } catch (error) {
      logger.error({ error, proposalId, toolUseId }, "Error sending tool result to Claude");

      const errorMsg = createMessage("error", this.sessionId, this.participantId, {
        code: "AGENT_ERROR",
        message: error instanceof Error ? error.message : "Unknown error",
        recoverable: true,
      });
      this.client.send(errorMsg);
    }
  }

  /**
   * Proposes a shell command for execution
   * This would typically be called when Claude's response includes a shell command
   */
  /**
   * Get shell tool definition for Claude API
   */
  private getShellTool(): Tool {
    return {
      name: "execute_shell_command",
      description: "Execute a shell command with safety controls and approval workflows. Commands are categorized by risk (safe/low/medium/high/critical) and may require human approval.",
      input_schema: {
        type: "object",
        properties: {
          command: {
            type: "string",
            description: "The full shell command to execute (e.g., 'ls -la', 'npm install lodash')"
          }
        },
        required: ["command"]
      }
    };
  }

  public async proposeShellCommand(command: string, toolUseId?: string): Promise<MessageId> {
    if (!this.sessionId) {
      throw new Error("Not connected to a session");
    }

    try {
      const shellCmd = categorizeCommand(command);
      const proposalMsg = this.shellToolHandler.proposeCommand(
        command,
        this.sessionId,
        this.participantId
      );

      // Store the proposal for later execution
      this.toolProposals.set(proposalMsg.id, {
        command: shellCmd,
        proposalMsg,
      });

      // Track Claude's tool use ID if provided
      if (toolUseId) {
        this.toolUseIdToProposalId.set(proposalMsg.id, toolUseId);
      }

      // Send the proposal
      this.client.send(proposalMsg);

      logger.info({
        proposalId: proposalMsg.id,
        toolUseId,
        command,
        category: shellCmd.category,
        riskLevel: shellCmd.riskLevel,
        requiresApproval: shellCmd.requiresApproval,
      }, "Proposed shell command");

      return proposalMsg.id;
    } catch (error) {
      logger.error({ error, command }, "Failed to propose shell command");
      throw error;
    }
  }
}
