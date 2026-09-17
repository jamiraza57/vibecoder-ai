import * as fs from "node:fs/promises";
import * as path from "node:path";
import { WalkedFile } from "./types";

/** Directories skipped even if not in .gitignore — noise that isn't the user's own source. */
const ALWAYS_IGNORED_DIRS = new Set([
  ".git",
  "node_modules",
  "dist",
  "build",
  ".next",
  "__pycache__",
  ".venv",
  "venv",
  ".dart_tool",
  ".pub-cache",
  "vendor",
  ".idea",
  ".vscode",
]);

/**
 * Parses a .gitignore file into a list of simple matchers. This intentionally
 * supports the common subset (plain names, trailing-slash dir-only entries,
 * leading-slash root-anchored entries, `*` globs, `#` comments, blank lines)
 * rather than full gitignore semantics (no negation, no `**`) — enough to
 * avoid indexing build output and dependency trees without a gitignore
 * library dependency.
 */
export interface IgnoreRule {
  raw: string;
  dirOnly: boolean;
  anchored: boolean;
  regex: RegExp;
}

function globToRegex(glob: string): RegExp {
  const escaped = glob
    .replace(/[.+^${}()|[\]\\]/g, "\\$&")
    .replace(/\*/g, ".*")
    .replace(/\?/g, ".");
  return new RegExp(`^${escaped}$`);
}

export function parseGitignore(content: string): IgnoreRule[] {
  return content
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith("#") && !line.startsWith("!"))
    .map((line) => {
      const dirOnly = line.endsWith("/");
      const anchored = line.startsWith("/");
      const pattern = line.replace(/^\/+/, "").replace(/\/+$/, "");
      return { raw: line, dirOnly, anchored, regex: globToRegex(pattern) };
    });
}

export function isIgnoredByRules(relPath: string, isDir: boolean, rules: IgnoreRule[]): boolean {
  const base = path.basename(relPath);
  for (const rule of rules) {
    if (rule.dirOnly && !isDir) continue;
    if (rule.anchored) {
      if (rule.regex.test(relPath)) return true;
    } else {
      if (rule.regex.test(base) || rule.regex.test(relPath)) return true;
    }
  }
  return false;
}

export async function loadGitignore(workspaceRoot: string): Promise<IgnoreRule[]> {
  try {
    const content = await fs.readFile(path.join(workspaceRoot, ".gitignore"), "utf-8");
    return parseGitignore(content);
  } catch {
    return [];
  }
}

export interface WalkOptions {
  /** Hard cap on files visited, so a huge or misconfigured workspace can't hang indexing. */
  maxFiles: number;
}

/** Recursively walks the workspace, skipping always-ignored dirs and anything matching .gitignore. */
export async function walkWorkspace(
  workspaceRoot: string,
  rules: IgnoreRule[],
  opts: WalkOptions
): Promise<{ files: WalkedFile[]; truncated: boolean }> {
  const files: WalkedFile[] = [];
  let truncated = false;

  async function recurse(dir: string): Promise<void> {
    if (truncated) return;
    let entries;
    try {
      entries = await fs.readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      if (files.length >= opts.maxFiles) {
        truncated = true;
        return;
      }
      const abs = path.join(dir, entry.name);
      const rel = path.relative(workspaceRoot, abs);

      if (entry.isDirectory()) {
        if (ALWAYS_IGNORED_DIRS.has(entry.name)) continue;
        if (isIgnoredByRules(rel, true, rules)) continue;
        await recurse(abs);
      } else if (entry.isFile()) {
        if (isIgnoredByRules(rel, false, rules)) continue;
        files.push({ absPath: abs, relPath: rel });
      }
    }
  }

  await recurse(workspaceRoot);
  return { files, truncated };
}
