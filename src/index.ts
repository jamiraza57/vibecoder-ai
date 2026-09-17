#!/usr/bin/env node
import "dotenv/config";
import * as path from "node:path";
import { AnthropicProvider } from "./providers/AnthropicProvider";
import { buildDefaultRegistry, Permission } from "./tools";
import { AgentLoop } from "./agent/AgentLoop";
import { logAgentEvent } from "./utils/activityLogger";
import { confirmOnTerminal } from "./utils/confirm";

function printUsage(): void {
  console.log(`VibeCoder AI — agent core CLI

Usage:
  vibecoder run --workspace <path> [--model <id>] [--max-steps <n>] [--auto-approve <level,...>] "<task description>"

Options:
  --workspace <path>       Directory the agent may read/write/run commands in. Required.
  --model <id>             Anthropic model id. Defaults to $ANTHROPIC_MODEL.
  --max-steps <n>          Max agent loop iterations. Default 50.
  --auto-approve <levels>  Comma-separated permission levels to skip confirmation for
                            (READ,WRITE,EXECUTE,NETWORK,DESTRUCTIVE). Default: none — everything
                            destructive/dangerous prompts on the terminal.

Environment:
  ANTHROPIC_API_KEY   required
  ANTHROPIC_MODEL     required unless --model is passed

Example:
  vibecoder run --workspace ./my-app "Find why the login API fails and fix it. Run the tests."
`);
}

function parseArgs(argv: string[]) {
  const args = { workspace: "", model: process.env.ANTHROPIC_MODEL ?? "", maxSteps: 50, autoApprove: new Set<Permission>(), task: "" };
  const rest: string[] = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--workspace") args.workspace = argv[++i];
    else if (a === "--model") args.model = argv[++i];
    else if (a === "--max-steps") args.maxSteps = parseInt(argv[++i], 10);
    else if (a === "--auto-approve") {
      for (const level of argv[++i].split(",")) {
        const trimmed = level.trim().toUpperCase();
        if (["READ", "WRITE", "EXECUTE", "NETWORK", "DESTRUCTIVE"].includes(trimmed)) {
          args.autoApprove.add(trimmed as Permission);
        }
      }
    } else rest.push(a);
  }
  args.task = rest.join(" ");
  return args;
}

async function main() {
  const [, , command, ...rest] = process.argv;

  if (command !== "run") {
    printUsage();
    process.exit(command ? 1 : 0);
  }

  const args = parseArgs(rest);

  if (!args.workspace || !args.task) {
    console.error("Error: --workspace and a task description are required.\n");
    printUsage();
    process.exit(1);
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    console.error("Error: ANTHROPIC_API_KEY is not set.");
    process.exit(1);
  }
  if (!args.model) {
    console.error("Error: no model id given. Set ANTHROPIC_MODEL or pass --model <id>.");
    process.exit(1);
  }

  const workspaceRoot = path.resolve(args.workspace);
  const provider = new AnthropicProvider({ apiKey, model: args.model });
  const registry = buildDefaultRegistry();
  const loop = new AgentLoop(provider, registry, workspaceRoot, args.model);

  console.log(`Workspace: ${workspaceRoot}`);
  console.log(`Model:     ${args.model}`);
  console.log(`Task:      ${args.task}\n`);

  const run = await loop.run(
    args.task,
    { maxSteps: args.maxSteps, maxRepeatedIdenticalCalls: 3, onEvent: logAgentEvent },
    { confirm: confirmOnTerminal, autoApprove: args.autoApprove }
  );

  console.log(`\n--- Run finished: ${run.state} ---`);
  if (run.state === "FAILED") {
    console.error(run.failureReason);
    process.exit(1);
  }
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
