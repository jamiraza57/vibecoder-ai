import { test } from "node:test";
import assert from "node:assert/strict";
import * as path from "node:path";
import { computeImportantDirectories, findEntryPoints, findTestDirectories } from "../src/context/scan";
import { WalkedFile } from "../src/context/types";

function file(relPath: string): WalkedFile {
  return { absPath: `/workspace/${relPath}`, relPath: relPath.split("/").join(path.sep) };
}

test("computeImportantDirectories ranks top-level dirs by file count", () => {
  const files = [file("src/a.ts"), file("src/b.ts"), file("src/c.ts"), file("test/a.test.ts"), file("README.md")];
  const dirs = computeImportantDirectories(files);
  assert.equal(dirs[0].path, "src");
  assert.equal(dirs[0].fileCount, 3);
  assert.equal(dirs[1].path, "test");
  assert.equal(dirs[1].fileCount, 1);
  // Root-level README.md must not appear as a "directory".
  assert.ok(!dirs.some((d) => d.path === "README.md"));
});

test("findTestDirectories finds common test directory names at any depth", () => {
  const files = [file("test/a.ts"), file("src/feature/__tests__/b.ts"), file("lib/spec/c.ts"), file("src/index.ts")];
  const dirs = findTestDirectories(files);
  assert.ok(dirs.includes("test"));
  assert.ok(dirs.some((d) => d.endsWith("__tests__")));
  assert.ok(dirs.some((d) => d.endsWith("spec")));
});

test("findEntryPoints only reports candidates that actually exist", () => {
  const files = [file("src/index.ts"), file("README.md")];
  const entries = findEntryPoints(files);
  assert.deepEqual(entries, ["src/index.ts"]);
});

test("findEntryPoints returns nothing when no known entry point is present", () => {
  const files = [file("some/random/file.txt")];
  assert.deepEqual(findEntryPoints(files), []);
});
