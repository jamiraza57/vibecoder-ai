import { test } from "node:test";
import assert from "node:assert/strict";
import * as os from "node:os";
import * as fs from "node:fs/promises";
import * as fssync from "node:fs";
import * as path from "node:path";
import { AgentLoop } from "../src/agent/AgentLoop";
import { buildDefaultRegistry } from "../src/tools";
import { ChatRequest, ModelProvider, ModelResponse } from "../src/providers/ModelProvider";

function tmpWorkspace(): string {
  return fssync.mkdtempSync(path.join(os.tmpdir(), "vibecoder-loop-test-"));
}

/** A scripted provider that returns a fixed sequence of responses, one per call, ignoring the actual request. */
class ScriptedProvider implements ModelProvider {
  readonly name = "scripted";
  private i = 0;
  constructor(private readonly script: ModelResponse[]) {}
  supportsTools() {
    return true;
  }
  supportsVision() {
    return false;
  }
  async chat(_request: ChatRequest): Promise<ModelResponse> {
    const response = this.script[this.i];
    if (!response) throw new Error("ScriptedProvider ran out of scripted responses.");
    this.i++;
    return response;
  }
}

test("agent loop reads a file then finishes with text when the model stops calling tools", async () => {
  const root = tmpWorkspace();
  await fs.writeFile(path.join(root, "notes.txt"), "hello");

  const provider = new ScriptedProvider([
    {
      content: [{ type: "tool_use", id: "call_1", name: "read_file", input: { path: "notes.txt" } }],
      stopReason: "tool_use",
    },
    {
      content: [{ type: "text", text: "The file says hello. Done." }],
      stopReason: "end_turn",
    },
  ]);

  const loop = new AgentLoop(provider, buildDefaultRegistry(), root, "scripted-model");
  const run = await loop.run(
    "read notes.txt",
    { maxSteps: 10, maxRepeatedIdenticalCalls: 3 },
    { confirm: async () => true }
  );

  assert.equal(run.state, "COMPLETED");
  assert.equal(run.finalText, "The file says hello. Done.");
  assert.equal(run.steps.length, 2);
  assert.equal(run.steps[0].toolCalls[0].toolName, "read_file");
  assert.equal(run.steps[0].toolCalls[0].ok, true);
});

test("agent loop trips loop protection on repeated identical tool calls", async () => {
  const root = tmpWorkspace();

  const repeatedCall: ModelResponse = {
    content: [{ type: "tool_use", id: "call_x", name: "read_file", input: { path: "missing.txt" } }],
    stopReason: "tool_use",
  };
  const provider = new ScriptedProvider([repeatedCall, repeatedCall, repeatedCall, repeatedCall, repeatedCall]);

  const loop = new AgentLoop(provider, buildDefaultRegistry(), root, "scripted-model");
  const run = await loop.run(
    "read a file that doesn't exist, repeatedly",
    { maxSteps: 20, maxRepeatedIdenticalCalls: 3 },
    { confirm: async () => true }
  );

  assert.equal(run.state, "FAILED");
  assert.match(run.failureReason ?? "", /Loop protection/);
  // Should stop well before the maxSteps ceiling.
  assert.ok(run.steps.length <= 4);
});

test("agent loop fails cleanly when maxSteps is exhausted", async () => {
  const root = tmpWorkspace();

  // Alternate two distinct valid calls forever so loop protection never fires,
  // forcing the maxSteps ceiling to be the thing that stops it.
  const script: ModelResponse[] = [];
  for (let i = 0; i < 6; i++) {
    script.push({
      content: [{ type: "tool_use", id: `call_${i}`, name: "list_directory", input: { path: i % 2 === 0 ? "." : "./" } }],
      stopReason: "tool_use",
    });
  }
  const provider = new ScriptedProvider(script);

  const loop = new AgentLoop(provider, buildDefaultRegistry(), root, "scripted-model");
  const run = await loop.run("list forever", { maxSteps: 5, maxRepeatedIdenticalCalls: 100 }, { confirm: async () => true });

  assert.equal(run.state, "FAILED");
  assert.match(run.failureReason ?? "", /maximum of 5 steps/);
  assert.equal(run.steps.length, 5);
});

test("agent loop surfaces a DESTRUCTIVE tool's declined confirmation as a failed (not thrown) tool result", async () => {
  const root = tmpWorkspace();
  await fs.writeFile(path.join(root, "important.txt"), "keep me");

  const provider = new ScriptedProvider([
    {
      content: [{ type: "tool_use", id: "call_1", name: "delete_file", input: { path: "important.txt" } }],
      stopReason: "tool_use",
    },
    {
      content: [{ type: "text", text: "Understood, leaving the file in place." }],
      stopReason: "end_turn",
    },
  ]);

  const loop = new AgentLoop(provider, buildDefaultRegistry(), root, "scripted-model");
  const run = await loop.run(
    "delete important.txt",
    { maxSteps: 10, maxRepeatedIdenticalCalls: 3 },
    { confirm: async () => false } // human declines
  );

  assert.equal(run.state, "COMPLETED");
  assert.equal(run.steps[0].toolCalls[0].ok, false);
  assert.ok(fssync.existsSync(path.join(root, "important.txt")), "declined delete must not remove the file");
});
