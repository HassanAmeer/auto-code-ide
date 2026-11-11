// @effect-diagnostics globalDateInEffect:off globalRandomInEffect:off nodeBuiltinImport:off globalTimers:off globalTimersInEffect:off preferSchemaOverJson:off globalDate:off globalFetchInEffect:off globalFetch:off globalConsoleInEffect:off globalConsole:off
import * as NodeFS from "node:fs";
import * as NodeOS from "node:os";
import * as NodePath from "node:path";
import { describe, it, expect, afterEach } from "vitest";

import {
  acquireWorktree,
  releaseWorktree,
  getPoolStats,
  clearWorktreePool,
} from "./worktreePool.ts";

const tempDirs: string[] = [];

function makeTempDir(): string {
  const dir = NodeFS.mkdtempSync(NodePath.join(NodeOS.tmpdir(), "wtpool-test-"));
  tempDirs.push(dir);
  return dir;
}

afterEach(() => {
  while (tempDirs.length > 0) {
    const dir = tempDirs.pop()!;
    NodeFS.rmSync(dir, { recursive: true, force: true });
  }
});

describe("worktree pool", () => {
  it("never throws for a directory that is not a git repo", () => {
    const dir = makeTempDir();
    const worktree = acquireWorktree(dir, "task-1");
    // Without git the runner falls back to the project root — the pool must
    // still hand out a usable worktree instead of throwing.
    expect(typeof worktree.worktreePath).toBe("string");
    expect(worktree.worktreePath.length).toBeGreaterThan(0);
    releaseWorktree(dir, worktree);
  });

  it("releasing a non-isolated worktree is a no-op", () => {
    const dir = makeTempDir();
    expect(() =>
      releaseWorktree(dir, { worktreePath: dir, branchName: "main", isIsolated: false }),
    ).not.toThrow();
  });

  it("reports pool size", () => {
    const stats = getPoolStats();
    expect(stats.size).toBeGreaterThan(0);
    expect(typeof stats.idle).toBe("number");
  });

  it("clearing an unknown project pool does not throw", () => {
    const dir = makeTempDir();
    expect(() => clearWorktreePool(dir)).not.toThrow();
  });
});
