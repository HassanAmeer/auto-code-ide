// @effect-diagnostics globalDateInEffect:off globalRandomInEffect:off nodeBuiltinImport:off globalTimers:off globalTimersInEffect:off preferSchemaOverJson:off globalDate:off globalFetchInEffect:off globalFetch:off globalConsoleInEffect:off
/**
 * Worktree Pool
 *
 * `git worktree add` checks out the whole project again — on a big repo that
 * is seconds of pure I/O before the worker can even start. The pool keeps a
 * few worktrees ready and reuses them:
 *
 *   acquire → (reset to main HEAD, clean, hand out)
 *   release → (reset to main HEAD, clean, park it for the next task)
 *
 * A parked worktree still holds every file on disk, so the next task starts
 * instantly instead of paying the checkout cost again.
 */
import * as NodeFS from "node:fs";
import * as NodePath from "node:path";
import * as NodeChildProcess from "node:child_process";
import { createWorkerWorktree, cleanupWorkerWorktree } from "./worktreeRunner.ts";
import { shq } from "./shellEscape.ts";

export interface PooledWorktree {
  worktreePath: string;
  branchName: string;
  isIsolated: boolean;
}

/** How many parked worktrees we keep per project. */
const MAX_IDLE_PER_PROJECT = Number(process.env.SUPER_AGENT_WORKTREE_POOL_SIZE || 4);

const idleByProject = new Map<string, PooledWorktree[]>();

function git(cwd: string, args: string): void {
  try {
    NodeChildProcess.execSync(`git ${args}`, { cwd, stdio: "ignore", timeout: 60_000 });
  } catch {}
}

/**
 * Bring a worktree back to the project HEAD and drop uncommitted changes so it
 * is a clean slate for the next worker.
 */
function resetWorktree(projectRoot: string, worktreePath: string): void {
  const head = (() => {
    try {
      return NodeChildProcess.execSync("git rev-parse HEAD", {
        cwd: projectRoot,
        encoding: "utf8",
        timeout: 15_000,
      }).trim();
    } catch {
      return "";
    }
  })();
  if (head) {
    git(worktreePath, `reset --hard ${shq(head)}`);
  }
  // Untracked leftovers go; ignored files (node_modules, caches) stay so the
  // next worker does not have to reinstall anything.
  git(worktreePath, "clean -fd");
}

/**
 * Take a worktree for a task — reuse a parked one when possible, otherwise
 * create a fresh isolated worktree.
 */
export function acquireWorktree(projectRoot: string, taskId: string): PooledWorktree {
  const parked = idleByProject.get(projectRoot);
  while (parked && parked.length > 0) {
    const candidate = parked.pop()!;
    if (!NodeFS.existsSync(candidate.worktreePath)) continue;
    resetWorktree(projectRoot, candidate.worktreePath);
    return candidate;
  }

  const allocation = createWorkerWorktree(projectRoot, taskId);
  return {
    worktreePath: allocation.worktreePath,
    branchName: allocation.branchName,
    isIsolated: allocation.isIsolated,
  };
}

/**
 * Give the worktree back. It is reset and parked for the next task instead of
 * being deleted, so the next dispatch skips the checkout cost.
 */
export function releaseWorktree(projectRoot: string, worktree: PooledWorktree): void {
  if (!worktree.isIsolated || worktree.worktreePath === projectRoot) return;
  try {
    if (!NodeFS.existsSync(worktree.worktreePath)) return;
    resetWorktree(projectRoot, worktree.worktreePath);
    const parked = idleByProject.get(projectRoot) ?? [];
    if (parked.length < MAX_IDLE_PER_PROJECT) {
      parked.push(worktree);
      idleByProject.set(projectRoot, parked);
      return;
    }
  } catch {}
  cleanupWorkerWorktree(projectRoot, worktree.worktreePath, worktree.branchName);
}

/**
 * Pre-create parked worktrees in the background so the first real task does
 * not pay the checkout cost either.
 */
export function prewarmWorktrees(projectRoot: string, count = MAX_IDLE_PER_PROJECT): void {
  const parked = idleByProject.get(projectRoot) ?? [];
  const missing = Math.max(0, count - parked.length);
  for (let i = 0; i < missing; i++) {
    try {
      const allocation = createWorkerWorktree(
        projectRoot,
        `pool-${Date.now().toString(36)}-${i}-${Math.random().toString(36).slice(2, 6)}`,
      );
      if (!allocation.isIsolated) continue;
      parked.push({
        worktreePath: allocation.worktreePath,
        branchName: allocation.branchName,
        isIsolated: true,
      });
    } catch {
      break;
    }
  }
  idleByProject.set(projectRoot, parked);
}

/** How many worktrees are parked for a project right now. */
export function getPoolStats(projectRoot?: string): { idle: number; size: number } {
  if (projectRoot) {
    return { idle: idleByProject.get(projectRoot)?.length ?? 0, size: MAX_IDLE_PER_PROJECT };
  }
  let idle = 0;
  for (const parked of idleByProject.values()) idle += parked.length;
  return { idle, size: MAX_IDLE_PER_PROJECT };
}

/** Drop every parked worktree (used when a project is deleted). */
export function clearWorktreePool(projectRoot: string): void {
  const parked = idleByProject.get(projectRoot);
  if (!parked) return;
  for (const wt of parked) {
    cleanupWorkerWorktree(projectRoot, wt.worktreePath, wt.branchName);
  }
  idleByProject.delete(projectRoot);
}
