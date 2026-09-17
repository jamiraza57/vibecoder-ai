import { test } from "node:test";
import assert from "node:assert/strict";
import * as os from "node:os";
import * as fs from "node:fs/promises";
import * as fssync from "node:fs";
import * as path from "node:path";
import { execFileSync } from "node:child_process";
import { createCheckpoint, listCheckpoints, revertToCheckpoint, CheckpointError } from "../src/git/checkpoint";

function tmpRepo(): string {
  const root = fssync.mkdtempSync(path.join(os.tmpdir(), "vibecoder-checkpoint-test-"));
  execFileSync("git", ["init", "-q", "-b", "main"], { cwd: root });
  execFileSync("git", ["config", "user.email", "test@example.com"], { cwd: root });
  execFileSync("git", ["config", "user.name", "Test"], { cwd: root });
  fssync.writeFileSync(path.join(root, "a.txt"), "original content\n");
  execFileSync("git", ["add", "."], { cwd: root });
  execFileSync("git", ["commit", "-q", "-m", "initial commit"], { cwd: root });
  return root;
}

test("createCheckpoint returns null on a clean tree", () => {
  const root = tmpRepo();
  const checkpoint = createCheckpoint(root, "no-op");
  assert.equal(checkpoint, null);
});

test("createCheckpoint throws outside a git repository", () => {
  const root = fssync.mkdtempSync(path.join(os.tmpdir(), "vibecoder-nogit-"));
  assert.throws(() => createCheckpoint(root, "x"), CheckpointError);
});

test("createCheckpoint snapshots dirty state without touching the working tree", async () => {
  const root = tmpRepo();
  await fs.writeFile(path.join(root, "a.txt"), "modified content\n");
  await fs.writeFile(path.join(root, "b.txt"), "new untracked file\n");

  const checkpoint = createCheckpoint(root, "before risky edit");
  assert.ok(checkpoint);
  assert.match(checkpoint!.ref, /^refs\/vibecoder\/checkpoints\//);

  // Working tree must be completely untouched by creating a checkpoint.
  const aContent = await fs.readFile(path.join(root, "a.txt"), "utf-8");
  assert.equal(aContent, "modified content\n");
  assert.ok(fssync.existsSync(path.join(root, "b.txt")));
});

test("listCheckpoints returns created checkpoints newest first", async () => {
  const root = tmpRepo();
  await fs.writeFile(path.join(root, "a.txt"), "change 1\n");
  const cp1 = createCheckpoint(root, "first")!;

  await fs.writeFile(path.join(root, "a.txt"), "change 2\n");
  const cp2 = createCheckpoint(root, "second")!;

  const list = listCheckpoints(root);
  assert.ok(list.length >= 2);
  const refs = list.map((c) => c.ref);
  assert.ok(refs.includes(cp1.ref));
  assert.ok(refs.includes(cp2.ref));
});

test("revertToCheckpoint restores a snapshot after further destructive changes", async () => {
  const root = tmpRepo();
  await fs.writeFile(path.join(root, "a.txt"), "important work in progress\n");
  const checkpoint = createCheckpoint(root, "before destructive change")!;
  assert.ok(checkpoint);

  // Simulate something going wrong: overwrite the file and reset it back to the last commit.
  execFileSync("git", ["checkout", "--", "a.txt"], { cwd: root });
  const afterReset = await fs.readFile(path.join(root, "a.txt"), "utf-8");
  assert.equal(afterReset, "original content\n");

  const result = revertToCheckpoint(root, checkpoint.ref);
  assert.equal(result.ok, true);

  const restored = await fs.readFile(path.join(root, "a.txt"), "utf-8");
  assert.equal(restored, "important work in progress\n");
});

test("revertToCheckpoint throws on an unknown ref", () => {
  const root = tmpRepo();
  assert.throws(() => revertToCheckpoint(root, "refs/vibecoder/checkpoints/does-not-exist"), CheckpointError);
});
