import Anthropic from "@anthropic-ai/sdk";
import { ChatRequest, ContentBlock, ModelProvider, ModelResponse } from "./ModelProvider";

export interface AnthropicProviderOptions {
  apiKey: string;
  /**
   * No default is hardcoded here on purpose: model identifiers change over
   * time and a stale hardcoded default is worse than an explicit config
   * error. Set it via the ANTHROPIC_MODEL env var / --model flag, checking
   * Anthropic's current model list if unsure.
   */
  model: string;
}

export class AnthropicProvider implements ModelProvider {
  readonly name = "anthropic";
  private client: Anthropic;
  private model: string;

  constructor(opts: AnthropicProviderOptions) {
    if (!opts.apiKey) {
      throw new Error("AnthropicProvider requires an API key (ANTHROPIC_API_KEY).");
    }
    if (!opts.model) {
      throw new Error("AnthropicProvider requires a model id (ANTHROPIC_MODEL / --model).");
    }
    this.client = new Anthropic({ apiKey: opts.apiKey });
    this.model = opts.model;
  }

  supportsTools(): boolean {
    return true;
  }

  supportsVision(): boolean {
    return true;
  }

  async chat(request: ChatRequest): Promise<ModelResponse> {
    const response = await this.client.messages.create({
      model: this.model,
      max_tokens: request.maxTokens ?? 4096,
      system: request.system,
      // The SDK's message/content types are structurally compatible with ours;
      // we keep our own types at the boundary so the rest of the app never
      // depends on the Anthropic SDK directly.
      messages: request.messages as Anthropic.MessageParam[],
      tools: request.tools as Anthropic.Tool[] | undefined,
    });

    const content: ContentBlock[] = response.content.map((block): ContentBlock => {
      if (block.type === "text") {
        return { type: "text", text: block.text };
      }
      if (block.type === "tool_use") {
        return {
          type: "tool_use",
          id: block.id,
          name: block.name,
          input: block.input as Record<string, unknown>,
        };
      }
      // Defensive fallback for any future block type the SDK adds.
      return { type: "text", text: JSON.stringify(block) };
    });

    return {
      content,
      stopReason: response.stop_reason ?? "unknown",
      usage: {
        inputTokens: response.usage.input_tokens,
        outputTokens: response.usage.output_tokens,
      },
    };
  }
}
