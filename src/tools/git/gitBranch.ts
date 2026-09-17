import { Tool, ToolContext, ToolResult } from "../types";
import { execGit, isGitRepo } from "../../git/execGit";

export const gitBranchTool: Tool = {
  name: "git_branch",
  description: "List local branches via `git branch`, marking the current one.",
  permission: "READ",
  inputSchema: { type: "object", properties: {} },
  async execute(_args, ctx: ToolContext): Promise<ToolResult> {
    if (!isGitRepo(ctx.workspaceRoot)) {
      return { ok: false, output: "", error: "Not a git repository." };
    }
    const result = execGit(ctx.workspaceRoot, ["branch"]);
    return result.ok
      ? { ok: true, output: result.stdout || "(no branches — repository has no commits yet)" }
      : { ok: false, output: "", error: result.stderr || "git branch failed." };
  },
};
