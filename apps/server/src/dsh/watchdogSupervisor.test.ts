// @effect-diagnostics globalDateInEffect:off globalRandomInEffect:off nodeBuiltinImport:off globalTimers:off globalTimersInEffect:off preferSchemaOverJson:off globalDate:off globalFetchInEffect:off globalFetch:off globalConsoleInEffect:off globalConsole:off
import * as NodeFS from "node:fs";
import * as NodeOS from "node:os";
import * as NodePath from "node:path";
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

/**
 * The cancel path is the one thing that must never be guessed at: a stopped
 * watchdog has to abort its workers, skip review/merge/build/test entirely,
 * hand every worktree back to the pool, and leave nothing behind in the abort
 * registry. None of that can be observed without stubbing the two side-effect
 * boundaries, so this file stubs the model bridge and the worktree pool.
 */
const harness = vi.hoisted(() => {
  const acquired: Array<{ worktreePath: string; branchName: string; isIsolated: boolean }> = [];
  const released: string[] = [];
  const modelCalls: string[] = [];
  return { acquired, released, modelCalls };
});

vi.mock("./opencodeBridge.ts", () => ({
  executeOpenCodeTask: async (opts: {
    taskTitle: string;
    abortCheck?: (() => boolean) | undefined;
  }) => {
    harness.modelCalls.push(opts.taskTitle);
    // Block like a real model call does, but bail out the moment the watchdog
    // aborts this worker — exactly the cooperative contract the bridge has.
    for (let i = 0; i < 400; i++) {
      if (opts.abortCheck?.()) {
        return {
          ok: false,
          filesModified: [],
          outputSummary: "Task aborted by user — execution stopped before completion.",
          error: "Aborted by user",
        };
      }
      await new Promise((resolve) => setTimeout(resolve, 5));
    }
    return { ok: true, filesModified: ["src/x.ts"], outputSummary: "done" };
  },
}));

vi.mock("./worktreeRunner.ts", () => ({
  createWorkerWorktree: (_projectRoot: string, taskId: string) => ({
    worktreePath: `/tmp/watchdog-wt/${taskId}`,
    branchName: `worker/task-${taskId}`,
    isIsolated: true,
  }),
  mergeWorkerWorktree: () => ({ ok: true }),
  cleanupWorkerWorktree: () => {},
  getWorktreeDiff: () => "",
}));

vi.mock("./worktreePool.ts", () => ({
  prewarmWorktrees: () => {},
  acquireWorktree: (_projectRoot: string, taskId: string) => {
    const worktree = {
      worktreePath: `/tmp/watchdog-wt/${taskId}`,
      branchName: `worker/task-${taskId}`,
      isIsolated: true,
    };
    harness.acquired.push(worktree);
    return worktree;
  },
  releaseWorktree: (_projectRoot: string, worktree: { worktreePath: string }) => {
    harness.released.push(worktree.worktreePath);
  },
  getPoolStats: () => ({ idle: 0, size: 4 }),
  clearWorktreePool: () => {},
}));

import {
  auditRequirementChecklist,
  detectPackageManager,
  requiresBuild,
  reviewWorkerOutput,
  listChangedFiles,
  getWatchdogSnapshot,
  startWatchdogSupervision,
  stopWatchdog,
  stopAllWatchdogs,
  isWatchdogStatusTerminal,
  resolveFallbackModel,
  resolveWorkerLaneModels,
  WATCHDOG_FALLBACK_MODELS,
} from "./watchdogSupervisor.ts";
import { isWorkerAborted } from "./abortRegistry.ts";

function makeProject(files: Record<string, string>): string {
  const dir = NodeFS.mkdtempSync(NodePath.join(NodeOS.tmpdir(), "watchdog-test-"));
  for (const [name, content] of Object.entries(files)) {
    const full = NodePath.join(dir, name);
    NodeFS.mkdirSync(NodePath.dirname(full), { recursive: true });
    NodeFS.writeFileSync(full, content, "utf8");
  }
  return dir;
}

describe("watchdog build/test decision", () => {
  let projectRoot: string;

  beforeEach(() => {
    projectRoot = makeProject({
      "package.json": JSON.stringify({
        name: "demo",
        scripts: { build: "echo build", test: "echo test" },
      }),
    });
  });

  afterEach(() => {
    NodeFS.rmSync(projectRoot, { recursive: true, force: true });
  });

  it("detects the package manager from the lockfile", () => {
    expect(detectPackageManager(projectRoot)).toBe("npm");
    NodeFS.writeFileSync(NodePath.join(projectRoot, "pnpm-lock.yaml"), "lockfileVersion: 9\n");
    expect(detectPackageManager(projectRoot)).toBe("pnpm");
  });

  it("requires a build when source or build config changed", () => {
    expect(requiresBuild(["src/app.tsx"], projectRoot)).toBe(true);
    expect(requiresBuild(["package.json"], projectRoot)).toBe(true);
    expect(requiresBuild(["vite.config.ts"], projectRoot)).toBe(true);
  });

  it("skips the build for docs and css-only changes", () => {
    expect(requiresBuild(["README.md"], projectRoot)).toBe(false);
    expect(requiresBuild(["styles/theme.css"], projectRoot)).toBe(false);
    expect(requiresBuild([], projectRoot)).toBe(false);
  });

  it("never builds a project without a build script", () => {
    const noBuild = makeProject({ "package.json": JSON.stringify({ name: "x" }) });
    expect(requiresBuild(["src/app.tsx"], noBuild)).toBe(false);
    NodeFS.rmSync(noBuild, { recursive: true, force: true });
  });
});

describe("watchdog worker review", () => {
  let projectRoot: string;

  beforeEach(() => {
    projectRoot = makeProject({
      "index.html": "<!DOCTYPE html>\n<html><body><h1>ok</h1></body></html>",
      "empty.ts": "",
      "todo.ts": "// TODO: finish this\n",
      "broken.html": "<html><body>no doctype",
    });
  });

  afterEach(() => {
    NodeFS.rmSync(projectRoot, { recursive: true, force: true });
  });

  it("flags empty files, placeholders and missing doctype", () => {
    const issues = reviewWorkerOutput(
      ["index.html", "empty.ts", "todo.ts", "broken.html"],
      projectRoot,
    );
    expect(issues.some((i) => i.includes("empty.ts") && i.includes("empty"))).toBe(true);
    expect(issues.some((i) => i.includes("todo.ts") && i.includes("TODO"))).toBe(true);
    expect(issues.some((i) => i.includes("broken.html") && i.includes("DOCTYPE"))).toBe(true);
    expect(issues.some((i) => i.includes("index.html"))).toBe(false);
  });

  it("reports no issues for a clean file", () => {
    expect(reviewWorkerOutput(["index.html"], projectRoot)).toEqual([]);
  });

  it("lists changed files only inside a git repo", () => {
    // Not a git repo — the helper must not throw, it returns an empty list.
    expect(listChangedFiles(projectRoot)).toEqual([]);
  });
});

describe("watchdog self-healing ladder", () => {
  it("falls back to the next model in the ladder", () => {
    expect(resolveFallbackModel(WATCHDOG_FALLBACK_MODELS[0]!)).toBe(WATCHDOG_FALLBACK_MODELS[1]!);
  });

  it("uses the first model when the current one is unknown", () => {
    expect(resolveFallbackModel("some-unknown-model")).toBe(WATCHDOG_FALLBACK_MODELS[0]);
  });

  it("returns undefined at the end of the ladder", () => {
    const last = WATCHDOG_FALLBACK_MODELS[WATCHDOG_FALLBACK_MODELS.length - 1]!;
    expect(resolveFallbackModel(last)).toBeUndefined();
  });
});

describe("watchdog model lanes", () => {
  it("gives the first worker the requested model", () => {
    const lanes = resolveWorkerLaneModels("my-model", 3);
    expect(lanes[0]).toBe("my-model");
    expect(lanes.length).toBe(3);
  });

  it("spreads the remaining workers over different models", () => {
    const lanes = resolveWorkerLaneModels("my-model", 3);
    expect(new Set(lanes).size).toBeGreaterThan(1);
  });

  it("always returns at least one lane", () => {
    expect(resolveWorkerLaneModels("my-model", 0).length).toBe(1);
  });
});

describe("requirement checklist audit", () => {
  it("marks a requirement as passed when the diff mentions it", () => {
    const checklist = [
      { id: "req-1", requirement: "build the table booking form", status: "pending" as const },
    ];
    const result = auditRequirementChecklist(
      checklist,
      "diff --git a/BookingForm.tsx\n+export function BookingForm() {}",
    );
    expect(result.passed).toBe(1);
    expect(result.missing).toEqual([]);
    expect(checklist[0]?.status).toBe("passed");
  });

  it("flags a requirement that never appears in the diff", () => {
    const checklist = [
      { id: "req-1", requirement: "implement the payment gateway", status: "pending" as const },
    ];
    const result = auditRequirementChecklist(
      checklist,
      "diff --git a/menu.tsx\n+export const menu = [];",
    );
    expect(result.passed).toBe(0);
    expect(result.missing.length).toBe(1);
    expect(checklist[0]?.status).toBe("missing");
  });
});

describe("watchdog snapshot", () => {
  it("returns an empty snapshot when nothing is running", () => {
    const snapshot = getWatchdogSnapshot();
    expect(snapshot.ok).toBe(true);
    expect(Array.isArray(snapshot.watchdogs)).toBe(true);
    expect(snapshot.active).toBe(0);
  });

  it("does not stop an unknown watchdog", () => {
    expect(stopWatchdog("watchdog-does-not-exist")).toBe(false);
  });

  it("stopAllWatchdogs reports zero when nothing is supervising", () => {
    // No live watchdog in this test process — the Stop All path must not throw
    // and must report a real count.
    const result = stopAllWatchdogs();
    expect(typeof result.stoppedWatchdogs).toBe("number");
    expect(result.stoppedWatchdogs).toBe(0);
  });

  it("treats completed, failed and cancelled as terminal", () => {
    expect(isWatchdogStatusTerminal("completed")).toBe(true);
    expect(isWatchdogStatusTerminal("failed")).toBe(true);
    expect(isWatchdogStatusTerminal("cancelled")).toBe(true);
    // A live phase is never terminal — the card keeps polling it.
    expect(isWatchdogStatusTerminal("watching")).toBe(false);
    expect(isWatchdogStatusTerminal("reviewing")).toBe(false);
    expect(isWatchdogStatusTerminal("building")).toBe(false);
    expect(isWatchdogStatusTerminal("testing")).toBe(false);
  });
});

describe("watchdog cancel path", () => {
  beforeEach(() => {
    harness.acquired.length = 0;
    harness.released.length = 0;
    harness.modelCalls.length = 0;
  });

  /**
   * A stop that lands mid-run must end the run cooperatively: workers abort,
   * nothing is reviewed/merged/built/tested, and the pool gets its worktrees
   * back. Before the pool release was added, every cancelled task leaked one
   * worktree (and one git branch) for the lifetime of the process.
   */
  it("aborts workers, skips merge, and releases every worktree when stopped", async () => {
    const projectRoot = makeProject({
      "package.json": JSON.stringify({ name: "demo", scripts: { test: "echo test" } }),
    });

    const run = startWatchdogSupervision({
      projectId: "p1",
      projectName: "demo",
      projectRoot,
      taskTitle: "Add booking form",
      // Two explicit bullets → two workers, so the pool has more than one
      // allocation to hand back.
      prompt: ["- build the booking form", "- add the API route"].join("\n"),
      model: "test-model",
    });

    // Let the supervisor reach the dispatch loop, then stop it like the UI does.
    await new Promise((resolve) => setTimeout(resolve, 30));
    const snapshot = getWatchdogSnapshot({ projectId: "p1" });
    const live = snapshot.watchdogs.find((w) => w.status !== "cancelled");
    expect(live).toBeDefined();
    expect(stopWatchdog(live!.id)).toBe(true);

    const result = await run;

    expect(result.status).toBe("cancelled");
    expect(result.ok).toBe(false);
    expect(result.verdict).toContain("stopped by user");
    // Every worker row is cancelled, none completed.
    expect(result.workersCompleted).toBe(0);
    expect(result.workersTotal).toBeGreaterThan(0);
    // Nothing was merged, so no build/test issue was reported for it.
    expect(result.issues.some((i) => i.includes("Merge failed"))).toBe(false);
    // Every allocation came back to the pool.
    expect(harness.acquired.length).toBeGreaterThan(0);
    expect(harness.released.length).toBe(harness.acquired.length);
  });

  it("clears every abort flag of its workers when the run ends", async () => {
    const projectRoot = makeProject({
      "package.json": JSON.stringify({ name: "demo", scripts: { test: "echo test" } }),
    });

    const run = startWatchdogSupervision({
      projectId: "p2",
      projectName: "demo",
      projectRoot,
      taskTitle: "Add search",
      prompt: ["- add the search box", "- wire the results list"].join("\n"),
      model: "test-model",
    });
    await new Promise((resolve) => setTimeout(resolve, 20));
    const snapshot = getWatchdogSnapshot({ projectId: "p2" });
    const live = snapshot.watchdogs.find((w) => w.status !== "cancelled");
    expect(live).toBeDefined();
    const workerIds = live!.workers.map((w) => w.id);
    expect(workerIds.length).toBeGreaterThan(0);
    stopWatchdog(live!.id);

    const result = await run;
    expect(result.status).toBe("cancelled");
    // A leaked flag would make the NEXT run with the same id abort instantly.
    for (const id of workerIds) {
      expect(isWorkerAborted(id)).toBe(false);
    }
  });

  it("does not resurrect a stopped watchdog's phase", async () => {
    const projectRoot = makeProject({
      "package.json": JSON.stringify({ name: "demo", scripts: { test: "echo test" } }),
    });

    const run = startWatchdogSupervision({
      projectId: "p3",
      projectName: "demo",
      projectRoot,
      taskTitle: "Add filters",
      prompt: ["- add the filter bar", "- persist the selection"].join("\n"),
      model: "test-model",
    });
    await new Promise((resolve) => setTimeout(resolve, 20));
    const live = getWatchdogSnapshot({ projectId: "p3" }).watchdogs.find(
      (w) => w.status !== "cancelled",
    );
    expect(live).toBeDefined();
    stopWatchdog(live!.id);

    const result = await run;
    // The final status must be the cancelled stop, never a later phase.
    expect(result.status).toBe("cancelled");
    const after = getWatchdogSnapshot({ projectId: "p3" }).watchdogs.find((w) => w.id === live!.id);
    expect(after?.status).toBe("cancelled");
  });
});
