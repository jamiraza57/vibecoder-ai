import { Tool, ToolContext, ToolResult } from "../types";
import { execGit, isGitRepo } from "../../git/execGit";

export const gitCheckoutTool: Tool = {
  name: "git_checkout",
  description:
    "Switch to a branch via `git checkout`, or create a new one with create: true. Refuses to run if the working tree has uncommitted changes, to avoid silently discarding or carrying over work — commit, stash, or checkpoint first.",
  permission: "WRITE",
  inputSchema: {
    type: "object",
    properties: {
      branch: { type: "string", description: "Branch name to switch to (or create)." },
      create: { type: "boolean", description: "Create the branch if it doesn't exist. Default false." },
    },
    required: ["branch"],
  },
  async execute(args, ctx: ToolContext): Promise<ToolResult> {
    if (!isGitRepo(ctx.workspaceRoot)) {
      return { ok: false, output: "", error: "Not a git repository." };
    }
    const branch = String(args.branch ?? "");
    if (!branch) {
      return { ok: false, output: "", error: "branch is required." };
    }

    const status = execGit(ctx.workspaceRoot, ["status", "--porcelain"]);
    if (status.stdout.trim() !== "") {
      return {
        ok: false,
        output: "",
        error:
          "Working tree has uncommitted changes; refusing to switch branches to avoid losing or carrying over work. Commit, stash, or create a checkpoint first.",
        meta: { dirty: true },
      };
    }

    if (!ctx.autoApprove.has("WRITE")) {
      const approved = await ctx.confirm(`Switch to branch "${branch}"${args.create ? " (creating it)" : ""}?`);
      if (!approved) {
        return { ok: false, output: "", error: "User declined branch switch." };
      }
    }

    const gitArgs = args.create === true ? ["checkout", "-b", branch] : ["checkout", branch];
    const result = execGit(ctx.workspaceRoot, gitArgs);
    return result.ok
      ? { ok: true, output: result.stdout || result.stderr || `Switched to ${branch}.` }
      : { ok: false, output: "", error: result.stderr || "git checkout failed." };
  },
};
