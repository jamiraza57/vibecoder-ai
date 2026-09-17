import { spawn } from "node:child_process";
import { redactSecrets } from "../tools/pathSafety";

export interface CommandRunResult {
  ok: boolean;
  exitCode: number | null;
  stdout: string;
  stderr: string;
  timedOut: boolean;
  durationMs: number;
}

const MAX_OUTPUT_CHARS = 20_000;

function truncate(s: string): string {
  return s.length > MAX_OUTPUT_CHARS ? s.slice(0, MAX_OUTPUT_CHARS) + "\n...[truncated]" : s;
}

/**
 * Runs a shell command in `cwd` and captures its outcome. Used for
 * verification (test/build/lint commands the repository index already
 * detected) rather than free-form agent-directed commands — there's no
 * confirmation gate here because the caller (the CLI's `verify` command, or
 * `run --verify`) already knows exactly which commands it's about to run and
 * why, unlike `run_terminal` where the model can propose anything.
 */
export function runCommand(cwd: string, command: string, timeoutMs: number): Promise<CommandRunResult> {
  const started = Date.now();
  return new Promise((resolve) => {
    const child = spawn(command, { cwd, shell: true, env: { ...process.env } });
    let stdout = "";
    let stderr = "";
    let timedOut = false;

    const timer = setTimeout(() => {
      timedOut = true;
      child.kill("SIGKILL");
    }, timeoutMs);

    child.stdout?.on("data", (d) => (stdout += d.toString()));
    child.stderr?.on("data", (d) => (stderr += d.toString()));

    child.on("close", (code) => {
      clearTimeout(timer);
      resolve({
        ok: !timedOut && code === 0,
        exitCode: code,
        stdout: truncate(redactSecrets(stdout)),
        stderr: truncate(redactSecrets(stderr)),
        timedOut,
        durationMs: Date.now() - started,
      });
    });

    child.on("error", (err) => {
      clearTimeout(timer);
      resolve({ ok: false, exitCode: null, stdout: "", stderr: err.message, timedOut: false, durationMs: Date.now() - started });
    });
  });
}
