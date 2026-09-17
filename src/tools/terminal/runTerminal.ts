import { spawn } from "node:child_process";
import { Tool, ToolContext, ToolResult } from "../types";
import { classifyCommand } from "./classify";
import { redactSecrets } from "../pathSafety";

const DEFAULT_TIMEOUT_MS = 60_000;
const MAX_OUTPUT_CHARS = 20_000;

function truncate(s: string): string {
  return s.length > MAX_OUTPUT_CHARS ? s.slice(0, MAX_OUTPUT_CHARS) + "\n...[truncated]" : s;
}

export const runTerminalTool: Tool = {
  name: "run_terminal",
  description:
    "Run a shell command in the workspace directory and return its stdout, stderr, and exit code. Commands are classified as SAFE, MODIFYING, or DANGEROUS; DANGEROUS commands require explicit user confirmation before running.",
  permission: "EXECUTE",
  inputSchema: {
    type: "object",
    properties: {
      command: { type: "string", description: "The shell command to execute." },
      timeout_ms: { type: "number", description: "Timeout in milliseconds. Defaults to 60000." },
    },
    required: ["command"],
  },
  async execute(args, ctx: ToolContext): Promise<ToolResult> {
    const command = String(args.command ?? "");
    const timeoutMs = typeof args.timeout_ms === "number" ? args.timeout_ms : DEFAULT_TIMEOUT_MS;

    if (!command.trim()) {
      return { ok: false, output: "", error: "Empty command." };
    }

    const risk = classifyCommand(command);

    if (risk === "DANGEROUS" && !ctx.autoApprove.has("DESTRUCTIVE")) {
      const approved = await ctx.confirm(`Run DANGEROUS command: \`${command}\`? This may be destructive.`);
      if (!approved) {
        return { ok: false, output: "", error: "User declined to run a dangerous command.", meta: { risk } };
      }
    }
    if (risk === "MODIFYING" && !ctx.autoApprove.has("EXECUTE") && !ctx.autoApprove.has("DESTRUCTIVE")) {
      const approved = await ctx.confirm(`Run command: \`${command}\`? (modifies the project — installs/writes/git state)`);
      if (!approved) {
        return { ok: false, output: "", error: "User declined to run this command.", meta: { risk } };
      }
    }

    return new Promise<ToolResult>((resolve) => {
      const child = spawn(command, {
        cwd: ctx.workspaceRoot,
        shell: true,
        env: { ...process.env },
      });

      let stdout = "";
      let stderr = "";
      let timedOut = false;

      const timer = setTimeout(() => {
        timedOut = true;
        child.kill("SIGKILL");
      }, timeoutMs);

      child.stdout?.on("data", (d) => (stdout += d.toString()));
      child.stderr?.on("data", (d) => (stderr += d.toString()));

      child.on("close", (code) => {
        clearTimeout(timer);
        const output = truncate(redactSecrets(stdout));
        const errOutput = truncate(redactSecrets(stderr));
        if (timedOut) {
          resolve({
            ok: false,
            output,
            error: `Command timed out after ${timeoutMs}ms and was killed.`,
            meta: { risk, exitCode: code },
          });
          return;
        }
        resolve({
          ok: code === 0,
          output: [output, errOutput ? `--- stderr ---\n${errOutput}` : ""].filter(Boolean).join("\n"),
          error: code === 0 ? undefined : `Exited with code ${code}.`,
          meta: { risk, exitCode: code },
        });
      });

      child.on("error", (err) => {
        clearTimeout(timer);
        resolve({ ok: false, output: "", error: err.message, meta: { risk } });
      });
    });
  },
};
