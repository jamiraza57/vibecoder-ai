import { ModelMessage } from "../providers/ModelProvider";

export type AgentState =
  | "IDLE"
  | "EXECUTING"
  | "WAITING_FOR_TOOL"
  | "WAITING_FOR_PERMISSION"
  | "VERIFYING"
  | "COMPLETED"
  | "CANCELLED"
  | "FAILED";

export interface ToolCallRecord {
  toolName: string;
  input: Record<string, unknown>;
  ok: boolean;
  output: string;
  error?: string;
  durationMs: number;
}

export interface AgentStep {
  index: number;
  /** Free text the model produced this step, if any. */
  text?: string;
  toolCalls: ToolCallRecord[];
}

export interface AgentRun {
  task: string;
  workspaceRoot: string;
  model: string;
  steps: AgentStep[];
  state: AgentState;
  finalText?: string;
  failureReason?: string;
  startedAt: string;
  endedAt?: string;
}

/** Emitted as the loop progresses, for the activity-log UI (console today, richer UI later). */
export type AgentEvent =
  | { type: "step_start"; index: number }
  | { type: "assistant_text"; text: string }
  | { type: "tool_call_start"; toolName: string; input: Record<string, unknown> }
  | { type: "tool_call_end"; toolName: string; ok: boolean; summary: string }
  | { type: "state_change"; state: AgentState }
  | { type: "loop_protection"; reason: string }
  | { type: "done"; finalText?: string };

export interface AgentLoopOptions {
  maxSteps: number;
  /** Consecutive identical (tool + input) calls before loop protection kicks in. */
  maxRepeatedIdenticalCalls: number;
  /** A pre-computed repository summary (see src/context) to prepend to the system prompt, so the agent doesn't have to rediscover basic project facts via tool calls every run. */
  projectContext?: string;
  onEvent?: (event: AgentEvent) => void;
}

export function serializeMessagesForDebug(messages: ModelMessage[]): string {
  return JSON.stringify(messages, null, 2);
}
