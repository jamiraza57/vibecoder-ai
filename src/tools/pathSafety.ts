import * as path from "node:path";

/** Filename/path patterns the agent must never touch without explicit user override. */
const PROTECTED_PATTERNS: RegExp[] = [
  /(^|\/)\.env(\..*)?$/i,
  /(^|\/)\.ssh(\/|$)/i,
  /id_rsa(\.pub)?$/i,
  /(^|\/)\.aws(\/|$)/i,
  /(^|\/)\.git\/config$/i,
  /credentials(\.json)?$/i,
  /secret[s]?\.(ya?ml|json|env)$/i,
  /(^|\/)\.npmrc$/i,
  /private[-_]?key/i,
];

export class PathSafetyError extends Error {}

/**
 * Resolves `relPath` against `workspaceRoot` and throws if the result would
 * escape the workspace, or if it matches a protected pattern (unless
 * `allowProtected` is explicitly set, which the caller must only do on
 * explicit, per-call user authorization — never by default).
 */
export function resolveSafePath(
  workspaceRoot: string,
  relPath: string,
  opts: { allowProtected?: boolean } = {}
): string {
  const root = path.resolve(workspaceRoot);
  const resolved = path.resolve(root, relPath);

  const relativeToRoot = path.relative(root, resolved);
  if (relativeToRoot.startsWith("..") || path.isAbsolute(relativeToRoot)) {
    throw new PathSafetyError(
      `Path "${relPath}" resolves outside the workspace root (${root}). Refusing.`
    );
  }

  if (!opts.allowProtected) {
    const posixRel = relativeToRoot.split(path.sep).join("/");
    for (const pattern of PROTECTED_PATTERNS) {
      if (pattern.test(posixRel)) {
        throw new PathSafetyError(
          `Path "${relPath}" matches a protected pattern (${pattern}) and requires explicit user authorization to access.`
        );
      }
    }
  }

  return resolved;
}

/** Redacts likely secrets from text before it is logged or sent to a model as tool output. */
export function redactSecrets(text: string): string {
  return text
    .replace(/sk-ant-[a-zA-Z0-9-_]{10,}/g, "[REDACTED_ANTHROPIC_KEY]")
    .replace(/sk-[a-zA-Z0-9]{20,}/g, "[REDACTED_API_KEY]")
    .replace(/AKIA[0-9A-Z]{16}/g, "[REDACTED_AWS_KEY_ID]")
    .replace(/-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----/g, "[REDACTED_PRIVATE_KEY]")
    .replace(/ghp_[a-zA-Z0-9]{30,}/g, "[REDACTED_GITHUB_TOKEN]");
}
