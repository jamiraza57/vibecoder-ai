import { test } from "node:test";
import assert from "node:assert/strict";
import * as os from "node:os";
import * as fs from "node:fs/promises";
import * as fssync from "node:fs";
import * as path from "node:path";
import { execFileSync } from "node:child_process";
import { detectGit } from "../src/context/git";

function tmpWorkspace(): string {
  return fssync.mkdtempSync(path.join(os.tmpdir(), "vibecoder-git-test-"));
}

function git(cwd: string, args: string[]): void {
  execFileSync("git", args, { cwd, stdio: "ignore" });
}

test("detectGit reports isRepo: false outside a git repository", () => {
  const root = tmpWorkspace();
  const info = detectGit(root);
  assert.equal(info.isRepo, false);
});

test("detectGit reports branch, clean state, and last commit inside a repo", () => {
  const root = tmpWorkspace();
  git(root, ["init", "-q", "-b", "main"]);
  git(root, ["config", "user.email", "test@example.com"]);
  git(root, ["config", "user.name", "Test"]);
  fssync.writeFileSync(path.join(root, "a.txt"), "hello");
  git(root, ["add", "."]);
  git(root, ["commit", "-q", "-m", "initial commit"]);

  const info = detectGit(root);
  assert.equal(info.isRepo, true);
  assert.equal(info.branch, "main");
  assert.equal(info.isDirty, false);
  assert.equal(info.lastCommitSubject, "initial commit");
});

test("detectGit reports dirty state and changed file count", async () => {
  const root = tmpWorkspace();
  git(root, ["init", "-q", "-b", "main"]);
  git(root, ["config", "user.email", "test@example.com"]);
  git(root, ["config", "user.name", "Test"]);
  await fs.writeFile(path.join(root, "a.txt"), "hello");
  git(root, ["add", "."]);
  git(root, ["commit", "-q", "-m", "initial commit"]);

  await fs.writeFile(path.join(root, "a.txt"), "changed");
  await fs.writeFile(path.join(root, "b.txt"), "new file");

  const info = detectGit(root);
  assert.equal(info.isDirty, true);
  assert.equal(info.changedFileCount, 2);
});
