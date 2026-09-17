import * as fs from "node:fs/promises";
import * as path from "node:path";
import { Tool, ToolContext, ToolResult } from "../types";
import { resolveSafePath } from "../pathSafety";

const IGNORED_DIRS = new Set([".git", "node_modules", "dist", "build", ".next", "__pycache__", ".venv"]);

export const listDirectoryTool: Tool = {
  name: "list_directory",
  description: "List files and subdirectories at a path within the workspace (non-recursive). Skips .git, node_modules, dist, build and similar.",
  permission: "READ",
  inputSchema: {
    type: "object",
    properties: {
      path: { type: "string", description: "Path relative to the workspace root. Defaults to the root itself." },
    },
  },
  async execute(args, ctx: ToolContext): Promise<ToolResult> {
    const relPath = String(args.path ?? ".");
    try {
      const abs = resolveSafePath(ctx.workspaceRoot, relPath);
      const entries = await fs.readdir(abs, { withFileTypes: true });
      const lines = entries
        .filter((e) => !IGNORED_DIRS.has(e.name))
        .sort((a, b) => a.name.localeCompare(b.name))
        .map((e) => `${e.isDirectory() ? "d" : "-"} ${path.join(relPath, e.name)}`);
      return { ok: true, output: lines.join("\n") || "(empty directory)" };
    } catch (err) {
      return { ok: false, output: "", error: (err as Error).message };
    }
  },
};
