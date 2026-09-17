/**
 * Formal tool contract. Every tool the agent can call implements this.
 * Permission levels gate execution: EXECUTE/DESTRUCTIVE calls go through
 * ToolContext.confirm() unless the run was started with autoApprove for that level.
 */
export type Permission = "READ" | "WRITE" | "EXECUTE" | "NETWORK" | "DESTRUCTIVE";

export interface ToolResult {
  ok: boolean;
  output: string;
  error?: string;
  /** Structured metadata a caller (e.g. the agent loop) may want, kept out of `output` to avoid bloating model context. */
  meta?: Record<string, unknown>;
}

export interface ToolContext {
  /** Absolute, resolved workspace root. All filesystem tools are jailed to this directory. */
  workspaceRoot: string;
  /** Ask the human operator for approval before a DESTRUCTIVE or dangerous EXECUTE action runs. */
  confirm: (message: string) => Promise<boolean>;
  /** Permission levels the user has pre-approved for this run ("allow for session" / "always allow"). */
  autoApprove: Set<Permission>;
}

export interface Tool {
  name: string;
  description: string;
  /** JSON Schema for the tool's input, sent to the model as its tool-use schema. */
  inputSchema: Record<string, unknown>;
  permission: Permission;
  execute(args: Record<string, unknown>, ctx: ToolContext): Promise<ToolResult>;
}

export class ToolExecutionError extends Error {
  constructor(message: string, public readonly cause?: unknown) {
    super(message);
    this.name = "ToolExecutionError";
  }
}
