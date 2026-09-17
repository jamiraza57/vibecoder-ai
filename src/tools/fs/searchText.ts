import * as fs from "node:fs/promises";
import * as path from "node:path";
import { Tool, ToolContext, ToolResult } from "../types";
import { resolveSafePath } from "../pathSafety";

const IGNORED_DIRS = new Set([".git", "node_modules", "dist", "build", ".next", "__pycache__", ".venv"]);
const MAX_MATCHES = 200;
const MAX_FILE_SIZE = 2_000_000; // 2MB — skip huge/binary-ish files

async function* walk(dir: string): AsyncGenerator<string> {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    if (IGNORED_DIRS.has(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      yield* walk(full);
    } else if (entry.isFile()) {
      yield full;
    }
  }
}

export const searchTextTool: Tool = {
  name: "search_text",
  description: "Recursively search files in the workspace for a regular expression, returning matching file paths and line numbers. Skips .git, node_modules, dist, build and similar.",
  permission: "READ",
  inputSchema: {
    type: "object",
    properties: {
      pattern: { type: "string", description: "Regular expression (JavaScript flavor) to search for." },
      path: { type: "string", description: "Subdirectory to search, relative to the workspace root. Defaults to the whole workspace." },
      flags: { type: "string", description: "Optional regex flags, e.g. 'i' for case-insensitive." },
    },
    required: ["pattern"],
  },
  async execute(args, ctx: ToolContext): Promise<ToolResult> {
    const pattern = String(args.pattern ?? "");
    const relPath = String(args.path ?? ".");
    const flags = typeof args.flags === "string" ? args.flags : "";
    let regex: RegExp;
    try {
      regex = new RegExp(pattern, flags);
    } catch (err) {
      return { ok: false, output: "", error: `Invalid regex: ${(err as Error).message}` };
    }

    try {
      const abs = resolveSafePath(ctx.workspaceRoot, relPath);
      const matches: string[] = [];

      for await (const file of walk(abs)) {
        if (matches.length >= MAX_MATCHES) break;
        try {
          const stat = await fs.stat(file);
          if (stat.size > MAX_FILE_SIZE) continue;
          const content = await fs.readFile(file, "utf-8");
          const lines = content.split("\n");
          for (let i = 0; i < lines.length; i++) {
            if (regex.test(lines[i])) {
              const rel = path.relative(ctx.workspaceRoot, file);
              matches.push(`${rel}:${i + 1}: ${lines[i].trim().slice(0, 200)}`);
              if (matches.length >= MAX_MATCHES) break;
            }
            regex.lastIndex = 0; // reset for global flags
          }
        } catch {
          // Skip unreadable/binary files.
          continue;
        }
      }

      return {
        ok: true,
        output: matches.length ? matches.join("\n") : "No matches.",
        meta: { truncated: matches.length >= MAX_MATCHES },
      };
    } catch (err) {
      return { ok: false, output: "", error: (err as Error).message };
    }
  },
};
