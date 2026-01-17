/**
 * LLM Provider Abstraction Layer
 *
 * Defines generic interfaces for LLM providers, enabling the PVP agent
 * to work with multiple backends (Anthropic, OpenAI, Ollama, etc.)
 */

// ============================================================================
// Core Types
// ============================================================================

export type MessageRole = "user" | "assistant" | "system";
export type FinishReason = "complete" | "tool_use" | "length" | "error";

/**
 * Generic content block - can be text or tool-related
 */
export type ContentBlock =
  | TextBlock
  | ToolUseBlock
  | ToolResultBlock;

export interface TextBlock {
  type: "text";
  text: string;
}

export interface ToolUseBlock {
  type: "tool_use";
  id: string;
  name: string;
  input: Record<string, unknown>;
}

export interface ToolResultBlock {
  type: "tool_result";
  toolUseId: string;
  content: string;
  isError: boolean;
}

/**
 * Generic conversation message
 */
export interface ConversationMessage {
  role: MessageRole;
  content: string | ContentBlock[];
}

/**
 * Tool definition following JSON Schema (OpenAI/Anthropic compatible)
 */
export interface ToolDefinition {
  name: string;
  description: string;
  input_schema: {
    type: "object";
    properties: Record<string, unknown>;
    required?: string[];
  };
}

/**
 * Parsed tool call from LLM response
 */
export interface ToolCall {
  id: string;
  name: string;
  arguments: Record<string, unknown>;
}

/**
 * Result to send back to LLM after tool execution
 */
export interface ToolResultInput {
  toolCallId: string;
  content: string;
  isError: boolean;
}

// ============================================================================
// Request/Response Types
// ============================================================================

export interface CompletionRequest {
  model: string;
  messages: ConversationMessage[];
  tools?: ToolDefinition[];
  maxTokens?: number;
  systemPrompt?: string;
}

export interface CompletionResponse {
  /** Text content from the response */
  text: string;
  /** Tool calls requested by the LLM */
  toolCalls: ToolCall[];
  /** Why the response ended */
  finishReason: FinishReason;
  /** Token usage (if available) */
  usage?: {
    inputTokens: number;
    outputTokens: number;
  };
  /** Raw content blocks for conversation history */
  rawContent: ContentBlock[];
}

// ============================================================================
// Provider Interface
// ============================================================================

export interface LLMProviderConfig {
  apiKey?: string;
  baseUrl?: string;
  defaultModel?: string;
}

/**
 * LLM Provider Interface
 *
 * Abstracts the differences between LLM APIs (Anthropic, OpenAI, etc.)
 * allowing the agent to be provider-agnostic.
 */
export interface LLMProvider {
  /** Provider identifier (e.g., "anthropic", "openai") */
  readonly name: string;

  /**
   * Whether this provider requires all tool results to be sent together.
   * Anthropic requires this; OpenAI does not.
   */
  readonly toolBatchingRequired: boolean;

  /**
   * Create a completion (possibly with tool calls)
   */
  createCompletion(request: CompletionRequest): Promise<CompletionResponse>;

  /**
   * Format a tool result for the provider's conversation format.
   * Returns a message that can be added to conversation history.
   */
  formatToolResults(results: ToolResultInput[]): ConversationMessage;

  /**
   * Format an assistant message with content blocks for history.
   * Used after receiving a response to add it to conversation.
   */
  formatAssistantMessage(content: ContentBlock[]): ConversationMessage;
}
