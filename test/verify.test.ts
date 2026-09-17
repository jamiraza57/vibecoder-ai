import { test } from "node:test";
import assert from "node:assert/strict";
import * as os from "node:os";
import * as fs from "node:fs/promises";
import * as fssync from "node:fs";
import * as path from "node:path";
import { runVerification, formatVerificationReport } from "../src/verify/verify";
import { buildProjectMap } from "../src/context/projectIndex";

function tmpWorkspace(): string {
  return fssync.mkdtempSync(path.join(os.tmpdir(), "vibecoder-verify-test-"));
}

test("runVerification runs a passing test script and reports success", async () => {
  const root = tmpWorkspace();
  await fs.writeFile(
    path.join(root, "package.json"),
    JSON.stringify({ name: "fixture", scripts: { test: "echo 'Tests: 3 passed, 3 total' && exit 0" } })
  );

  const map = await buildProjectMap(root);
  const report = await runVerification(root, map, { kinds: ["test"] });

  assert.equal(report.allPassed, true);
  assert.equal(report.results.length, 1);
  assert.equal(report.results[0].ok, true);
  assert.match(report.results[0].summary ?? "", /3 passed, 3 total/);

  const formatted = formatVerificationReport(report);
  assert.match(formatted, /✓ \[test\]/);
});

test("runVerification runs a failing test script and reports failure with an output excerpt", async () => {
  const root = tmpWorkspace();
  await fs.writeFile(
    path.join(root, "package.json"),
    JSON.stringify({ name: "fixture", scripts: { test: "echo 'Tests: 2 failed, 1 passed, 3 total' 1>&2 && exit 1" } })
  );

  const map = await buildProjectMap(root);
  const report = await runVerification(root, map, { kinds: ["test"] });

  assert.equal(report.allPassed, false);
  assert.equal(report.results[0].ok, false);
  assert.ok(report.results[0].failureOutputExcerpt?.includes("failed"));

  const formatted = formatVerificationReport(report);
  assert.match(formatted, /✗ \[test\]/);
});

test("runVerification reports skipped kinds when no command was detected", async () => {
  const root = tmpWorkspace();
  await fs.writeFile(path.join(root, "notes.txt"), "not a real project");

  const map = await buildProjectMap(root);
  const report = await runVerification(root, map);

  assert.equal(report.results.length, 0);
  assert.equal(report.allPassed, true); // vacuously true — nothing ran, nothing failed
  assert.deepEqual(report.skippedKinds.sort(), ["build", "lint", "test"]);

  const formatted = formatVerificationReport(report);
  assert.match(formatted, /no command detected for/);
});

test("runVerification calls onResult as each command finishes", async () => {
  const root = tmpWorkspace();
  await fs.writeFile(
    path.join(root, "package.json"),
    JSON.stringify({ name: "fixture", scripts: { test: "exit 0", lint: "exit 0" } })
  );
  const map = await buildProjectMap(root);

  const seen: string[] = [];
  await runVerification(root, map, { kinds: ["test", "lint"], onResult: (r) => seen.push(r.kind) });

  assert.deepEqual(seen.sort(), ["lint", "test"]);
});
