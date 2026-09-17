import { Tool, ToolContext, ToolResult } from "../types";
import { execGit, isGitRepo } from "../../git/execGit";

export const gitCommitTool: Tool = {
  name: "git_commit",
  description:
    "Stage the given paths (or all modified/new tracked-and-untracked files if paths is omitted) and create a commit. Never amends or rewrites existing history.",
  permission: "WRITE",
  inputSchema: {
    type: "object",
    properties: {
      message: { type: "string", description: "Commit message. Required." },
      paths: {
        type: "array",
        items: { type: "string" },
        description: "Specific paths to stage, relative to the workspace root. Omit to stage everything (`git add -A`).",
      },
    },
    required: ["message"],
  },
  async execute(args, ctx: ToolContext): Promise<ToolResult> {
    if (!isGitRepo(ctx.workspaceRoot)) {
      return { ok: false, output: "", error: "Not a git repository." };
    }
    const message = String(args.message ?? "").trim();
    if (!message) {
      return { ok: false, output: "", error: "A non-empty commit message is required." };
    }
    const paths = Array.isArray(args.paths) ? args.paths.map(String) : null;

    if (!ctx.autoApprove.has("WRITE")) {
      const scope = paths && paths.length ? paths.join(", ") : "all changes";
      const approved = await ctx.confirm(`Commit ${scope} with message "${message}"?`);
      if (!approved) {
        return { ok: false, output: "", error: "User declined the commit." };
      }
    }

    const add = execGit(ctx.workspaceRoot, paths && paths.length ? ["add", "--", ...paths] : ["add", "-A"]);
    if (!add.ok) {
      return { ok: false, output: "", error: `Failed to stage changes: ${add.stderr}` };
    }

    const diffCheck = execGit(ctx.workspaceRoot, ["diff", "--cached", "--quiet"]);
    if (diffCheck.ok) {
      // Exit code 0 from `diff --cached --quiet` means nothing is staged.
      return { ok: false, output: "", error: "Nothing to commit — no staged changes after `git add`." };
    }

    const commit = execGit(ctx.workspaceRoot, ["commit", "-m", message]);
    return commit.ok
      ? { ok: true, output: commit.stdout }
      : { ok: false, output: "", error: commit.stderr || "git commit failed." };
  },
};
