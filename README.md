# VibeCoder AI — Agent Core

An autonomous coding agent core: a real, working model-provider abstraction, a
permissioned tool system (filesystem + terminal), and an agent loop that plans,
calls tools, observes results, and iterates against a real project directory.

This is **Phase 1–3 of a larger product spec** (see `ARCHITECTURE.md` for the
full roadmap and what's *not* built yet — there is no Electron IDE, no image
generation, no browser automation, no multi-agent orchestration in this repo).
What's here is real and tested, not a mock.

## What actually works right now

- `AnthropicProvider` makes real `messages.create` calls with tool-use, through
  a `ModelProvider` interface designed so a second provider is a drop-in.
- Seven real tools: `read_file`, `write_file`, `edit_file`, `delete_file`,
  `list_directory`, `search_text`, `run_terminal` — each permissioned
  (`READ` / `WRITE` / `EXECUTE` / `DESTRUCTIVE`), path-jailed to the workspace
  root, with protected-file patterns (`.env`, SSH keys, credentials, etc.)
  blocked unless explicitly overridden.
- `run_terminal` classifies every command as `SAFE` / `MODIFYING` /
  `DANGEROUS` (regex heuristics — see `src/tools/terminal/classify.ts`) and
  prompts for human confirmation on anything modifying or dangerous, unless
  pre-approved for the session.
- A real agent loop (`src/agent/AgentLoop.ts`): plan → tool call → observe →
  repeat, with loop protection (stops if the same tool+arguments repeat too
  many times) and a max-steps ceiling — it fails loudly instead of hanging.
- A repository index (`src/context/`): walks the workspace respecting
  `.gitignore`, detects language/framework/package manager from real
  manifest parsing (Node, Flutter/Dart, Python, PHP/Laravel), finds known
  test/build/lint commands, entry points, test directories, and read-only
  git state. `vibecoder run` feeds this to the agent as part of its system
  prompt automatically; `vibecoder index` prints it standalone with no
  model call.
- A CLI you can run today against any real directory on disk.
- 45 passing tests (`npm test`) covering path-safety, command classification,
  the edit tool's exact-unique-match semantics, delete confirmation, the
  registry, the agent loop's control flow (via a scripted fake provider —
  no network needed to test the loop logic itself), gitignore parsing and
  the workspace walker, stack/command detection against fixture manifests,
  git state detection, and an end-to-end project-map integration test.

## What is not built (see ARCHITECTURE.md)

Electron/desktop IDE shell, Monaco editor integration, repository indexer,
context compaction, git tools, image generation, browser automation, visual
QA, checkpoints/revert, multi-agent orchestration, MCP integration, plugin
system, packaging/installers. These are documented as pending work, not
implemented and disguised as working.

## Setup

```bash
npm install
cp .env.example .env
# edit .env: set ANTHROPIC_API_KEY and ANTHROPIC_MODEL
# (check Anthropic's current model list — this repo does not hardcode a model id)
npm run build
```

## Run it

```bash
node dist/src/index.js index --workspace ./some-project
```

Prints the project map (language, framework, package manager, known
commands, git state) with no model call — useful on its own to sanity-check
detection, and it's exactly what gets prepended to the agent's context below.

```bash
node dist/src/index.js run --workspace ./some-project "Explain what this project does."
```

Or after `npm link` / installing the bin:

```bash
vibecoder run --workspace ./some-project --max-steps 20 \
  "Find why the login API fails and fix it. Run the tests."
```

By default every `MODIFYING` or `DANGEROUS` terminal command and every
`DESTRUCTIVE` file operation prompts you on the terminal before running.
To pre-approve a permission level for the whole run (use with care):

```bash
vibecoder run --workspace . --auto-approve EXECUTE "Run the test suite and report results."
```

## Test

```bash
npm test
```

Runs `tsc` then Node's built-in test runner (`node:test`) against the
compiled output — no test framework dependency needed.

## Project layout

```
src/
  providers/       ModelProvider interface + AnthropicProvider
  tools/           Tool interface, registry, path safety, fs tools, terminal tool
  agent/           AgentLoop + run/step/event types
  context/         Repository index: gitignore-aware walker, stack/command
                   detection, git state, project-map formatting
  utils/           CLI confirmation prompt, activity logger
  index.ts         CLI entry point (`run` and `index` commands)
test/              node:test suites (45 tests)
```

## Security notes

- All filesystem tools resolve paths through `resolveSafePath`, which refuses
  anything that resolves outside the workspace root, and refuses known
  sensitive filename patterns unless the caller explicitly opts in.
- `run_terminal` output is passed through `redactSecrets` before being
  returned to the model or logged, to reduce the chance of an API key or
  private key ending up in context.
- Nothing in this repo stores or transmits credentials on your behalf beyond
  the API key you provide via environment variable to talk to Anthropic.
