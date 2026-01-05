import Anthropic from "@anthropic-ai/sdk";
import type { MessageParam, ToolUseBlock, Tool, ToolResultBlockParam } from "@anthropic-ai/sdk/resources/messages.js";
import { WebSocketClient } from "../transports/websocket.js";
import { createMessage } from "../protocol/messages.js";
import { createParticipantInfo } from "../protocol/defaults.js";
import { ulid } from "../utils/ulid.js";
import { logger } from "../utils/logger.js";
import { createShellToolHandler } from "./tools/shell-tool.js";
import { categorizeCommand } from "./tools/shell-executor.js";
import { MCPManager, type MCPServerConfig, type MCPToolDefinition } from "./mcp/index.js";
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

  // MCP support
  private mcpManager: MCPManager;
  private mcpToolProposals: Map<MessageId, {
    tool: MCPToolDefinition;
    args: Record<string, unknown>;
    toolUseId: string;
  }> = new Map();

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

    // Initialize MCP manager
    this.mcpManager = new MCPManager();

    this.setupEventHandlers();

    if (config.sessionId) {
      this.sessionId = config.sessionId;
    }
  }

  /**
   * Initialize MCP servers from configuration
   */
  async initializeMCP(configs: MCPServerConfig[]): Promise<void> {
    for (const config of configs) {
      try {
        await this.mcpManager.addServer(config);
        logger.info({ server: config.name }, "MCP server initialized");
      } catch (error) {
        logger.error({ error, server: config.name }, "Failed to initialize MCP server");
      }
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

        case "gate.reject":
          // Handle gate rejection - need to send error result back to Claude
          await this.handleGateRejection(message);
          break;

        case "gate.timeout":
          // Handle gate timeout - may need to send error result back to Claude
          if (message.payload.resolution === "rejected") {
            await this.handleGateRejection(message);
          }
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
        tools: this.getAllTools()
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

      // Propose tools that Claude wants to execute
      for (const toolUse of toolUses) {
        if (toolUse.name === "execute_shell_command") {
          const input = toolUse.input as { command: string };
          logger.info({ command: input.command, toolUseId: toolUse.id }, "Claude requested shell command execution");
          await this.proposeShellCommand(input.command, toolUse.id);
        } else if (this.mcpManager.isMCPTool(toolUse.name)) {
          // Route to MCP tool
          logger.info({ tool: toolUse.name, toolUseId: toolUse.id }, "Claude requested MCP tool execution");
          await this.proposeMCPTool(toolUse.name, toolUse.input as Record<string, unknown>, toolUse.id);
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

    // Check if this is an MCP tool proposal
    if (this.mcpToolProposals.has(tool_proposal)) {
      logger.info({ toolProposal: tool_proposal, approvers: approved_by }, "Executing approved MCP tool");
      await this.executeMCPTool(tool_proposal);
      return;
    }

    // Retrieve the shell tool proposal
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
   * Handle gate rejection - send error result back to Claude
   */
  private async handleGateRejection(message: AnyMessage): Promise<void> {
    if (message.type !== "gate.reject" && message.type !== "gate.timeout") return;
    if (!this.sessionId) return;

    // Get the gate/proposal ID
    const proposalId = message.payload.gate;

    // Determine the reason for rejection
    const reason = message.type === "gate.reject"
      ? message.payload.reason
      : `Gate timed out (${message.payload.approvals_received}/${message.payload.approvals_required} approvals)`;

    logger.info({ proposalId, reason }, "Gate rejected, sending error to Claude");

    // Check if this is a shell tool proposal
    const shellProposal = this.toolProposals.get(proposalId);
    if (shellProposal) {
      // Clean up proposal tracking (sendToolResultToClaude handles toolUseIdToProposalId)
      this.toolProposals.delete(proposalId);

      // Send error result to Claude
      await this.sendToolResultToClaude(proposalId, {
        success: false,
        output: "",
        error: `Command rejected by human: ${reason}`,
      });
      return;
    }

    // Check if this is an MCP tool proposal
    const mcpProposal = this.mcpToolProposals.get(proposalId);
    if (mcpProposal) {
      // Clean up proposal tracking (sendToolResultToClaude handles toolUseIdToProposalId)
      this.mcpToolProposals.delete(proposalId);

      // Send error result to Claude
      await this.sendToolResultToClaude(proposalId, {
        success: false,
        output: "",
        error: `Tool "${mcpProposal.tool.mcp_tool.name}" rejected by human: ${reason}`,
      });
      return;
    }

    logger.warn({ proposalId }, "Gate rejection received but no matching proposal found");
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
        tools: this.getAllTools()
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
        } else if (this.mcpManager.isMCPTool(toolUse.name)) {
          logger.info({ tool: toolUse.name, toolUseId: toolUse.id }, "Claude requested additional MCP tool execution");
          await this.proposeMCPTool(toolUse.name, toolUse.input as Record<string, unknown>, toolUse.id);
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
   * Get all available tools (shell + MCP) for Claude API
   */
  private getAllTools(): Tool[] {
    const tools: Tool[] = [];

    // Add shell tool
    tools.push({
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
    });

    // Add MCP tools with namespaced names
    for (const mcpTool of this.mcpManager.getAllTools()) {
      tools.push({
        name: mcpTool.namespaced_name,
        description: mcpTool.mcp_tool.description || `Tool from ${mcpTool.server_name}`,
        input_schema: mcpTool.mcp_tool.inputSchema as Tool["input_schema"]
      });
    }

    return tools;
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

  /**
   * Propose an MCP tool for execution through the PVP gate system
   */
  public async proposeMCPTool(
    namespacedName: string,
    args: Record<string, unknown>,
    toolUseId: string
  ): Promise<MessageId> {
    if (!this.sessionId) {
      throw new Error("Not connected to a session");
    }

    const mcpTool = this.mcpManager.getTool(namespacedName);
    if (!mcpTool) {
      throw new Error(`MCP tool not found: ${namespacedName}`);
    }

    // Create tool proposal message
    const proposalMsg = createMessage(
      "tool.propose",
      this.sessionId,
      this.participantId,
      {
        tool_name: namespacedName,
        arguments: args,
        agent: this.participantId,
        category: mcpTool.category,
        risk_level: mcpTool.risk_level,
        description: mcpTool.mcp_tool.description || `MCP tool from ${mcpTool.server_name}`,
        requires_approval: mcpTool.requires_approval,
      }
    );

    // Store the proposal for later execution
    this.mcpToolProposals.set(proposalMsg.id, {
      tool: mcpTool,
      args,
      toolUseId,
    });

    // Track Claude's tool use ID
    this.toolUseIdToProposalId.set(proposalMsg.id, toolUseId);

    // Send the proposal
    this.client.send(proposalMsg);

    logger.info({
      proposalId: proposalMsg.id,
      toolUseId,
      tool: namespacedName,
      category: mcpTool.category,
      riskLevel: mcpTool.risk_level,
      requiresApproval: mcpTool.requires_approval,
    }, "Proposed MCP tool");

    return proposalMsg.id;
  }

  /**
   * Execute an approved MCP tool
   */
  private async executeMCPTool(proposalId: MessageId): Promise<void> {
    if (!this.sessionId) return;

    const proposal = this.mcpToolProposals.get(proposalId);
    if (!proposal) {
      logger.warn({ proposalId }, "MCP tool proposal not found");
      return;
    }

    const { tool, args, toolUseId } = proposal;

    logger.info({
      proposalId,
      tool: tool.namespaced_name,
      server: tool.server_name,
    }, "Executing approved MCP tool");

    const startTime = Date.now();

    try {
      // Execute via MCP manager
      const result = await this.mcpManager.callTool(tool.namespaced_name, args);
      const duration_ms = Date.now() - startTime;

      // Send tool result message through PVP
      const resultMsg = createMessage(
        "tool.result",
        this.sessionId,
        this.participantId,
        {
          tool_proposal: proposalId,
          success: result.success,
          result: result.content,
          error: result.error,
          duration_ms,
        }
      );
      this.client.send(resultMsg);

      // Clean up
      this.mcpToolProposals.delete(proposalId);

      // Send result back to Claude
      await this.sendToolResultToClaude(proposalId, {
        success: result.success,
        output: JSON.stringify(result.content, null, 2),
        error: result.error,
      });
    } catch (error) {
      const duration_ms = Date.now() - startTime;
      logger.error({ error, proposalId, tool: tool.namespaced_name }, "MCP tool execution failed");

      // Send error result
      const errorMsg = createMessage(
        "tool.result",
        this.sessionId,
        this.participantId,
        {
          tool_proposal: proposalId,
          success: false,
          error: error instanceof Error ? error.message : "Unknown error",
          duration_ms,
        }
      );
      this.client.send(errorMsg);

      this.mcpToolProposals.delete(proposalId);

      await this.sendToolResultToClaude(proposalId, {
        success: false,
        output: "",
        error: error instanceof Error ? error.message : "Unknown error",
      });
    }
  }

  async disconnect(): Promise<void> {
    await this.mcpManager.shutdown();
    this.client.close();
  }
}
