import { test } from "node:test";
import assert from "node:assert/strict";
import * as os from "node:os";
import * as fs from "node:fs/promises";
import * as fssync from "node:fs";
import * as path from "node:path";
import { execFileSync } from "node:child_process";
import { gitCheckoutTool } from "../src/tools/git/gitCheckout";
import { gitCommitTool } from "../src/tools/git/gitCommit";
import { ToolContext } from "../src/tools/types";

function tmpRepo(): string {
  const root = fssync.mkdtempSync(path.join(os.tmpdir(), "vibecoder-gitwrite-test-"));
  execFileSync("git", ["init", "-q", "-b", "main"], { cwd: root });
  execFileSync("git", ["config", "user.email", "test@example.com"], { cwd: root });
  execFileSync("git", ["config", "user.name", "Test"], { cwd: root });
  fssync.writeFileSync(path.join(root, "a.txt"), "hello\n");
  execFileSync("git", ["add", "."], { cwd: root });
  execFileSync("git", ["commit", "-q", "-m", "initial commit"], { cwd: root });
  return root;
}

function currentBranch(root: string): string {
  return execFileSync("git", ["rev-parse", "--abbrev-ref", "HEAD"], { cwd: root, encoding: "utf-8" }).trim();
}

test("git_checkout refuses to switch branches over uncommitted changes", async () => {
  const root = tmpRepo();
  await fs.writeFile(path.join(root, "a.txt"), "dirty\n");

  const ctx: ToolContext = { workspaceRoot: root, confirm: async () => true, autoApprove: new Set() };
  const result = await gitCheckoutTool.execute({ branch: "feature", create: true }, ctx);

  assert.equal(result.ok, false);
  assert.match(result.error ?? "", /uncommitted changes/);
  assert.equal(currentBranch(root), "main");
});

test("git_checkout creates and switches to a new branch on a clean tree", async () => {
  const root = tmpRepo();
  const ctx: ToolContext = { workspaceRoot: root, confirm: async () => true, autoApprove: new Set() };
  const result = await gitCheckoutTool.execute({ branch: "feature/login", create: true }, ctx);

  assert.equal(result.ok, true);
  assert.equal(currentBranch(root), "feature/login");
});

test("git_checkout does not switch when the user declines confirmation", async () => {
  const root = tmpRepo();
  const ctx: ToolContext = { workspaceRoot: root, confirm: async () => false, autoApprove: new Set() };
  const result = await gitCheckoutTool.execute({ branch: "feature", create: true }, ctx);

  assert.equal(result.ok, false);
  assert.equal(currentBranch(root), "main");
});

test("git_commit stages and commits specific paths with a message", async () => {
  const root = tmpRepo();
  await fs.writeFile(path.join(root, "a.txt"), "updated\n");
  await fs.writeFile(path.join(root, "untouched.txt"), "should not be committed\n");

  const ctx: ToolContext = { workspaceRoot: root, confirm: async () => true, autoApprove: new Set() };
  const result = await gitCommitTool.execute({ message: "update a.txt", paths: ["a.txt"] }, ctx);

  assert.equal(result.ok, true);
  const log = execFileSync("git", ["log", "-1", "--pretty=%s"], { cwd: root, encoding: "utf-8" }).trim();
  assert.equal(log, "update a.txt");

  // untouched.txt should still be untracked, not swept in by the commit.
  const status = execFileSync("git", ["status", "--porcelain"], { cwd: root, encoding: "utf-8" });
  assert.match(status, /untouched\.txt/);
});

test("git_commit refuses an empty message", async () => {
  const root = tmpRepo();
  const ctx: ToolContext = { workspaceRoot: root, confirm: async () => true, autoApprove: new Set() };
  const result = await gitCommitTool.execute({ message: "   " }, ctx);
  assert.equal(result.ok, false);
});

test("git_commit reports nothing-to-commit on a clean tree", async () => {
  const root = tmpRepo();
  const ctx: ToolContext = { workspaceRoot: root, confirm: async () => true, autoApprove: new Set() };
  const result = await gitCommitTool.execute({ message: "no-op" }, ctx);
  assert.equal(result.ok, false);
  assert.match(result.error ?? "", /nothing to commit/i);
});

test("git_commit skips confirmation when WRITE is auto-approved", async () => {
  const root = tmpRepo();
  await fs.writeFile(path.join(root, "a.txt"), "auto-approved change\n");

  let confirmCalled = false;
  const ctx: ToolContext = {
    workspaceRoot: root,
    confirm: async () => {
      confirmCalled = true;
      return true;
    },
    autoApprove: new Set(["WRITE"]),
  };
  const result = await gitCommitTool.execute({ message: "auto" }, ctx);
  assert.equal(result.ok, true);
  assert.equal(confirmCalled, false);
});
