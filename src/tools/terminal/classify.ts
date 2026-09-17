export type CommandRisk = "SAFE" | "MODIFYING" | "DANGEROUS";

/**
 * Dangerous patterns are checked first and win over everything else.
 * This is a heuristic safety net, not a sandbox — it reduces accidental
 * destructive actions but does not guarantee containment of arbitrary
 * shell input. Treat DANGEROUS as "must ask a human", not "safe to run".
 */
const DANGEROUS_PATTERNS: RegExp[] = [
  /\brm\s+(-\w*r\w*f?|-\w*f\w*r?)\b/i, // rm -rf, rm -fr, etc.
  /\brm\s+-\w*r\w*\b/i, // rm -r without necessarily -f
  /\bgit\s+reset\s+--hard\b/i,
  /\bgit\s+clean\s+-[dfx]/i,
  /\bgit\s+push\s+.*--force/i,
  /\bgit\s+push\s+.*-f\b/i,
  /\bgit\s+branch\s+-D\b/i,
  /\bmkfs\b/i,
  /\bdd\s+if=/i,
  /\bshutdown\b/i,
  /\breboot\b/i,
  /\bchmod\s+-R\s+777\b/i,
  /\bchown\s+-R\b/i,
  /:\(\)\s*\{.*\}\s*;\s*:/, // fork bomb
  />\s*\/dev\/sd/i,
  /\bcurl\b.*\|\s*(sh|bash)\b/i,
  /\bwget\b.*\|\s*(sh|bash)\b/i,
  /\bdrop\s+(table|database)\b/i,
  /\btruncate\s+table\b/i,
];

const MODIFYING_PATTERNS: RegExp[] = [
  /\bnpm\s+(install|i|ci|uninstall|update)\b/i,
  /\byarn\s+(add|remove|install)\b/i,
  /\bpnpm\s+(add|remove|install)\b/i,
  /\bpip\s+install\b/i,
  /\bflutter\s+pub\s+get\b/i,
  /\bnpm\s+run\s+build\b/i,
  /\bgit\s+(add|commit|checkout|merge|rebase|stash|pull)\b/i,
  /\bmv\b/i,
  /\btouch\b/i,
  /\bmkdir\b/i,
];

export function classifyCommand(command: string): CommandRisk {
  for (const pattern of DANGEROUS_PATTERNS) {
    if (pattern.test(command)) return "DANGEROUS";
  }
  for (const pattern of MODIFYING_PATTERNS) {
    if (pattern.test(command)) return "MODIFYING";
  }
  return "SAFE";
}
