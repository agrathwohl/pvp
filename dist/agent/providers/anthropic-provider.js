/**
 * Anthropic Provider Implementation
 *
 * Wraps the Anthropic SDK to implement the LLMProvider interface.
 * Handles Anthropic-specific message formats and tool calling conventions.
 */
import Anthropic from "@anthropic-ai/sdk";
export class AnthropicProvider {
    name = "anthropic";
    toolBatchingRequired = true; // Anthropic requires ALL tool_results together
    client;
    constructor(config) {
        this.client = new Anthropic({
            apiKey: config.apiKey,
        });
    }
    async createCompletion(request) {
        // Convert generic messages to Anthropic format
        const messages = this.convertMessages(request.messages);
        const tools = request.tools ? this.convertTools(request.tools) : undefined;
        const response = await this.client.messages.create({
            model: request.model,
            max_tokens: request.maxTokens ?? 4096,
            system: request.systemPrompt,
            messages,
            tools,
        });
        return this.parseResponse(response);
    }
    formatToolResults(results) {
        const content = results.map((r) => ({
            type: "tool_result",
            toolUseId: r.toolCallId,
            content: r.content,
            isError: r.isError,
        }));
        return {
            role: "user",
            content,
        };
    }
    formatAssistantMessage(content) {
        return {
            role: "assistant",
            content,
        };
    }
    // ===========================================================================
    // Private: Message Conversion
    // ===========================================================================
    convertMessages(messages) {
        return messages.map((msg) => {
            if (typeof msg.content === "string") {
                return {
                    role: msg.role,
                    content: msg.content,
                };
            }
            // Convert content blocks to Anthropic format
            const anthropicContent = msg.content.map((block) => {
                if (block.type === "text") {
                    return { type: "text", text: block.text };
                }
                if (block.type === "tool_use") {
                    return {
                        type: "tool_use",
                        id: block.id,
                        name: block.name,
                        input: block.input,
                    };
                }
                if (block.type === "tool_result") {
                    return {
                        type: "tool_result",
                        tool_use_id: block.toolUseId,
                        content: block.content,
                        is_error: block.isError,
                    };
                }
                throw new Error(`Unknown block type: ${block.type}`);
            });
            return {
                role: msg.role,
                content: anthropicContent,
            };
        });
    }
    convertTools(tools) {
        return tools.map((tool) => ({
            name: tool.name,
            description: tool.description,
            input_schema: tool.input_schema,
        }));
    }
    // ===========================================================================
    // Private: Response Parsing
    // ===========================================================================
    parseResponse(response) {
        let text = "";
        const toolCalls = [];
        const rawContent = [];
        for (const block of response.content) {
            if (block.type === "text") {
                text += block.text;
                rawContent.push({ type: "text", text: block.text });
            }
            else if (block.type === "tool_use") {
                const toolBlock = block;
                toolCalls.push({
                    id: toolBlock.id,
                    name: toolBlock.name,
                    arguments: toolBlock.input,
                });
                rawContent.push({
                    type: "tool_use",
                    id: toolBlock.id,
                    name: toolBlock.name,
                    input: toolBlock.input,
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
    mapStopReason(stopReason) {
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
