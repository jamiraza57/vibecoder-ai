import * as fs from "node:fs/promises";
import * as path from "node:path";
import { Tool, ToolContext, ToolResult } from "../types";
import { resolveSafePath } from "../pathSafety";

export const writeFileTool: Tool = {
  name: "write_file",
  description:
    "Create a new file or overwrite an existing one with the given content. Creates parent directories as needed. Prefer edit_file for modifying an existing file's content.",
  permission: "WRITE",
  inputSchema: {
    type: "object",
    properties: {
      path: { type: "string", description: "Path relative to the workspace root." },
      content: { type: "string", description: "Full file content to write." },
    },
    required: ["path", "content"],
  },
  async execute(args, ctx: ToolContext): Promise<ToolResult> {
    const relPath = String(args.path ?? "");
    const content = String(args.content ?? "");
    try {
      const abs = resolveSafePath(ctx.workspaceRoot, relPath);
      const existed = await fs
        .access(abs)
        .then(() => true)
        .catch(() => false);
      await fs.mkdir(path.dirname(abs), { recursive: true });
      await fs.writeFile(abs, content, "utf-8");
      return { ok: true, output: `${existed ? "Overwrote" : "Created"} ${relPath} (${Buffer.byteLength(content)} bytes).` };
    } catch (err) {
      return { ok: false, output: "", error: (err as Error).message };
    }
  },
};
