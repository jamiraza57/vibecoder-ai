import { test } from "node:test";
import assert from "node:assert/strict";
import * as os from "node:os";
import * as fs from "node:fs/promises";
import * as fssync from "node:fs";
import * as path from "node:path";
import { editFileTool } from "../src/tools/fs/editFile";
import { ToolContext } from "../src/tools/types";

function tmpWorkspace(): string {
  return fssync.mkdtempSync(path.join(os.tmpdir(), "vibecoder-edit-test-"));
}

function ctxFor(root: string): ToolContext {
  return { workspaceRoot: root, confirm: async () => true, autoApprove: new Set() };
}

test("edit_file applies a unique replacement", async () => {
  const root = tmpWorkspace();
  await fs.writeFile(path.join(root, "a.txt"), "hello world\ngoodbye world\n");

  const result = await editFileTool.execute({ path: "a.txt", old_str: "hello world", new_str: "hi world" }, ctxFor(root));
  assert.equal(result.ok, true);

  const content = await fs.readFile(path.join(root, "a.txt"), "utf-8");
  assert.equal(content, "hi world\ngoodbye world\n");
});

test("edit_file refuses when old_str is not found", async () => {
  const root = tmpWorkspace();
  await fs.writeFile(path.join(root, "a.txt"), "hello world\n");

  const result = await editFileTool.execute({ path: "a.txt", old_str: "not present", new_str: "x" }, ctxFor(root));
  assert.equal(result.ok, false);
  assert.match(result.error ?? "", /not found/);

  // File must be untouched.
  const content = await fs.readFile(path.join(root, "a.txt"), "utf-8");
  assert.equal(content, "hello world\n");
});

test("edit_file refuses when old_str is not unique", async () => {
  const root = tmpWorkspace();
  await fs.writeFile(path.join(root, "a.txt"), "dup\ndup\n");

  const result = await editFileTool.execute({ path: "a.txt", old_str: "dup", new_str: "x" }, ctxFor(root));
  assert.equal(result.ok, false);
  assert.match(result.error ?? "", /matched 2 times/);

  const content = await fs.readFile(path.join(root, "a.txt"), "utf-8");
  assert.equal(content, "dup\ndup\n");
});

test("edit_file refuses to escape the workspace", async () => {
  const root = tmpWorkspace();
  const result = await editFileTool.execute({ path: "../outside.txt", old_str: "a", new_str: "b" }, ctxFor(root));
  assert.equal(result.ok, false);
});
