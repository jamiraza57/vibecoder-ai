import { test } from "node:test";
import assert from "node:assert/strict";
import * as os from "node:os";
import * as fs from "node:fs/promises";
import * as fssync from "node:fs";
import * as path from "node:path";
import { parseGitignore, isIgnoredByRules, walkWorkspace } from "../src/context/ignore";

function tmpWorkspace(): string {
  return fssync.mkdtempSync(path.join(os.tmpdir(), "vibecoder-ignore-test-"));
}

test("parseGitignore skips comments and blank lines", () => {
  const rules = parseGitignore("# comment\n\n*.log\ndist/\n");
  assert.equal(rules.length, 2);
});

test("isIgnoredByRules matches a glob pattern against the basename", () => {
  const rules = parseGitignore("*.log\n");
  assert.equal(isIgnoredByRules("nested/dir/debug.log", false, rules), true);
  assert.equal(isIgnoredByRules("nested/dir/debug.txt", false, rules), false);
});

test("isIgnoredByRules only matches dir-only rules against directories", () => {
  const rules = parseGitignore("dist/\n");
  assert.equal(isIgnoredByRules("dist", true, rules), true);
  assert.equal(isIgnoredByRules("dist", false, rules), false);
});

test("isIgnoredByRules respects root-anchored rules", () => {
  const rules = parseGitignore("/build\n");
  assert.equal(isIgnoredByRules("build", false, rules), true);
  assert.equal(isIgnoredByRules("nested/build", false, rules), false);
});

test("walkWorkspace skips node_modules and .git even with no .gitignore", async () => {
  const root = tmpWorkspace();
  await fs.mkdir(path.join(root, "node_modules", "pkg"), { recursive: true });
  await fs.writeFile(path.join(root, "node_modules", "pkg", "index.js"), "x");
  await fs.mkdir(path.join(root, "src"), { recursive: true });
  await fs.writeFile(path.join(root, "src", "index.ts"), "x");

  const { files } = await walkWorkspace(root, [], { maxFiles: 1000 });
  const rels = files.map((f) => f.relPath);

  assert.ok(rels.includes(path.join("src", "index.ts")));
  assert.ok(!rels.some((r) => r.includes("node_modules")));
});

test("walkWorkspace respects a real .gitignore file", async () => {
  const root = tmpWorkspace();
  await fs.writeFile(path.join(root, ".gitignore"), "*.log\nsecret/\n");
  await fs.writeFile(path.join(root, "app.log"), "log data");
  await fs.writeFile(path.join(root, "app.ts"), "code");
  await fs.mkdir(path.join(root, "secret"), { recursive: true });
  await fs.writeFile(path.join(root, "secret", "keys.txt"), "shh");

  const { files } = await walkWorkspace(root, parseGitignore(await fs.readFile(path.join(root, ".gitignore"), "utf-8")), {
    maxFiles: 1000,
  });
  const rels = files.map((f) => f.relPath);

  assert.ok(rels.includes("app.ts"));
  assert.ok(!rels.includes("app.log"));
  assert.ok(!rels.some((r) => r.startsWith("secret")));
});

test("walkWorkspace truncates at maxFiles and reports it", async () => {
  const root = tmpWorkspace();
  for (let i = 0; i < 10; i++) {
    await fs.writeFile(path.join(root, `file${i}.txt`), "x");
  }
  const { files, truncated } = await walkWorkspace(root, [], { maxFiles: 5 });
  assert.equal(files.length, 5);
  assert.equal(truncated, true);
});
