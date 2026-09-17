import { ProjectMap } from "../context/types";
import { runCommand } from "./execCommand";
import { extractTestSummary } from "./summarize";

export type VerificationKind = "test" | "build" | "lint";

export interface VerificationResult {
  kind: VerificationKind;
  command: string;
  ok: boolean;
  exitCode: number | null;
  timedOut: boolean;
  durationMs: number;
  summary?: string;
  /** Only populated when ok is false, to keep the report concise on success. */
  failureOutputExcerpt?: string;
}

export interface VerificationReport {
  results: VerificationResult[];
  allPassed: boolean;
  /** Kinds the project map didn't detect a command for — reported so "nothing ran" isn't confused with "everything passed". */
  skippedKinds: VerificationKind[];
}

const DEFAULT_TIMEOUT_MS = 5 * 60_000;

export interface RunVerificationOptions {
  kinds?: VerificationKind[];
  timeoutMs?: number;
  onResult?: (result: VerificationResult) => void;
}

/**
 * Runs every detected command for the requested kinds (default: test, build,
 * lint) and reports what actually happened. This exists specifically so
 * "tests passed" is never asserted without a command actually having been
 * run and exited 0 — see spec section 76, "No Fake Success".
 */
export async function runVerification(
  workspaceRoot: string,
  projectMap: ProjectMap,
  options: RunVerificationOptions = {}
): Promise<VerificationReport> {
  const kinds = options.kinds ?? (["test", "build", "lint"] as VerificationKind[]);
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;

  const results: VerificationResult[] = [];
  const skippedKinds: VerificationKind[] = [];

  for (const kind of kinds) {
    const commands = projectMap.commands[kind];
    if (!commands.length) {
      skippedKinds.push(kind);
      continue;
    }
    for (const command of commands) {
      const run = await runCommand(workspaceRoot, command, timeoutMs);
      const result: VerificationResult = {
        kind,
        command,
        ok: run.ok,
        exitCode: run.exitCode,
        timedOut: run.timedOut,
        durationMs: run.durationMs,
        summary: extractTestSummary(run.stdout, run.stderr),
        failureOutputExcerpt: run.ok ? undefined : (run.stderr || run.stdout).slice(-3000),
      };
      results.push(result);
      options.onResult?.(result);
    }
  }

  return {
    results,
    allPassed: results.every((r) => r.ok),
    skippedKinds,
  };
}

export function formatVerificationReport(report: VerificationReport): string {
  const lines: string[] = [];
  for (const r of report.results) {
    const mark = r.ok ? "✓" : "✗";
    const timing = `${(r.durationMs / 1000).toFixed(1)}s`;
    lines.push(`${mark} [${r.kind}] ${r.command} (${timing})${r.summary ? ` — ${r.summary}` : ""}`);
    if (!r.ok) {
      if (r.timedOut) lines.push(`    timed out`);
      if (r.failureOutputExcerpt) {
        lines.push(
          r.failureOutputExcerpt
            .split("\n")
            .slice(-15)
            .map((l) => `    ${l}`)
            .join("\n")
        );
      }
    }
  }
  if (report.skippedKinds.length) {
    lines.push(`(no command detected for: ${report.skippedKinds.join(", ")})`);
  }
  if (!report.results.length) {
    lines.push("No test/build/lint commands were detected for this project — nothing was run.");
  }
  return lines.join("\n");
}
