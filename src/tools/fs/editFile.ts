import * as fs from "node:fs/promises";
import { Tool, ToolContext, ToolResult } from "../types";
import { resolveSafePath } from "../pathSafety";

/** Counts non-overlapping occurrences of `needle` in `haystack`. */
function countOccurrences(haystack: string, needle: string): number {
  if (needle.length === 0) return 0;
  let count = 0;
  let idx = 0;
  while ((idx = haystack.indexOf(needle, idx)) !== -1) {
    count++;
    idx += needle.length;
  }
  return count;
}

export const editFileTool: Tool = {
  name: "edit_file",
  description:
    "Replace an exact, unique substring of an existing file with new text. Fails safely (no write) if old_str is not found or is not unique — read the file first to get exact current content, preventing stale-context overwrites.",
  permission: "WRITE",
  inputSchema: {
    type: "object",
    properties: {
      path: { type: "string", description: "Path relative to the workspace root." },
      old_str: { type: "string", description: "Exact text to find. Must appear exactly once in the file." },
      new_str: { type: "string", description: "Replacement text. Empty string deletes old_str." },
    },
    required: ["path", "old_str", "new_str"],
  },
  async execute(args, ctx: ToolContext): Promise<ToolResult> {
    const relPath = String(args.path ?? "");
    const oldStr = String(args.old_str ?? "");
    const newStr = String(args.new_str ?? "");
    try {
      const abs = resolveSafePath(ctx.workspaceRoot, relPath);
      const content = await fs.readFile(abs, "utf-8");
      const occurrences = countOccurrences(content, oldStr);

      if (occurrences === 0) {
        return { ok: false, output: "", error: `old_str not found in ${relPath}. Re-read the file to get exact current content.` };
      }
      if (occurrences > 1) {
        return {
          ok: false,
          output: "",
          error: `old_str matched ${occurrences} times in ${relPath}; it must be unique. Add more surrounding context to old_str.`,
        };
      }

      const updated = content.replace(oldStr, newStr);
      await fs.writeFile(abs, updated, "utf-8");
      return { ok: true, output: `Applied edit to ${relPath} (1 replacement).` };
    } catch (err) {
      return { ok: false, output: "", error: (err as Error).message };
    }
  },
};
