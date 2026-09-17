export type Role = "user" | "assistant";

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
  tool_use_id: string;
  content: string;
  is_error?: boolean;
}

export type ContentBlock = TextBlock | ToolUseBlock | ToolResultBlock;

export interface ModelMessage {
  role: Role;
  content: string | ContentBlock[];
}

export interface ToolDefinition {
  name: string;
  description: string;
  input_schema: Record<string, unknown>;
}

export interface ChatRequest {
  system?: string;
  messages: ModelMessage[];
  tools?: ToolDefinition[];
  maxTokens?: number;
}

export interface ModelResponse {
  content: ContentBlock[];
  stopReason: string;
  usage?: { inputTokens: number; outputTokens: number };
}

/**
 * Common contract every model provider implements. The agent loop and the
 * rest of the application talk only to this interface — never to a
 * provider's SDK types directly — so a new provider is a drop-in.
 */
export interface ModelProvider {
  readonly name: string;
  supportsTools(): boolean;
  supportsVision(): boolean;
  chat(request: ChatRequest): Promise<ModelResponse>;
}
