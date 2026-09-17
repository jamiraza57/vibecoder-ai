import { test } from "node:test";
import assert from "node:assert/strict";
import * as os from "node:os";
import * as fs from "node:fs/promises";
import * as fssync from "node:fs";
import * as path from "node:path";
import { deleteFileTool } from "../src/tools/fs/deleteFile";
import { ToolContext } from "../src/tools/types";
import { buildDefaultRegistry } from "../src/tools";

function tmpWorkspace(): string {
  return fssync.mkdtempSync(path.join(os.tmpdir(), "vibecoder-del-test-"));
}

test("delete_file does not delete when the user declines confirmation", async () => {
  const root = tmpWorkspace();
  const filePath = path.join(root, "keep.txt");
  await fs.writeFile(filePath, "content");

  const ctx: ToolContext = { workspaceRoot: root, confirm: async () => false, autoApprove: new Set() };
  const result = await deleteFileTool.execute({ path: "keep.txt" }, ctx);

  assert.equal(result.ok, false);
  assert.ok(fssync.existsSync(filePath), "file should still exist after a declined confirmation");
});

test("delete_file deletes when the user approves confirmation", async () => {
  const root = tmpWorkspace();
  const filePath = path.join(root, "gone.txt");
  await fs.writeFile(filePath, "content");

  const ctx: ToolContext = { workspaceRoot: root, confirm: async () => true, autoApprove: new Set() };
  const result = await deleteFileTool.execute({ path: "gone.txt" }, ctx);

  assert.equal(result.ok, true);
  assert.ok(!fssync.existsSync(filePath));
});

test("delete_file skips the prompt when DESTRUCTIVE is auto-approved", async () => {
  const root = tmpWorkspace();
  const filePath = path.join(root, "gone2.txt");
  await fs.writeFile(filePath, "content");

  let confirmCalled = false;
  const ctx: ToolContext = {
    workspaceRoot: root,
    confirm: async () => {
      confirmCalled = true;
      return true;
    },
    autoApprove: new Set(["DESTRUCTIVE"]),
  };
  const result = await deleteFileTool.execute({ path: "gone2.txt" }, ctx);

  assert.equal(result.ok, true);
  assert.equal(confirmCalled, false);
});

test("ToolRegistry registers, looks up, and rejects duplicates", () => {
  const registry = buildDefaultRegistry();
  assert.ok(registry.get("read_file"));
  assert.ok(registry.get("run_terminal"));
  assert.equal(registry.get("nonexistent_tool"), undefined);

  assert.throws(() => registry.register({ ...deleteFileTool, name: "read_file" }));
});

test("ToolRegistry converts to Anthropic tool defs with a JSON schema per tool", () => {
  const registry = buildDefaultRegistry();
  const defs = registry.toAnthropicToolDefs();
  assert.ok(defs.length >= 7);
  for (const def of defs) {
    assert.equal(typeof def.name, "string");
    assert.equal(typeof def.description, "string");
    assert.equal(typeof def.input_schema, "object");
  }
});
