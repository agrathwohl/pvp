/**
 * Anthropic Provider Implementation
 *
 * Wraps the Anthropic SDK to implement the LLMProvider interface.
 * Handles Anthropic-specific message formats and tool calling conventions.
 */

import Anthropic from "@anthropic-ai/sdk";
import type {
  MessageParam,
  ToolUseBlock as AnthropicToolUseBlock,
  Tool as AnthropicTool,
  ToolResultBlockParam,
  ContentBlock as AnthropicContentBlock,
} from "@anthropic-ai/sdk/resources/messages.js";

import type {
  LLMProvider,
  LLMProviderConfig,
  CompletionRequest,
  CompletionResponse,
  ConversationMessage,
  ToolDefinition,
  ToolCall,
  ToolResultInput,
  ContentBlock,
  FinishReason,
} from "./types.js";

export interface AnthropicProviderConfig extends LLMProviderConfig {
  apiKey: string;
}

export class AnthropicProvider implements LLMProvider {
  readonly name = "anthropic";
  readonly toolBatchingRequired = true; // Anthropic requires ALL tool_results together

  private client: Anthropic;

  constructor(config: AnthropicProviderConfig) {
    this.client = new Anthropic({
      apiKey: config.apiKey,
    });
  }

  async createCompletion(request: CompletionRequest): Promise<CompletionResponse> {
    // Convert generic messages to Anthropic format
    const messages = this.convertMessages(request.messages);
    const tools = request.tools ? this.convertTools(request.tools) : undefined;

    const response = await this.client.messages.create({
      model: request.model,
      max_tokens: request.maxTokens ?? 4096,
      messages,
      tools,
    });

    return this.parseResponse(response);
  }

  formatToolResults(results: ToolResultInput[]): ConversationMessage {
    const content: ContentBlock[] = results.map((r) => ({
      type: "tool_result" as const,
      toolUseId: r.toolCallId,
      content: r.content,
      isError: r.isError,
    }));

    return {
      role: "user",
      content,
    };
  }

  formatAssistantMessage(content: ContentBlock[]): ConversationMessage {
    return {
      role: "assistant",
      content,
    };
  }

  // ===========================================================================
  // Private: Message Conversion
  // ===========================================================================

  private convertMessages(messages: ConversationMessage[]): MessageParam[] {
    return messages.map((msg) => {
      if (typeof msg.content === "string") {
        return {
          role: msg.role as "user" | "assistant",
          content: msg.content,
        };
      }

      // Convert content blocks to Anthropic format
      const anthropicContent = msg.content.map((block) => {
        if (block.type === "text") {
          return { type: "text" as const, text: block.text };
        }
        if (block.type === "tool_use") {
          return {
            type: "tool_use" as const,
            id: block.id,
            name: block.name,
            input: block.input,
          };
        }
        if (block.type === "tool_result") {
          return {
            type: "tool_result" as const,
            tool_use_id: block.toolUseId,
            content: block.content,
            is_error: block.isError,
          } as ToolResultBlockParam;
        }
        throw new Error(`Unknown block type: ${(block as ContentBlock).type}`);
      });

      return {
        role: msg.role as "user" | "assistant",
        content: anthropicContent,
      };
    });
  }

  private convertTools(tools: ToolDefinition[]): AnthropicTool[] {
    return tools.map((tool) => ({
      name: tool.name,
      description: tool.description,
      input_schema: tool.input_schema,
    }));
  }

  // ===========================================================================
  // Private: Response Parsing
  // ===========================================================================

  private parseResponse(response: Anthropic.Messages.Message): CompletionResponse {
    let text = "";
    const toolCalls: ToolCall[] = [];
    const rawContent: ContentBlock[] = [];

    for (const block of response.content) {
      if (block.type === "text") {
        text += block.text;
        rawContent.push({ type: "text", text: block.text });
      } else if (block.type === "tool_use") {
        const toolBlock = block as AnthropicToolUseBlock;
        toolCalls.push({
          id: toolBlock.id,
          name: toolBlock.name,
          arguments: toolBlock.input as Record<string, unknown>,
        });
        rawContent.push({
          type: "tool_use",
          id: toolBlock.id,
          name: toolBlock.name,
          input: toolBlock.input as Record<string, unknown>,
        });
      }
    }

    return {
      text,
      toolCalls,
      finishReason: this.mapStopReason(response.stop_reason),
      usage: response.usage
        ? {
            inputTokens: response.usage.input_tokens,
            outputTokens: response.usage.output_tokens,
          }
        : undefined,
      rawContent,
    };
  }

  private mapStopReason(stopReason: string | null): FinishReason {
    switch (stopReason) {
      case "end_turn":
        return "complete";
      case "tool_use":
        return "tool_use";
      case "max_tokens":
        return "length";
      default:
        return "complete";
    }
  }
}
