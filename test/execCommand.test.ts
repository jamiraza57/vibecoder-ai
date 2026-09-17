import { test } from "node:test";
import assert from "node:assert/strict";
import * as os from "node:os";
import * as fssync from "node:fs";
import * as path from "node:path";
import { runCommand } from "../src/verify/execCommand";
import { extractTestSummary } from "../src/verify/summarize";

function tmpDir(): string {
  return fssync.mkdtempSync(path.join(os.tmpdir(), "vibecoder-execcmd-test-"));
}

test("runCommand reports ok:true and captures stdout on success", async () => {
  const result = await runCommand(tmpDir(), "echo hello-world", 5000);
  assert.equal(result.ok, true);
  assert.equal(result.exitCode, 0);
  assert.match(result.stdout, /hello-world/);
});

test("runCommand reports ok:false and a nonzero exit code on failure", async () => {
  const result = await runCommand(tmpDir(), "exit 1", 5000);
  assert.equal(result.ok, false);
  assert.equal(result.exitCode, 1);
});

test("runCommand times out long-running commands and reports timedOut", async () => {
  const result = await runCommand(tmpDir(), "sleep 5", 200);
  assert.equal(result.ok, false);
  assert.equal(result.timedOut, true);
});

test("extractTestSummary parses a Jest-style summary line", () => {
  const stdout = "Some noise\nTests:       1 failed, 9 passed, 10 total\nmore noise";
  assert.equal(extractTestSummary(stdout, ""), "Tests:       1 failed, 9 passed, 10 total");
});

test("extractTestSummary parses a pytest-style summary line", () => {
  const stdout = "collecting...\n==================== 2 failed, 8 passed in 1.23s ====================";
  const summary = extractTestSummary(stdout, "");
  assert.match(summary ?? "", /2 failed, 8 passed in 1\.23s/);
});

test("extractTestSummary parses a Flutter test summary line", () => {
  const stdout = "00:01 +5: loading /test/widget_test.dart\n00:03 +12: All tests passed!";
  assert.equal(extractTestSummary(stdout, ""), "00:03 +12: All tests passed!");
});

test("extractTestSummary falls back to the last output line for unrecognized tools", () => {
  const stdout = "compiling...\nlinking...\nBuild complete in 3.2s";
  assert.equal(extractTestSummary(stdout, ""), "Build complete in 3.2s");
});

test("extractTestSummary returns undefined for empty output", () => {
  assert.equal(extractTestSummary("", ""), undefined);
});
