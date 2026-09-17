import * as fs from "node:fs/promises";
import { Tool, ToolContext, ToolResult } from "../types";
import { resolveSafePath } from "../pathSafety";

export const readFileTool: Tool = {
  name: "read_file",
  description: "Read the full UTF-8 text content of a file within the workspace, with 1-indexed line numbers.",
  permission: "READ",
  inputSchema: {
    type: "object",
    properties: {
      path: { type: "string", description: "Path relative to the workspace root." },
    },
    required: ["path"],
  },
  async execute(args, ctx: ToolContext): Promise<ToolResult> {
    const relPath = String(args.path ?? "");
    try {
      const abs = resolveSafePath(ctx.workspaceRoot, relPath);
      const content = await fs.readFile(abs, "utf-8");
      const numbered = content
        .split("\n")
        .map((line, i) => `${i + 1}\t${line}`)
        .join("\n");
      return { ok: true, output: numbered, meta: { bytes: Buffer.byteLength(content) } };
    } catch (err) {
      return { ok: false, output: "", error: (err as Error).message };
    }
  },
};
