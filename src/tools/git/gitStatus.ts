import { Tool, ToolContext, ToolResult } from "../types";
import { execGit, isGitRepo } from "../../git/execGit";

export const gitStatusTool: Tool = {
  name: "git_status",
  description: "Show the working tree status (branch, staged/unstaged/untracked files) via `git status`.",
  permission: "READ",
  inputSchema: { type: "object", properties: {} },
  async execute(_args, ctx: ToolContext): Promise<ToolResult> {
    if (!isGitRepo(ctx.workspaceRoot)) {
      return { ok: false, output: "", error: "Not a git repository." };
    }
    const result = execGit(ctx.workspaceRoot, ["status"]);
    return result.ok
      ? { ok: true, output: result.stdout }
      : { ok: false, output: "", error: result.stderr || "git status failed." };
  },
};
