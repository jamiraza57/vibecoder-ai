import { AgentEvent } from "../agent/types";

/** Renders agent events as a concise activity log — no chain-of-thought, just action/tool status. */
export function logAgentEvent(event: AgentEvent): void {
  switch (event.type) {
    case "step_start":
      console.log(`\n\x1b[2m— step ${event.index + 1} —\x1b[0m`);
      break;
    case "assistant_text":
      console.log(event.text);
      break;
    case "tool_call_start":
      console.log(`\x1b[36m●\x1b[0m ${event.toolName} ${JSON.stringify(event.input)}`);
      break;
    case "tool_call_end":
      console.log(`${event.ok ? "\x1b[32m✓\x1b[0m" : "\x1b[31m✗\x1b[0m"} ${event.toolName}: ${event.summary}`);
      break;
    case "loop_protection":
      console.log(`\x1b[33m⚠ ${event.reason}\x1b[0m`);
      break;
    case "done":
      console.log(`\n\x1b[32m✓ done\x1b[0m`);
      break;
    case "state_change":
      break;
  }
}
