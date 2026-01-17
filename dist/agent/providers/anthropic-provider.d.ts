/**
 * Anthropic Provider Implementation
 *
 * Wraps the Anthropic SDK to implement the LLMProvider interface.
 * Handles Anthropic-specific message formats and tool calling conventions.
 */
import type { LLMProvider, LLMProviderConfig, CompletionRequest, CompletionResponse, ConversationMessage, ToolResultInput, ContentBlock } from "./types.js";
export interface AnthropicProviderConfig extends LLMProviderConfig {
    apiKey: string;
}
export declare class AnthropicProvider implements LLMProvider {
    readonly name = "anthropic";
    readonly toolBatchingRequired = true;
    private client;
    constructor(config: AnthropicProviderConfig);
    createCompletion(request: CompletionRequest): Promise<CompletionResponse>;
    formatToolResults(results: ToolResultInput[]): ConversationMessage;
    formatAssistantMessage(content: ContentBlock[]): ConversationMessage;
    private convertMessages;
    private convertTools;
    private parseResponse;
    private mapStopReason;
}
