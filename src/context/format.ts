import { ProjectMap } from "./types";

/**
 * Deliberately concise: this is prepended to the agent's system prompt on
 * every step, so it must stay small relative to the context window rather
 * than dump the full repository. Full detail is available to the agent on
 * demand via the read_file/list_directory/search_text tools.
 */
export function formatProjectMap(map: ProjectMap): string {
  const lines: string[] = [];

  lines.push(`## Project map (${map.workspaceRoot})`);

  if (map.stack.languages.length) {
    lines.push(`Languages: ${map.stack.languages.map((l) => `${l.language} (${l.fileCount} files)`).join(", ")}`);
  }
  if (map.stack.frameworks.length) lines.push(`Frameworks: ${map.stack.frameworks.join(", ")}`);
  if (map.stack.packageManagers.length) lines.push(`Package manager(s): ${map.stack.packageManagers.join(", ")}`);
  if (map.stack.configFiles.length) lines.push(`Config files present: ${map.stack.configFiles.join(", ")}`);
  if (map.stack.dependencies.length) {
    lines.push(`Top dependencies: ${map.stack.dependencies.slice(0, 15).join(", ")}${map.stack.dependencies.length > 15 ? ", …" : ""}`);
  }

  const cmdParts: string[] = [];
  if (map.commands.test.length) cmdParts.push(`test: ${map.commands.test.join(" / ")}`);
  if (map.commands.build.length) cmdParts.push(`build: ${map.commands.build.join(" / ")}`);
  if (map.commands.lint.length) cmdParts.push(`lint: ${map.commands.lint.join(" / ")}`);
  if (cmdParts.length) lines.push(`Known commands — ${cmdParts.join("; ")}`);

  if (map.entryPoints.length) lines.push(`Entry points: ${map.entryPoints.join(", ")}`);
  if (map.testDirectories.length) lines.push(`Test directories: ${map.testDirectories.join(", ")}`);

  if (map.importantDirectories.length) {
    lines.push(
      `Largest directories: ${map.importantDirectories.map((d) => `${d.path}/ (${d.fileCount} files)`).join(", ")}`
    );
  }

  if (map.git.isRepo) {
    const gitBits = [`branch ${map.git.branch ?? "unknown"}`];
    if (map.git.isDirty) gitBits.push(`${map.git.changedFileCount} uncommitted change(s)`);
    else gitBits.push("clean working tree");
    if (map.git.lastCommitSubject) gitBits.push(`last commit: "${map.git.lastCommitSubject}"`);
    lines.push(`Git: ${gitBits.join(", ")}`);
  } else {
    lines.push(`Git: not a git repository`);
  }

  lines.push(`Files scanned: ${map.totalFilesScanned}${map.truncated ? " (scan truncated — very large tree)" : ""}`);

  return lines.join("\n");
}
