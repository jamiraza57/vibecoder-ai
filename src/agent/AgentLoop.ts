import { ModelProvider, ModelMessage, ContentBlock, ToolUseBlock } from "../providers/ModelProvider";
import { ToolRegistry, ToolContext, Permission } from "../tools";
import { AgentEvent, AgentLoopOptions, AgentRun, AgentStep, ToolCallRecord } from "./types";

const SYSTEM_PROMPT = `You are VibeCoder AI, an autonomous coding agent operating inside a real workspace on disk.
You have tools to read/write/edit/delete files, list directories, search text, and run terminal commands.

Rules:
- Inspect before you modify: read relevant files before editing them.
- Make the smallest correct change that satisfies the task.
- After making changes, verify them (e.g. run relevant tests/build/lint commands) when a tool for that exists.
- If a command fails, read the error, fix the root cause, and try again — don't repeat the same failing action unchanged.
- Never claim something succeeded (tests passed, build succeeded, file created) unless a tool result actually confirmed it.
- When the task is complete, respond with plain text summarizing what changed and how it was verified, and do not call any more tools.`;

function toolCallKey(name: string, input: Record<string, unknown>): string {
  return `${name}:${JSON.stringify(input)}`;
}

export class AgentLoop {
  constructor(
    private readonly provider: ModelProvider,
    private readonly registry: ToolRegistry,
    private readonly workspaceRoot: string,
    private readonly modelLabel: string
  ) {}

  async run(
    task: string,
    options: AgentLoopOptions,
    toolCtxOverrides: { confirm: ToolContext["confirm"]; autoApprove?: Set<Permission> }
  ): Promise<AgentRun> {
    const emit = (e: AgentEvent) => options.onEvent?.(e);

    const run: AgentRun = {
      task,
      workspaceRoot: this.workspaceRoot,
      model: this.modelLabel,
      steps: [],
      state: "EXECUTING",
      startedAt: new Date().toISOString(),
    };

    const ctx: ToolContext = {
      workspaceRoot: this.workspaceRoot,
      confirm: toolCtxOverrides.confirm,
      autoApprove: toolCtxOverrides.autoApprove ?? new Set<Permission>(),
    };

    const messages: ModelMessage[] = [{ role: "user", content: task }];
    let lastCallKey: string | null = null;
    let repeatCount = 0;

    for (let i = 0; i < options.maxSteps; i++) {
      emit({ type: "step_start", index: i });

      let response;
      try {
        response = await this.provider.chat({
          system: SYSTEM_PROMPT,
          messages,
          tools: this.registry.toAnthropicToolDefs(),
        });
      } catch (err) {
        run.state = "FAILED";
        run.failureReason = `Model call failed: ${(err as Error).message}`;
        run.endedAt = new Date().toISOString();
        return run;
      }

      const step: AgentStep = { index: i, toolCalls: [] };
      const textBlocks = response.content.filter((b): b is Extract<ContentBlock, { type: "text" }> => b.type === "text");
      const toolUseBlocks = response.content.filter((b): b is ToolUseBlock => b.type === "tool_use");

      if (textBlocks.length) {
        step.text = textBlocks.map((b) => b.text).join("\n");
        emit({ type: "assistant_text", text: step.text });
      }

      messages.push({ role: "assistant", content: response.content });

      if (toolUseBlocks.length === 0) {
        // No tool calls — the model considers the task done (or is asking a question).
        run.steps.push(step);
        run.state = "COMPLETED";
        run.finalText = step.text;
        run.endedAt = new Date().toISOString();
        emit({ type: "done", finalText: step.text });
        return run;
      }

      const toolResultMessages: ContentBlock[] = [];

      for (const call of toolUseBlocks) {
        const key = toolCallKey(call.name, call.input);
        repeatCount = key === lastCallKey ? repeatCount + 1 : 0;
        lastCallKey = key;

        if (repeatCount >= options.maxRepeatedIdenticalCalls) {
          run.state = "FAILED";
          run.failureReason = `Loop protection: "${call.name}" was called with identical arguments ${repeatCount + 1} times in a row.`;
          emit({ type: "loop_protection", reason: run.failureReason });
          run.endedAt = new Date().toISOString();
          run.steps.push(step);
          return run;
        }

        emit({ type: "tool_call_start", toolName: call.name, input: call.input });
        const tool = this.registry.get(call.name);
        const started = Date.now();

        let record: ToolCallRecord;
        if (!tool) {
          record = {
            toolName: call.name,
            input: call.input,
            ok: false,
            output: "",
            error: `Unknown tool "${call.name}".`,
            durationMs: Date.now() - started,
          };
        } else {
          try {
            const result = await tool.execute(call.input, ctx);
            record = {
              toolName: call.name,
              input: call.input,
              ok: result.ok,
              output: result.output,
              error: result.error,
              durationMs: Date.now() - started,
            };
          } catch (err) {
            record = {
              toolName: call.name,
              input: call.input,
              ok: false,
              output: "",
              error: `Tool threw: ${(err as Error).message}`,
              durationMs: Date.now() - started,
            };
          }
        }

        step.toolCalls.push(record);
        emit({
          type: "tool_call_end",
          toolName: call.name,
          ok: record.ok,
          summary: record.ok ? record.output.slice(0, 200) : record.error ?? "failed",
        });

        toolResultMessages.push({
          type: "tool_result",
          tool_use_id: call.id,
          content: record.ok ? record.output || "(no output)" : `ERROR: ${record.error}`,
          is_error: !record.ok,
        });
      }

      run.steps.push(step);
      messages.push({ role: "user", content: toolResultMessages });
    }

    run.state = "FAILED";
    run.failureReason = `Reached the maximum of ${options.maxSteps} steps without completing.`;
    run.endedAt = new Date().toISOString();
    return run;
  }
}
