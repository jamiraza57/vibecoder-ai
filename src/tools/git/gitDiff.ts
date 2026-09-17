import { Tool, ToolContext, ToolResult } from "../types";
import { execGit, isGitRepo } from "../../git/execGit";

const MAX_DIFF_CHARS = 15_000;

export const gitDiffTool: Tool = {
  name: "git_diff",
  description: "Show a diff via `git diff`. By default shows unstaged changes; set staged: true for `git diff --staged`. Optionally scope to one path.",
  permission: "READ",
  inputSchema: {
    type: "object",
    properties: {
      staged: { type: "boolean", description: "Show staged changes instead of unstaged. Default false." },
      path: { type: "string", description: "Limit the diff to this path, relative to the workspace root." },
    },
  },
  async execute(args, ctx: ToolContext): Promise<ToolResult> {
    if (!isGitRepo(ctx.workspaceRoot)) {
      return { ok: false, output: "", error: "Not a git repository." };
    }
    const gitArgs = ["diff"];
    if (args.staged === true) gitArgs.push("--staged");
    if (typeof args.path === "string" && args.path) gitArgs.push("--", args.path);

    const result = execGit(ctx.workspaceRoot, gitArgs);
    if (!result.ok) {
      return { ok: false, output: "", error: result.stderr || "git diff failed." };
    }
    const output = result.stdout.length > MAX_DIFF_CHARS ? result.stdout.slice(0, MAX_DIFF_CHARS) + "\n...[diff truncated]" : result.stdout;
    return { ok: true, output: output || "(no differences)" };
  },
};
