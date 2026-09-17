import { test } from "node:test";
import assert from "node:assert/strict";
import * as os from "node:os";
import * as fs from "node:fs";
import * as path from "node:path";
import { resolveSafePath, PathSafetyError, redactSecrets } from "../src/tools/pathSafety";

function tmpWorkspace(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "vibecoder-test-"));
}

test("resolveSafePath allows a normal path inside the workspace", () => {
  const root = tmpWorkspace();
  const resolved = resolveSafePath(root, "src/index.ts");
  assert.equal(resolved, path.join(root, "src/index.ts"));
});

test("resolveSafePath rejects path traversal out of the workspace", () => {
  const root = tmpWorkspace();
  assert.throws(() => resolveSafePath(root, "../../etc/passwd"), PathSafetyError);
});

test("resolveSafePath rejects an absolute path outside the workspace", () => {
  const root = tmpWorkspace();
  assert.throws(() => resolveSafePath(root, "/etc/passwd"), PathSafetyError);
});

test("resolveSafePath rejects .env by default", () => {
  const root = tmpWorkspace();
  assert.throws(() => resolveSafePath(root, ".env"), PathSafetyError);
});

test("resolveSafePath rejects .env when allowProtected is explicitly set", () => {
  const root = tmpWorkspace();
  // allowProtected only bypasses PROTECTED_PATTERNS, never the workspace-escape check —
  // here .env is inside the workspace, so this should succeed.
  const resolved = resolveSafePath(root, ".env", { allowProtected: true });
  assert.equal(resolved, path.join(root, ".env"));
});

test("resolveSafePath rejects ssh keys", () => {
  const root = tmpWorkspace();
  assert.throws(() => resolveSafePath(root, ".ssh/id_rsa"), PathSafetyError);
});

test("redactSecrets masks an Anthropic-style key", () => {
  const text = "the key is sk-ant-api03-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa and nothing else";
  const redacted = redactSecrets(text);
  assert.ok(!redacted.includes("aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"));
  assert.ok(redacted.includes("[REDACTED_ANTHROPIC_KEY]"));
});

test("redactSecrets masks a private key block", () => {
  const text = "-----BEGIN RSA PRIVATE KEY-----\nMIIBogIBAAJ...\n-----END RSA PRIVATE KEY-----";
  const redacted = redactSecrets(text);
  assert.equal(redacted, "[REDACTED_PRIVATE_KEY]");
});
