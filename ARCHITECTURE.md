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
| 4. Context (repository scanner, indexing, project memory) | **Done** — scanner + stack/command detection + git state; no persisted "project memory" across runs yet, and no context compaction (see below) |
| 5. Git integration, checkpoints, revert | **Done** — status/diff/log/branch/checkout/commit tools + a git-backed checkpoint/revert system |
| 6. Verification (dedicated test/build/diagnostics tooling beyond `run_terminal`) | **Done** — structured verify orchestrator with real pass/fail (exit code) + best-effort summary parsing for common test runners |
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

### What "Phase 4 done" means concretely

- `buildProjectMap(workspaceRoot)` (src/context/projectIndex.ts) walks the
  workspace respecting a real `.gitignore` (common-subset parser — plain
  names, `*` globs, trailing-slash dir-only entries, leading-slash anchors;
  no negation or `**`) plus always-ignored noise dirs (`node_modules`,
  `.git`, `dist`, build output, etc.), and returns language counts by file
  extension, detected package manager(s) and framework(s) from real manifest
  parsing (package.json, pubspec.yaml, requirements.txt/pyproject.toml,
  composer.json), known test/build/lint commands with their source, entry
  points, test directories, the largest top-level directories, and read-only
  git state (branch, dirty flag + changed-file count, last commit subject).
- `vibecoder index --workspace <path>` prints this without calling any
  model — useful on its own, and it's what `vibecoder run` calls first to
  prepend a project summary to the agent's system prompt (see
  `AgentLoop`'s `projectContext` option), so the agent starts each run
  already knowing the stack and test/build commands instead of discovering
  them via tool calls every time.
- Framework/dependency detection is manifest-based pattern matching (specific
  dependency names → specific frameworks), not a general-purpose static
  analyzer — it will miss unusual or nonstandard project layouts, and it
  only recognizes the ecosystems explicitly coded in `src/context/detect.ts`
  (Node/npm-yarn-pnpm, Flutter/Dart, Python/pip, PHP/Composer).
- What's still missing from the original "Context Engine" spec (section 14):
  no symbol/import graph, no per-file relevance ranking against the current
  task, and no context compaction (section 15) — a very long run still
  accumulates full message history for its duration. Both are real
  follow-on work, not implemented here.

### What "Phase 5 done" means concretely

- Six real git tools, all built on a shell-free `execGit` wrapper (argv
  arrays via `spawnSync`, no string interpolation — unlike `run_terminal`,
  there's no command-injection surface here at all): `git_status`,
  `git_diff`, `git_log`, `git_branch` (list only), `git_checkout`,
  `git_commit`.
- `git_checkout` enforces the spec's "never destroy existing uncommitted
  work" rule directly: it runs `git status --porcelain` first and refuses
  to switch branches at all if the tree is dirty, rather than trying to be
  clever about what's safe to carry over.
- `git_commit` never amends or force-anything; it stages either specific
  paths or everything (`git add -A`) and fails cleanly (not silently) if
  there's nothing staged after that.
- Checkpoint system (`src/git/checkpoint.ts`): `createCheckpoint` snapshots
  the full working tree + index (including untracked files) as a git commit
  object via `git stash create`, then points a ref under
  `refs/vibecoder/checkpoints/<timestamp>-<label>` at it with `update-ref` —
  deliberately never `git stash push`, so creating a checkpoint cannot
  itself alter the working tree, the index, or HEAD. `revertToCheckpoint`
  applies it back with `git stash apply` (merges rather than force-resets,
  so it can conflict if things have moved on further — surfaced as a failed
  result, not swallowed). `vibecoder checkpoint create/list/revert` exposes
  this from the CLI, and `vibecoder run --checkpoint` snapshots
  automatically before a run starts.
- These are not exposed to the model as agent tools in this phase —
  checkpointing is operator-controlled (via the CLI flag/commands) rather
  than something the agent decides to do mid-task. That's a deliberate scope
  cut, not an oversight: giving the agent its own checkpoint/revert tool
  calls is reasonable future work but adds a decision surface (when should
  the agent checkpoint? revert on its own initiative?) that's safer to
  design deliberately than to add as a rushed extra tool here.
- `git_branch` is list-only; branch creation happens through
  `git_checkout`'s `create` flag and there is no branch-deletion tool at all
  yet, matching the spec's "never destroy history automatically" posture
  (deletion, if added, should get the same explicit-confirmation treatment
  as `delete_file`).

### What "Phase 6 done" means concretely

- `runVerification(workspaceRoot, projectMap, opts)` (src/verify/verify.ts)
  runs every command the repository index already detected for
  test/build/lint and reports, per command: exit-code-based pass/fail
  (never inferred from output text), duration, a best-effort summary line
  (regex heuristics for Jest/Mocha/pytest/Flutter/Go — see
  src/verify/summarize.ts), and on failure, the last ~3000 chars of
  stderr/stdout.
- vibecoder verify --workspace <path> runs this standalone with no model
  call — a real "quality gate" check you can run any time.
- vibecoder run --verify runs it after the agent loop finishes and reports
  the real outcome regardless of what the agent's own final message
  claimed — this is a structural enforcement of spec section 76 ("No Fake
  Success"), not just a system-prompt instruction the model could ignore.
  If verification fails, the CLI exits non-zero and prints an explicit
  warning not to treat the run as a verified success.
- What's still missing: this is command-level verification (did npm test
  exit 0), not per-test-case structured results — there's no unified
  "N tests, M failed, which ones" data model across frameworks, only the
  regex-summarized text. A real structured parser (e.g. JUnit XML, Jest
  --json) per framework is meaningfully more work and isn't done here.
  There's also no build/diagnostics parser (e.g. turning tsc/eslint output
  into structured file:line:message diagnostics) — output is surfaced as
  text, not parsed into a diagnostics list.

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
