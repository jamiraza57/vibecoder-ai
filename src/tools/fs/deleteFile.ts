import * as fs from "node:fs/promises";
import { Tool, ToolContext, ToolResult } from "../types";
import { resolveSafePath } from "../pathSafety";

export const deleteFileTool: Tool = {
  name: "delete_file",
  description: "Permanently delete a file within the workspace. Destructive — requires user confirmation.",
  permission: "DESTRUCTIVE",
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

      if (!ctx.autoApprove.has("DESTRUCTIVE")) {
        const approved = await ctx.confirm(`Delete "${relPath}"? This cannot be undone by the agent.`);
        if (!approved) {
          return { ok: false, output: "", error: "User declined deletion." };
        }
      }

      await fs.unlink(abs);
      return { ok: true, output: `Deleted ${relPath}.` };
    } catch (err) {
      return { ok: false, output: "", error: (err as Error).message };
    }
  },
};
