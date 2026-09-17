#!/usr/bin/env node
import "dotenv/config";
import * as path from "node:path";
import { AnthropicProvider } from "./providers/AnthropicProvider";
import { buildDefaultRegistry, Permission } from "./tools";
import { AgentLoop } from "./agent/AgentLoop";
import { logAgentEvent } from "./utils/activityLogger";
import { confirmOnTerminal } from "./utils/confirm";
import { buildProjectMap, formatProjectMap } from "./context";
import { createCheckpoint, listCheckpoints, revertToCheckpoint, CheckpointError } from "./git/checkpoint";
import { runVerification, formatVerificationReport } from "./verify";

function printUsage(): void {
  console.log(`VibeCoder AI — agent core CLI

Usage:
  vibecoder run --workspace <path> [--model <id>] [--max-steps <n>] [--auto-approve <level,...>] [--checkpoint] [--verify] "<task description>"
  vibecoder index --workspace <path>
  vibecoder verify --workspace <path>
  vibecoder checkpoint create --workspace <path> "<label>"
  vibecoder checkpoint list --workspace <path>
  vibecoder checkpoint revert --workspace <path> <ref>

Commands:
  run     Run the agent loop against a task.
  index   Scan the workspace and print its project map (language, framework, commands, git state) without calling any model.
  verify  Run the project's own detected test/build/lint commands and report actual pass/fail — no model call.
  checkpoint   Snapshot, list, or restore working-tree checkpoints (git-backed, revertible; requires a git repo with at least one commit).

Options:
  --workspace <path>       Directory the agent may read/write/run commands in. Required.
  --model <id>             Anthropic model id. Defaults to $ANTHROPIC_MODEL.
  --max-steps <n>          Max agent loop iterations. Default 50.
  --auto-approve <levels>  Comma-separated permission levels to skip confirmation for
                            (READ,WRITE,EXECUTE,NETWORK,DESTRUCTIVE). Default: none — everything
                            destructive/dangerous prompts on the terminal.
  --checkpoint             Before running, snapshot the current working tree so it can be restored with checkpoint revert if the run goes wrong.
  --verify                 After the agent finishes, actually run the project's detected test/build/lint commands and report real pass/fail, instead of trusting the agent's own claim.

Environment:
  ANTHROPIC_API_KEY   required
  ANTHROPIC_MODEL     required unless --model is passed

Example:
  vibecoder run --workspace ./my-app "Find why the login API fails and fix it. Run the tests."
`);
}

function parseArgs(argv: string[]) {
  const args = {
    workspace: "",
    model: process.env.ANTHROPIC_MODEL ?? "",
    maxSteps: 50,
    autoApprove: new Set<Permission>(),
    task: "",
    checkpoint: false,
    verify: false,
  };
  const rest: string[] = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--workspace") args.workspace = argv[++i];
    else if (a === "--model") args.model = argv[++i];
    else if (a === "--max-steps") args.maxSteps = parseInt(argv[++i], 10);
    else if (a === "--checkpoint") args.checkpoint = true;
    else if (a === "--verify") args.verify = true;
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

async function runVerifyCommand(rest: string[]): Promise<void> {
  const args = parseArgs(rest);
  if (!args.workspace) {
    console.error("Error: --workspace is required.\n");
    printUsage();
    process.exit(1);
  }
  const workspaceRoot = path.resolve(args.workspace);
  const projectMap = await buildProjectMap(workspaceRoot);
  const report = await runVerification(workspaceRoot, projectMap, {
    onResult: (r) => console.log(`${r.ok ? "✓" : "✗"} [${r.kind}] ${r.command}`),
  });
  console.log("\n" + formatVerificationReport(report));
  if (!report.allPassed) process.exit(1);
}

async function runIndexCommand(rest: string[]): Promise<void> {
  const args = parseArgs(rest);
  if (!args.workspace) {
    console.error("Error: --workspace is required.\n");
    printUsage();
    process.exit(1);
  }
  const workspaceRoot = path.resolve(args.workspace);
  const map = await buildProjectMap(workspaceRoot);
  console.log(formatProjectMap(map));
}

async function runAgentCommand(rest: string[]): Promise<void> {
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

  console.log("Indexing workspace…");
  const projectMap = await buildProjectMap(workspaceRoot);
  const projectContext = formatProjectMap(projectMap);
  console.log(projectContext + "\n");

  if (args.checkpoint) {
    try {
      const checkpoint = createCheckpoint(workspaceRoot, "before-run");
      if (checkpoint) {
        console.log(`Checkpoint created: ${checkpoint.ref}`);
        console.log(`Revert with: vibecoder checkpoint revert --workspace ${args.workspace} ${checkpoint.ref}\n`);
      } else {
        console.log("Working tree is clean — no checkpoint needed.\n");
      }
    } catch (err) {
      console.error(`Warning: could not create checkpoint (${(err as Error).message}). Continuing without one.\n`);
    }
  }

  const run = await loop.run(
    args.task,
    { maxSteps: args.maxSteps, maxRepeatedIdenticalCalls: 3, projectContext, onEvent: logAgentEvent },
    { confirm: confirmOnTerminal, autoApprove: args.autoApprove }
  );

  console.log(`\n--- Run finished: ${run.state} ---`);

  if (args.verify) {
    console.log("\nVerifying: running the project's own detected test/build/lint commands…");
    const report = await runVerification(workspaceRoot, projectMap, {
      onResult: (r) => console.log(`${r.ok ? "✓" : "✗"} [${r.kind}] ${r.command}`),
    });
    console.log("\n" + formatVerificationReport(report));
    if (!report.allPassed) {
      console.error("\nVerification FAILED — do not treat this run as a verified success, regardless of what the agent's final message claimed.");
      process.exit(1);
    }
  }

  if (run.state === "FAILED") {
    console.error(run.failureReason);
    process.exit(1);
  }
}

async function runCheckpointCommand(rest: string[]): Promise<void> {
  const [subcommand, ...subRest] = rest;
  const args = parseArgs(subRest.filter((a) => a !== subcommand));

  if (!args.workspace) {
    console.error("Error: --workspace is required.\n");
    printUsage();
    process.exit(1);
  }
  const workspaceRoot = path.resolve(args.workspace);

  try {
    if (subcommand === "create") {
      const label = args.task || "manual";
      const checkpoint = createCheckpoint(workspaceRoot, label);
      if (!checkpoint) {
        console.log("Working tree is clean — no checkpoint needed.");
        return;
      }
      console.log(`Created ${checkpoint.ref}`);
      console.log(`Revert later with: vibecoder checkpoint revert --workspace ${args.workspace} ${checkpoint.ref}`);
      return;
    }
    if (subcommand === "list") {
      const checkpoints = listCheckpoints(workspaceRoot);
      if (!checkpoints.length) {
        console.log("No checkpoints found.");
        return;
      }
      for (const cp of checkpoints) {
        console.log(`${cp.ref}\n  created: ${cp.createdAt}\n  label:   ${cp.label}\n`);
      }
      return;
    }
    if (subcommand === "revert") {
      const ref = args.task.trim();
      if (!ref) {
        console.error("Error: a checkpoint ref is required, e.g. refs/vibecoder/checkpoints/1234-my-label");
        process.exit(1);
      }
      const result = revertToCheckpoint(workspaceRoot, ref);
      console.log(result.message);
      if (!result.ok) process.exit(1);
      return;
    }
    console.error(`Unknown checkpoint subcommand "${subcommand}". Use create, list, or revert.\n`);
    printUsage();
    process.exit(1);
  } catch (err) {
    if (err instanceof CheckpointError) {
      console.error(`Error: ${err.message}`);
      process.exit(1);
    }
    throw err;
  }
}

async function main() {
  const [, , command, ...rest] = process.argv;

  if (command === "run") {
    await runAgentCommand(rest);
    return;
  }
  if (command === "index") {
    await runIndexCommand(rest);
    return;
  }
  if (command === "verify") {
    await runVerifyCommand(rest);
    return;
  }
  if (command === "checkpoint") {
    await runCheckpointCommand(rest);
    return;
  }

  printUsage();
  process.exit(command ? 1 : 0);
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
