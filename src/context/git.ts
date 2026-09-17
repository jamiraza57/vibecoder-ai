import { spawnSync } from "node:child_process";
import { DetectedGit } from "./types";

function runGit(workspaceRoot: string, args: string[]): { ok: boolean; stdout: string } {
  const result = spawnSync("git", args, { cwd: workspaceRoot, encoding: "utf-8" });
  return { ok: result.status === 0, stdout: (result.stdout ?? "").trim() };
}

/** Read-only git inspection. Never mutates repo state — no add/commit/checkout here. */
export function detectGit(workspaceRoot: string): DetectedGit {
  const isRepoCheck = runGit(workspaceRoot, ["rev-parse", "--is-inside-work-tree"]);
  if (!isRepoCheck.ok || isRepoCheck.stdout !== "true") {
    return { isRepo: false };
  }

  const branch = runGit(workspaceRoot, ["rev-parse", "--abbrev-ref", "HEAD"]);
  const status = runGit(workspaceRoot, ["status", "--porcelain"]);
  const lastCommit = runGit(workspaceRoot, ["log", "-1", "--pretty=%s"]);

  const changedLines = status.stdout ? status.stdout.split("\n").filter(Boolean) : [];

  return {
    isRepo: true,
    branch: branch.ok ? branch.stdout : undefined,
    isDirty: changedLines.length > 0,
    changedFileCount: changedLines.length,
    lastCommitSubject: lastCommit.ok && lastCommit.stdout ? lastCommit.stdout : undefined,
  };
}
