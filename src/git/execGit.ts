import { spawnSync } from "node:child_process";

export interface GitResult {
  ok: boolean;
  stdout: string;
  stderr: string;
  exitCode: number | null;
}

/**
 * Runs `git <args>` in `cwd` with no shell involved — args are passed as an
 * argv array, so there is no string-interpolation/injection surface the way
 * there is with run_terminal's shell commands. This is what every git_* tool
 * and the checkpoint system call instead of going through run_terminal.
 */
export function execGit(cwd: string, args: string[]): GitResult {
  const result = spawnSync("git", args, { cwd, encoding: "utf-8" });
  if (result.error) {
    return { ok: false, stdout: "", stderr: result.error.message, exitCode: null };
  }
  return {
    ok: result.status === 0,
    stdout: (result.stdout ?? "").trim(),
    stderr: (result.stderr ?? "").trim(),
    exitCode: result.status,
  };
}

export function isGitRepo(cwd: string): boolean {
  const result = execGit(cwd, ["rev-parse", "--is-inside-work-tree"]);
  return result.ok && result.stdout === "true";
}
