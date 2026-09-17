import * as path from "node:path";
import { loadGitignore, walkWorkspace } from "./ignore";
import { detectGit } from "./git";
import { detectStackAndCommands } from "./detect";
import { computeImportantDirectories, findEntryPoints, findTestDirectories } from "./scan";
import { ProjectMap } from "./types";

const DEFAULT_MAX_FILES = 5000;

export async function buildProjectMap(workspaceRootInput: string, opts: { maxFiles?: number } = {}): Promise<ProjectMap> {
  const workspaceRoot = path.resolve(workspaceRootInput);
  const maxFiles = opts.maxFiles ?? DEFAULT_MAX_FILES;

  const rules = await loadGitignore(workspaceRoot);
  const { files, truncated } = await walkWorkspace(workspaceRoot, rules, { maxFiles });

  const { stack, commands } = await detectStackAndCommands(workspaceRoot, files);
  const git = detectGit(workspaceRoot);
  const importantDirectories = computeImportantDirectories(files);
  const testDirectories = findTestDirectories(files);
  const entryPoints = findEntryPoints(files);

  return {
    workspaceRoot,
    stack,
    commands,
    git,
    entryPoints,
    testDirectories,
    importantDirectories,
    totalFilesScanned: files.length,
    truncated,
  };
}

export * from "./types";
export { buildProjectMap as default };
