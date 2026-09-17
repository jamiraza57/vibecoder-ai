import { test } from "node:test";
import assert from "node:assert/strict";
import * as os from "node:os";
import * as fs from "node:fs/promises";
import * as fssync from "node:fs";
import * as path from "node:path";
import { execFileSync } from "node:child_process";
import { buildProjectMap } from "../src/context/projectIndex";
import { formatProjectMap } from "../src/context/format";

function tmpWorkspace(): string {
  return fssync.mkdtempSync(path.join(os.tmpdir(), "vibecoder-projectindex-test-"));
}

test("buildProjectMap end-to-end on a Node + git fixture project", async () => {
  const root = tmpWorkspace();
  execFileSync("git", ["init", "-q", "-b", "main"], { cwd: root });
  execFileSync("git", ["config", "user.email", "test@example.com"], { cwd: root });
  execFileSync("git", ["config", "user.name", "Test"], { cwd: root });

  await fs.writeFile(path.join(root, ".gitignore"), "node_modules/\n");
  await fs.writeFile(
    path.join(root, "package.json"),
    JSON.stringify({
      name: "fixture-app",
      dependencies: { express: "^4.18.0" },
      scripts: { test: "node --test dist/test" },
    })
  );
  await fs.mkdir(path.join(root, "src"), { recursive: true });
  await fs.writeFile(path.join(root, "src", "index.ts"), "export const x = 1;\n");
  await fs.mkdir(path.join(root, "test"), { recursive: true });
  await fs.writeFile(path.join(root, "test", "index.test.ts"), "// test\n");
  await fs.mkdir(path.join(root, "node_modules", "express"), { recursive: true });
  await fs.writeFile(path.join(root, "node_modules", "express", "index.js"), "// vendored, must be excluded");

  execFileSync("git", ["add", ".gitignore", "package.json", "src", "test"], { cwd: root });
  execFileSync("git", ["commit", "-q", "-m", "fixture commit"], { cwd: root });

  const map = await buildProjectMap(root);

  assert.equal(map.workspaceRoot, root);
  assert.ok(map.stack.frameworks.includes("Express"));
  assert.ok(map.stack.dependencies.includes("express"));
  assert.ok(map.stack.packageManagers.includes("npm"));
  assert.deepEqual(map.commands.test, ["npm test"]);
  assert.ok(map.testDirectories.includes("test"));
  assert.ok(map.entryPoints.includes(path.join("src", "index.ts").split(path.sep).join("/")) || map.entryPoints.includes("src/index.ts"));
  assert.equal(map.git.isRepo, true);
  assert.equal(map.git.branch, "main");
  assert.equal(map.git.isDirty, false);
  // node_modules must never leak into the scanned file count or language stats.
  assert.ok(!map.importantDirectories.some((d) => d.path === "node_modules"));

  const formatted = formatProjectMap(map);
  assert.match(formatted, /Express/);
  assert.match(formatted, /npm test/);
  assert.match(formatted, /branch main/);
  assert.match(formatted, /clean working tree/);
});

test("buildProjectMap handles a workspace with no recognizable manifest gracefully", async () => {
  const root = tmpWorkspace();
  await fs.writeFile(path.join(root, "notes.txt"), "just some notes");

  const map = await buildProjectMap(root);
  assert.deepEqual(map.stack.frameworks, []);
  assert.equal(map.git.isRepo, false);

  const formatted = formatProjectMap(map);
  assert.match(formatted, /not a git repository/);
});
