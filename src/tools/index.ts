import { ToolRegistry } from "./registry";
import { readFileTool } from "./fs/readFile";
import { writeFileTool } from "./fs/writeFile";
import { editFileTool } from "./fs/editFile";
import { deleteFileTool } from "./fs/deleteFile";
import { listDirectoryTool } from "./fs/listDirectory";
import { searchTextTool } from "./fs/searchText";
import { runTerminalTool } from "./terminal/runTerminal";
import { gitStatusTool } from "./git/gitStatus";
import { gitDiffTool } from "./git/gitDiff";
import { gitLogTool } from "./git/gitLog";
import { gitBranchTool } from "./git/gitBranch";
import { gitCheckoutTool } from "./git/gitCheckout";
import { gitCommitTool } from "./git/gitCommit";

export * from "./types";
export { ToolRegistry } from "./registry";
export { resolveSafePath, redactSecrets, PathSafetyError } from "./pathSafety";

/** The initial tool set. Additional tools (image_*, browser_*) register the same way. */
export function buildDefaultRegistry(): ToolRegistry {
  const registry = new ToolRegistry();
  registry.register(readFileTool);
  registry.register(writeFileTool);
  registry.register(editFileTool);
  registry.register(deleteFileTool);
  registry.register(listDirectoryTool);
  registry.register(searchTextTool);
  registry.register(runTerminalTool);
  registry.register(gitStatusTool);
  registry.register(gitDiffTool);
  registry.register(gitLogTool);
  registry.register(gitBranchTool);
  registry.register(gitCheckoutTool);
  registry.register(gitCommitTool);
  return registry;
}
