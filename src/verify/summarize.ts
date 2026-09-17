/**
 * Extracts a short human-readable summary line from test-runner output.
 * This is a heuristic convenience for reporting, NOT the source of truth for
 * pass/fail — the exit code is. If no known pattern matches, falls back to
 * the last non-empty output line, which is often informative even for
 * unrecognized tools.
 */
export function extractTestSummary(stdout: string, stderr: string): string | undefined {
  const combined = `${stdout}\n${stderr}`;

  // Jest: "Tests:       2 failed, 8 passed, 10 total"
  const jest = combined.match(/Tests:\s+.*total/);
  if (jest) return jest[0].trim();

  // Mocha: "  10 passing (123ms)" / "  2 failing"
  const mochaPassing = combined.match(/(\d+)\s+passing\b[^\n]*/);
  const mochaFailing = combined.match(/(\d+)\s+failing\b[^\n]*/);
  if (mochaPassing || mochaFailing) {
    return [mochaPassing?.[0].trim(), mochaFailing?.[0].trim()].filter(Boolean).join(", ");
  }

  // pytest: "==== 3 failed, 12 passed in 1.23s ===="
  const pytest = combined.match(/=+\s*(\d+ (failed|passed|error)[^=]*)=+/i);
  if (pytest) return pytest[1].trim();

  // Flutter test: "00:03 +12: All tests passed!" or "00:05 +8 -2: Some tests failed."
  // Multiple timestamped progress lines can appear; the last one is the final result.
  const flutterMatches = [...combined.matchAll(/\d{2}:\d{2} \+\d+( -\d+)?:[^\n]*/g)];
  if (flutterMatches.length) return flutterMatches[flutterMatches.length - 1][0].trim();

  // Go test: "ok  	pkg/name	0.004s" or "FAIL	pkg/name	0.004s"
  const goTest = combined.match(/^(ok|FAIL)\s+\S+.*$/m);
  if (goTest) return goTest[0].trim();

  // Generic fallback: last non-empty line of stdout, else stderr.
  const lines = (stdout.trim() || stderr.trim()).split("\n").filter((l) => l.trim());
  return lines.length ? lines[lines.length - 1].trim() : undefined;
}
