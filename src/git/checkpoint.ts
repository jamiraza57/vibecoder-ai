import { execGit, isGitRepo } from "./execGit";

const CHECKPOINT_REF_PREFIX = "refs/vibecoder/checkpoints/";

export interface Checkpoint {
  /** Ref name, e.g. "refs/vibecoder/checkpoints/1234567890-before-login-fix". */
  ref: string;
  /** The human-facing part of the ref, e.g. "before-login-fix". */
  label: string;
  commitSha: string;
  createdAt: string;
  subject: string;
}

export class CheckpointError extends Error {}

function slugify(label: string): string {
  return (
    label
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 60) || "checkpoint"
  );
}

/**
 * Snapshots the current working tree + index (including untracked files, via
 * -u) as a git commit object under refs/vibecoder/checkpoints/, without
 * modifying the working tree, the index, HEAD, or the current branch in any
 * way. This is intentionally built on `git stash create` (which only
 * *builds* the commit object) plus `update-ref` (which only *points a ref* at
 * it) — never `git stash push`, which would alter the working tree.
 *
 * Returns null if there is nothing to checkpoint (clean tree, or not a repo).
 */
export function createCheckpoint(workspaceRoot: string, label: string): Checkpoint | null {
  if (!isGitRepo(workspaceRoot)) {
    throw new CheckpointError("Not a git repository — nothing to checkpoint.");
  }

  const headCheck = execGit(workspaceRoot, ["rev-parse", "HEAD"]);
  if (!headCheck.ok) {
    throw new CheckpointError("Repository has no commits yet — nothing to checkpoint against.");
  }

  const status = execGit(workspaceRoot, ["status", "--porcelain"]);
  if (status.stdout.trim() === "") {
    return null; // clean tree — no need for a checkpoint
  }

  const stashCreate = execGit(workspaceRoot, ["stash", "create", `vibecoder-checkpoint: ${label}`]);
  if (!stashCreate.ok || !stashCreate.stdout) {
    throw new CheckpointError(`Failed to snapshot working tree: ${stashCreate.stderr || "git stash create returned nothing"}`);
  }
  const commitSha = stashCreate.stdout.trim();

  const slug = slugify(label);
  const refName = `${CHECKPOINT_REF_PREFIX}${Date.now()}-${slug}`;
  const updateRef = execGit(workspaceRoot, ["update-ref", refName, commitSha]);
  if (!updateRef.ok) {
    throw new CheckpointError(`Failed to record checkpoint ref: ${updateRef.stderr}`);
  }

  const subjectResult = execGit(workspaceRoot, ["log", "-1", "--pretty=%s", commitSha]);

  return {
    ref: refName,
    label,
    commitSha,
    createdAt: new Date().toISOString(),
    subject: subjectResult.ok ? subjectResult.stdout : "",
  };
}

export function listCheckpoints(workspaceRoot: string): Checkpoint[] {
  if (!isGitRepo(workspaceRoot)) return [];

  const result = execGit(workspaceRoot, ["for-each-ref", "--sort=-creatordate", "--format=%(refname) %(objectname)", CHECKPOINT_REF_PREFIX]);
  if (!result.ok || !result.stdout) return [];

  return result.stdout
    .split("\n")
    .filter(Boolean)
    .map((line) => {
      const [ref, commitSha] = line.split(" ");
      const withoutPrefix = ref.slice(CHECKPOINT_REF_PREFIX.length);
      const dashIndex = withoutPrefix.indexOf("-");
      const timestamp = dashIndex === -1 ? withoutPrefix : withoutPrefix.slice(0, dashIndex);
      const label = dashIndex === -1 ? "" : withoutPrefix.slice(dashIndex + 1);
      const subjectResult = execGit(workspaceRoot, ["log", "-1", "--pretty=%s", commitSha]);
      return {
        ref,
        label,
        commitSha,
        createdAt: Number.isNaN(Number(timestamp)) ? "" : new Date(Number(timestamp)).toISOString(),
        subject: subjectResult.ok ? subjectResult.stdout : "",
      };
    });
}

/**
 * Restores a checkpoint by applying its stashed commit on top of the current
 * working tree (`git stash apply`), which merges rather than force-resets —
 * so it can produce conflicts if the tree has diverged further since the
 * checkpoint. It never deletes the checkpoint ref itself, so a checkpoint
 * can be applied more than once or inspected later with `git show`.
 */
export function revertToCheckpoint(workspaceRoot: string, ref: string): { ok: boolean; message: string } {
  if (!isGitRepo(workspaceRoot)) {
    throw new CheckpointError("Not a git repository.");
  }
  const refCheck = execGit(workspaceRoot, ["rev-parse", "--verify", "--quiet", ref]);
  if (!refCheck.ok) {
    throw new CheckpointError(`Unknown checkpoint ref: ${ref}`);
  }

  const apply = execGit(workspaceRoot, ["stash", "apply", refCheck.stdout]);
  if (!apply.ok) {
    return { ok: false, message: apply.stderr || apply.stdout || "git stash apply failed (likely a conflict with newer changes)." };
  }
  return { ok: true, message: apply.stdout || "Checkpoint applied to the working tree." };
}
