import { ToolRegistry } from "./registry";
import { readFileTool } from "./fs/readFile";
import { writeFileTool } from "./fs/writeFile";
import { editFileTool } from "./fs/editFile";
import { deleteFileTool } from "./fs/deleteFile";
import { listDirectoryTool } from "./fs/listDirectory";
import { searchTextTool } from "./fs/searchText";
import { runTerminalTool } from "./terminal/runTerminal";

export * from "./types";
export { ToolRegistry } from "./registry";
export { resolveSafePath, redactSecrets, PathSafetyError } from "./pathSafety";

/** The initial tool set. Additional tools (git_*, image_*, browser_*) register the same way. */
export function buildDefaultRegistry(): ToolRegistry {
  const registry = new ToolRegistry();
  registry.register(readFileTool);
  registry.register(writeFileTool);
  registry.register(editFileTool);
  registry.register(deleteFileTool);
  registry.register(listDirectoryTool);
  registry.register(searchTextTool);
  registry.register(runTerminalTool);
  return registry;
}
