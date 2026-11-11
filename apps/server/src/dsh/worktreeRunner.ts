// @effect-diagnostics globalDateInEffect:off globalRandomInEffect:off nodeBuiltinImport:off globalTimers:off globalTimersInEffect:off preferSchemaOverJson:off globalDate:off globalFetchInEffect:off globalFetch:off globalConsoleInEffect:off
import * as NodeFS from "node:fs";
import * as NodePath from "node:path";
import * as NodeChildProcess from "node:child_process";
import { autoResolveMergeConflicts } from "./conflictResolver.ts";
import { shq } from "./shellEscape.ts";

export interface WorktreeAllocation {
  worktreePath: string;
  branchName: string;
  isIsolated: boolean;
  error?: string | undefined;
}

/**
 * Spawns an isolated Git Worktree on local disk for parallel worker tasks.
 */
export function createWorkerWorktree(projectRoot: string, taskId: string): WorktreeAllocation {
  try {
    // 1. Ensure projectRoot is a valid git repository
    const gitDir = NodePath.join(projectRoot, ".git");
    if (!NodeFS.existsSync(gitDir)) {
      try {
        NodeChildProcess.execSync(
          "git init && git add . && git commit -m 'chore: initial commit' --allow-empty",
          {
            cwd: projectRoot,
            stdio: "ignore",
          },
        );
      } catch {}
    }

    const branchName = `worker/task-${taskId}`;
    const worktreesDir = NodePath.join(projectRoot, ".worktrees");
    if (!NodeFS.existsSync(worktreesDir)) {
      NodeFS.mkdirSync(worktreesDir, { recursive: true });
    }

    const worktreePath = NodePath.join(worktreesDir, `worker-${taskId}`);

    // If leftover worktree path exists, clean it first
    if (NodeFS.existsSync(worktreePath)) {
      try {
        NodeChildProcess.execSync(`git worktree remove --force ${shq(worktreePath)}`, {
          cwd: projectRoot,
          stdio: "ignore",
        });
      } catch {
        NodeFS.rmSync(worktreePath, { recursive: true, force: true });
      }
    }

    // Spawn isolated git worktree tracking current HEAD
    NodeChildProcess.execSync(`git worktree add -b ${shq(branchName)} ${shq(worktreePath)} HEAD`, {
      cwd: projectRoot,
      stdio: "ignore",
    });

    return {
      worktreePath,
      branchName,
      isIsolated: true,
    };
  } catch (err: any) {
    // Fallback: If worktree cannot be allocated (e.g. bare disk lock), run directly in projectRoot safely
    return {
      worktreePath: projectRoot,
      branchName: "main",
      isIsolated: false,
      error: err?.message || String(err),
    };
  }
}

/**
 * Captures Git diff of files modified by worker inside the worktree
 */
export function getWorktreeDiff(worktreePath: string): string {
  try {
    const diff = NodeChildProcess.execSync("git diff HEAD", {
      cwd: worktreePath,
      encoding: "utf8",
    });
    return diff || "";
  } catch {
    return "";
  }
}

/**
 * Safely commits all changes inside worktree and merges back to main branch
 */
export function mergeWorkerWorktree(
  projectRoot: string,
  worktreePath: string,
  branchName: string,
  taskTitle: string,
): {
  ok: boolean;
  error?: string | undefined;
  autoHealed?: boolean | undefined;
  resolvedFiles?: string[] | undefined;
} {
  try {
    if (worktreePath === projectRoot || branchName === "main") {
      return { ok: true };
    }

    // 1. Stage and commit changes in worktree
    NodeChildProcess.execSync(
      `git add . && git commit -m ${shq(`feat(worker): ${taskTitle.slice(0, 50)}`)} --allow-empty`,
      { cwd: worktreePath, stdio: "ignore" },
    );

    // 2. Safe merge into main projectRoot with automated conflict auto-resolver
    try {
      NodeChildProcess.execSync(
        `git merge ${shq(branchName)} --no-edit -m ${shq(`merge: ${taskTitle.slice(0, 50)}`)}`,
        {
          cwd: projectRoot,
          stdio: "ignore",
        },
      );
      return { ok: true };
    } catch (mergeErr: any) {
      // Minor or overlapping conflict detected between parallel subagents!
      // Trigger automated self-healing review & conflict resolver loop
      const resolution = autoResolveMergeConflicts(projectRoot, branchName, taskTitle);
      if (resolution.ok) {
        return {
          ok: true,
          autoHealed: true,
          resolvedFiles: resolution.resolvedFiles,
        };
      }
      return {
        ok: false,
        error: `Merge conflict encountered and could not be auto-healed: ${resolution.error || mergeErr?.message || String(mergeErr)}`,
      };
    }
  } catch (err: any) {
    return { ok: false, error: err?.message || String(err) };
  }
}

/**
 * Cleans up worktree directory and branch after successful merge
 */
export function cleanupWorkerWorktree(
  projectRoot: string,
  worktreePath: string,
  branchName: string,
): void {
  try {
    if (worktreePath === projectRoot || branchName === "main") return;

    try {
      NodeChildProcess.execSync(`git worktree remove --force ${shq(worktreePath)}`, {
        cwd: projectRoot,
        stdio: "ignore",
      });
    } catch {
      if (NodeFS.existsSync(worktreePath)) {
        NodeFS.rmSync(worktreePath, { recursive: true, force: true });
      }
    }

    try {
      NodeChildProcess.execSync(`git branch -D ${shq(branchName)}`, {
        cwd: projectRoot,
        stdio: "ignore",
      });
    } catch {}
  } catch {}
}

export * from "./workerRegistry.ts";
