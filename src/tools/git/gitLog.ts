import { Tool, ToolContext, ToolResult } from "../types";
import { execGit, isGitRepo } from "../../git/execGit";

const MAX_COUNT = 100;

export const gitLogTool: Tool = {
  name: "git_log",
  description: "Show recent commit history via `git log --oneline`.",
  permission: "READ",
  inputSchema: {
    type: "object",
    properties: {
      count: { type: "number", description: "Number of commits to show. Default 10, max 100." },
    },
  },
  async execute(args, ctx: ToolContext): Promise<ToolResult> {
    if (!isGitRepo(ctx.workspaceRoot)) {
      return { ok: false, output: "", error: "Not a git repository." };
    }
    const rawCount = typeof args.count === "number" ? args.count : 10;
    const count = Math.max(1, Math.min(MAX_COUNT, Math.floor(rawCount)));

    const result = execGit(ctx.workspaceRoot, ["log", `-${count}`, "--oneline"]);
    if (!result.ok) {
      // A brand-new repo with no commits yet isn't really a failure worth surfacing as an error.
      if (/does not have any commits yet/i.test(result.stderr)) {
        return { ok: true, output: "(no commits yet)" };
      }
      return { ok: false, output: "", error: result.stderr || "git log failed." };
    }
    return { ok: true, output: result.stdout || "(no commits yet)" };
  },
};
