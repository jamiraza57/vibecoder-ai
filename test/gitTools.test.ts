import { test } from "node:test";
import assert from "node:assert/strict";
import * as os from "node:os";
import * as fs from "node:fs/promises";
import * as fssync from "node:fs";
import * as path from "node:path";
import { execFileSync } from "node:child_process";
import { gitStatusTool } from "../src/tools/git/gitStatus";
import { gitDiffTool } from "../src/tools/git/gitDiff";
import { gitLogTool } from "../src/tools/git/gitLog";
import { gitBranchTool } from "../src/tools/git/gitBranch";
import { ToolContext } from "../src/tools/types";

function tmpRepo(): string {
  const root = fssync.mkdtempSync(path.join(os.tmpdir(), "vibecoder-gittools-test-"));
  execFileSync("git", ["init", "-q", "-b", "main"], { cwd: root });
  execFileSync("git", ["config", "user.email", "test@example.com"], { cwd: root });
  execFileSync("git", ["config", "user.name", "Test"], { cwd: root });
  fssync.writeFileSync(path.join(root, "a.txt"), "hello\n");
  execFileSync("git", ["add", "."], { cwd: root });
  execFileSync("git", ["commit", "-q", "-m", "initial commit"], { cwd: root });
  return root;
}

function ctxFor(root: string): ToolContext {
  return { workspaceRoot: root, confirm: async () => true, autoApprove: new Set() };
}

test("git_status reports a clean tree, then dirty after a modification", async () => {
  const root = tmpRepo();
  const clean = await gitStatusTool.execute({}, ctxFor(root));
  assert.equal(clean.ok, true);
  assert.match(clean.output, /nothing to commit|clean/i);

  await fs.writeFile(path.join(root, "a.txt"), "changed\n");
  const dirty = await gitStatusTool.execute({}, ctxFor(root));
  assert.match(dirty.output, /a\.txt/);
});

test("git_status fails cleanly outside a git repository", async () => {
  const root = fssync.mkdtempSync(path.join(os.tmpdir(), "vibecoder-nogit-tools-"));
  const result = await gitStatusTool.execute({}, ctxFor(root));
  assert.equal(result.ok, false);
});

test("git_diff shows unstaged changes and reports none on a clean tree", async () => {
  const root = tmpRepo();
  const clean = await gitDiffTool.execute({}, ctxFor(root));
  assert.equal(clean.output, "(no differences)");

  await fs.writeFile(path.join(root, "a.txt"), "hello world\n");
  const dirty = await gitDiffTool.execute({}, ctxFor(root));
  assert.match(dirty.output, /hello world/);
});

test("git_log shows the initial commit", async () => {
  const root = tmpRepo();
  const result = await gitLogTool.execute({ count: 5 }, ctxFor(root));
  assert.equal(result.ok, true);
  assert.match(result.output, /initial commit/);
});

test("git_branch lists the current branch", async () => {
  const root = tmpRepo();
  const result = await gitBranchTool.execute({}, ctxFor(root));
  assert.equal(result.ok, true);
  assert.match(result.output, /main/);
});
