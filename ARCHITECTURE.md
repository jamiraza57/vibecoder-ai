# Architecture

## Layers

```
CLI (src/index.ts)
   │
   ▼
AgentLoop (src/agent/AgentLoop.ts)
   │            │
   ▼            ▼
ModelProvider   ToolRegistry
(src/providers) (src/tools)
```

- **ModelProvider** is the only interface the agent loop talks to. It has one
  implementation today (`AnthropicProvider`); adding OpenAI/Gemini/local means
  implementing the same three methods (`chat`, `supportsTools`,
  `supportsVision`) — the loop and CLI don't change.
- **ToolRegistry** holds `Tool` objects (name, JSON schema, permission level,
  `execute()`). The loop asks the registry for Anthropic-shaped tool
  definitions and, for each `tool_use` block the model returns, looks the tool
  up by name and executes it against a `ToolContext` (workspace root, a
  `confirm()` callback, and a set of pre-approved permission levels).
- **AgentLoop** is a plain state machine: send messages → get a response → if
  it contains tool calls, execute them and feed results back as the next
  user turn → repeat until the model responds with text and no tool calls, a
  loop-protection trip, or the step ceiling. Every step and tool call is
  recorded on the returned `AgentRun`.

## Why no framework/agent-SDK dependency

The loop, tool registry, and provider interface are ~600 lines of plain
TypeScript with a single external dependency (`@anthropic-ai/sdk`). That's
deliberate: the full product this is Phase 1 of needs to swap models,
sandbox tool execution more strictly, and add many more tools without being
constrained by someone else's agent framework's assumptions.

## Status against the original product spec

The original spec (see the task that produced this repo) describes a full
desktop IDE product — Electron shell, Monaco editor, repository indexer,
context engine with compaction, git integration, checkpoints, visual QA,
browser automation, image generation, multi-agent orchestration, MCP/plugin
systems, and packaged installers for three platforms. That is a multi-month
project. This repo is the foundation phases only:

| Phase (from spec) | Status |
|---|---|
| 1. Foundation / project setup | **Done** — this repo |
| 2. Editor (file explorer, tabs, terminal UI) | Not started — no desktop UI exists |
| 3. Agent (model abstraction, loop, tool registry, fs/terminal tools) | **Done** |
| 4. Context (repository scanner, indexing, project memory) | Not started |
| 5. Git integration, checkpoints, revert | Not started |
| 6. Verification (dedicated test/build/diagnostics tooling beyond `run_terminal`) | Partial — the agent can run `npm test`/`flutter test`/etc. via `run_terminal`, but there's no structured test-runner detection or diagnostics parser |
| 7. Browser tools, preview, screenshots, visual QA | Not started |
| 8. Image generation/editing, asset management | Not started |
| 9. MCP, plugins, multi-agent, local models, model routing | Not started (the provider interface is designed to make this addable) |
| 10. Production hardening, packaging, installers | Not started |

### What "Phase 3 done" means concretely

- Agent state machine: `EXECUTING → (tool calls) → EXECUTING → ... → COMPLETED / FAILED`.
  `CANCELLED` and `WAITING_FOR_PERMISSION` states are defined in
  `agent/types.ts` for forward compatibility but the CLI's synchronous
  confirm-prompt currently makes `WAITING_FOR_PERMISSION` a blocking function
  call rather than a distinct externally-observable state — a UI-driven
  version (e.g. a desktop app) would want to actually pause and emit that
  state instead.
- Loop protection: implemented as identical-consecutive-call detection
  (`maxRepeatedIdenticalCalls`), not the more elaborate "repeated-error
  detection" the spec also mentions — that would need to hash/compare error
  content across non-identical calls, which isn't built yet.
- Permission system: three levels are enforced (ask every time / this call is
  pre-approved for the session via `--auto-approve` / declined). There's no
  "always allow, persisted across runs" storage — nothing here persists
  settings between CLI invocations yet, since there's no settings store
  (Phase 1 also doesn't include the SQLite-backed storage layer the spec
  describes in section 60).

### Known limitations to flag honestly

- `run_terminal`'s risk classifier is regex-based heuristics, not a sandbox.
  It reduces accidental destructive actions; it is not a security boundary
  against an adversarial or compromised model output. Don't run this against
  untrusted tasks with `--auto-approve DESTRUCTIVE`.
- No context compaction: long tasks accumulate the full message history in
  memory for the run's duration. For very long-running tasks this will hit
  the model's context window before it hits `maxSteps`. Compaction (spec
  section 15) is not implemented.
- No repository indexing/project map (spec sections 13–14): the agent only
  knows what it reads via tools during the run; there's no upfront "here's
  the architecture of this repo" context injection.
- Live end-to-end testing against the real Anthropic API was not performed in
  the environment this repo was built in (no API key available there). The
  25 automated tests cover every piece of logic that doesn't require a live
  model call (path safety, command classification, edit semantics, delete
  confirmation, registry behavior, and the full loop's control flow via a
  scripted fake provider). Verify the live path with your own key before
  relying on it: `vibecoder run --workspace <dir> "<simple task>"`.
