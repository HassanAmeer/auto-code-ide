// @effect-diagnostics globalDateInEffect:off globalRandomInEffect:off nodeBuiltinImport:off globalTimers:off globalTimersInEffect:off preferSchemaOverJson:off globalDate:off globalFetchInEffect:off globalFetch:off globalConsoleInEffect:off
/**
 * Watchdog Supervisor
 *
 * The Watchdog is the card the user watches. It sits ABOVE the workers:
 *
 *   Manager (Super Agent)
 *        │  every task goes under the watchdog
 *        ▼
 *   WATCHDOG  ← watches every sub-agent, assigns related work to the right
 *              sub-agent, and reviews each sub-agent's output when it
 *              completes (review → build if needed → test)
 *        │
 *        ▼
 *   Worker Sub-Agents (parallel, isolated worktrees)
 *
 * Rules:
 *   - A related task always goes to the sub-agent whose role matches it.
 *   - When a sub-agent finishes, the watchdog reviews its changed files.
 *   - Build runs only when the change can break the build (package.json,
 *     build config, or source files with a build script). Otherwise the
 *     watchdog only runs the test suite.
 *   - The Manager only ever sees the watchdog's final verdict.
 */
import * as NodeFS from "node:fs";
import * as NodePath from "node:path";
import * as NodeChildProcess from "node:child_process";
import { decomposeTask } from "./taskDecomposer.ts";
import type { SubtaskPlanItem } from "./types.ts";
import {
  createWorkerWorktree,
  mergeWorkerWorktree,
  cleanupWorkerWorktree,
  getWorktreeDiff,
} from "./worktreeRunner.ts";
import { executeOpenCodeTask } from "./opencodeBridge.ts";
import {
  deriveSpecialistRole,
  registerWorkerTelemetry,
  updateWorkerTelemetryStatus,
} from "./workerRegistry.ts";

export type WatchdogStatus =
  | "watching"
  | "reviewing"
  | "building"
  | "testing"
  | "completed"
  | "failed";

export interface WatchdogWorkerRow {
  id: string;
  role: string;
  goal: string;
  status: "running" | "completed" | "failed";
  filesChanged: number;
  reviewNotes: string[];
  buildRan: boolean;
  buildPassed: boolean | undefined;
  testRan: boolean;
  testPassed: boolean | undefined;
}

export interface WatchdogState {
  id: string;
  status: WatchdogStatus;
  projectId: string;
  projectName: string;
  taskTitle: string;
  lastAction: string;
  workers: WatchdogWorkerRow[];
  issues: string[];
  /** How many times the watchdog recovered itself (model retry / repair agent). */
  recoveries: number;
  startedAt: number;
  updatedAt: number;
  completedAt: number | undefined;
  verdict: string;
}

const watchdogs = new Map<string, WatchdogState>();

function now(): number {
  return Date.now();
}

/** Live snapshot for the UI watchdog card. */
export function getWatchdogSnapshot(filter?: {
  projectName?: string | undefined;
  projectId?: string | undefined;
}): { ok: boolean; watchdogs: WatchdogState[]; active: number; timestamp: number } {
  let list = Array.from(watchdogs.values());
  if (filter?.projectName && filter.projectName !== "all" && filter.projectName !== "Workspace") {
    const needle = filter.projectName.toLowerCase();
    list = list.filter((w) => w.projectName.toLowerCase().includes(needle));
  }
  if (filter?.projectId) {
    list = list.filter((w) => w.projectId === filter.projectId);
  }
  list.sort((a, b) => b.startedAt - a.startedAt);
  return {
    ok: true,
    watchdogs: list,
    active: list.filter((w) => w.status !== "completed" && w.status !== "failed").length,
    timestamp: now(),
  };
}

export function stopWatchdog(id: string): boolean {
  const existing = watchdogs.get(id);
  if (!existing) return false;
  existing.status = "failed";
  existing.lastAction = "Stopped by user";
  existing.completedAt = now();
  existing.updatedAt = now();
  return true;
}

/* ───────────────────────── build & test helpers ───────────────────────── */

export type PackageManager = "pnpm" | "yarn" | "npm";

export function detectPackageManager(cwd: string): PackageManager {
  try {
    if (NodeFS.existsSync(NodePath.join(cwd, "pnpm-lock.yaml"))) return "pnpm";
    if (NodeFS.existsSync(NodePath.join(cwd, "yarn.lock"))) return "yarn";
  } catch {}
  return "npm";
}

interface ProjectScripts {
  build: string | undefined;
  test: string | undefined;
}

function readProjectScripts(cwd: string): ProjectScripts {
  try {
    const pkgPath = NodePath.join(cwd, "package.json");
    if (!NodeFS.existsSync(pkgPath)) return { build: undefined, test: undefined };
    const pkg = JSON.parse(NodeFS.readFileSync(pkgPath, "utf8"));
    return {
      build: typeof pkg.scripts?.build === "string" ? pkg.scripts.build : undefined,
      test: typeof pkg.scripts?.test === "string" ? pkg.scripts.test : undefined,
    };
  } catch {
    return { build: undefined, test: undefined };
  }
}

const BUILD_CRITICAL_FILES = [
  "package.json",
  "pnpm-lock.yaml",
  "package-lock.json",
  "yarn.lock",
  "tsconfig.json",
  "vite.config.ts",
  "vite.config.js",
  "tailwind.config.ts",
  "tailwind.config.js",
];

const SOURCE_EXTENSIONS = [".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs", ".vue", ".svelte"];

/**
 * A build only matters when the change can break it. UI-only, docs, or
 * markdown changes skip the build and go straight to the test suite.
 */
export function requiresBuild(changedFiles: ReadonlyArray<string>, cwd: string): boolean {
  if (changedFiles.length === 0) return false;
  const scripts = readProjectScripts(cwd);
  if (!scripts.build) return false;
  for (const file of changedFiles) {
    const base = NodePath.basename(file);
    if (BUILD_CRITICAL_FILES.includes(base)) return true;
    const ext = NodePath.extname(file);
    if (SOURCE_EXTENSIONS.includes(ext)) return true;
  }
  return false;
}

/** Files the worker actually touched (git-aware, not a full glob). */
export function listChangedFiles(worktreePath: string): string[] {
  try {
    const out = NodeChildProcess.execSync("git status --porcelain", {
      cwd: worktreePath,
      encoding: "utf8",
      timeout: 10_000,
    });
    return out
      .split("\n")
      .map((line) => line.slice(3).trim())
      .filter((line) => line.length > 0);
  } catch {
    return [];
  }
}

/**
 * Cheap static review of a worker's output. Catches the failures a build
 * would not flag: placeholder code, empty files, unclosed HTML tags.
 */
export function reviewWorkerOutput(
  changedFiles: ReadonlyArray<string>,
  worktreePath: string,
): string[] {
  const issues: string[] = [];
  for (const file of changedFiles) {
    const full = NodePath.join(worktreePath, file);
    try {
      if (!NodeFS.existsSync(full)) {
        issues.push(`${file}: file missing after worker run`);
        continue;
      }
      const stat = NodeFS.statSync(full);
      if (!stat.isFile()) continue;
      if (stat.size === 0) {
        issues.push(`${file}: produced an empty file`);
        continue;
      }
      const content = NodeFS.readFileSync(full, "utf8");
      if (/\/\/ TODO|<!-- TODO|\/\/ FIXME|placeholder/i.test(content)) {
        issues.push(`${file}: contains TODO/FIXME/placeholder markers`);
      }
      if (file.endsWith(".html")) {
        if (!/<!DOCTYPE\s+html>/i.test(content)) issues.push(`${file}: missing <!DOCTYPE html>`);
        if (/<html[\s>]/i.test(content) && !/<\/html>/i.test(content)) {
          issues.push(`${file}: unclosed <html> tag`);
        }
      }
    } catch (err: any) {
      issues.push(`${file}: unreadable (${err?.message ?? "unknown error"})`);
    }
  }
  return issues;
}

interface CommandRunResult {
  ok: boolean;
  output: string;
  timedOut: boolean;
}

function runCommand(command: string, cwd: string, timeoutMs: number): CommandRunResult {
  try {
    const stdout = NodeChildProcess.execSync(command, {
      cwd,
      encoding: "utf8",
      timeout: timeoutMs,
      stdio: "pipe",
      maxBuffer: 8 * 1024 * 1024,
    });
    return { ok: true, output: String(stdout ?? "").slice(0, 2000), timedOut: false };
  } catch (err: any) {
    const killed = err?.killed === true || err?.signal === "SIGTERM";
    const stderr = err?.stderr ? String(err.stderr) : "";
    const stdout = err?.stdout ? String(err.stdout) : "";
    return {
      ok: false,
      output: `${stderr || stdout || err?.message || "command failed"}`.slice(0, 2000),
      timedOut: killed,
    };
  }
}

/* ────────────────────── watchdog self-healing helpers ────────────────────── */

/**
 * Fallback ladder for the watchdog. When the primary model fails (rate limit,
 * model error, empty output) the watchdog retries with the next model instead
 * of writing the worker off.
 */
export const WATCHDOG_FALLBACK_MODELS = [
  "deepseek-v4.1-flash-free",
  "gemini-2.5-flash",
  "glm-5.3-flash-free",
  "minimax-m3.1-flash-free",
  "kimi-k3",
] as const;

export function resolveFallbackModel(current: string): string | undefined {
  const idx = (WATCHDOG_FALLBACK_MODELS as readonly string[]).indexOf(current);
  if (idx >= 0) {
    return WATCHDOG_FALLBACK_MODELS[idx + 1];
  }
  return WATCHDOG_FALLBACK_MODELS[0];
}

/**
 * Dispatch a repair sub-agent for a failing build/test and merge its fix back.
 * This is how the watchdog fixes its own findings instead of only reporting.
 */
async function dispatchRepairSubAgent(opts: {
  projectRoot: string;
  projectName: string;
  taskTitle: string;
  reason: string;
  kind: "build" | "test";
  model: string;
  onLog?: (msg: string) => undefined | ((msg: string) => void);
}): Promise<{ ok: boolean; output: string }> {
  const repairId = `repair-${now()}-${Math.random().toString(36).slice(2, 7)}`;
  const worktree = createWorkerWorktree(opts.projectRoot, repairId);
  try {
    const prompt = [
      `The ${opts.kind} of this project is FAILING after a recent change.`,
      "",
      "Failure output:",
      opts.reason.slice(0, 2000),
      "",
      "Fix ONLY the cause of this failure. Touch as few files as possible.",
      "Do not add placeholders, TODOs, or explanatory comments.",
    ].join("\n");

    const res = await executeOpenCodeTask({
      worktreePath: worktree.worktreePath,
      projectName: opts.projectName,
      taskTitle: `Repair ${opts.kind} failure`,
      prompt,
      model: opts.model,
      onLog: (m) => opts.onLog?.(m),
    });

    if (!res.ok) {
      return { ok: false, output: res.error ?? "repair sub-agent failed" };
    }
    const changed = listChangedFiles(worktree.worktreePath);
    if (changed.length === 0) {
      return { ok: false, output: "repair sub-agent produced no changes" };
    }
    const merged = mergeWorkerWorktree(
      opts.projectRoot,
      worktree.worktreePath,
      worktree.branchName,
      `fix(${opts.kind}): ${opts.taskTitle.slice(0, 40)}`,
    );
    if (!merged.ok) {
      return { ok: false, output: merged.error ?? "repair merge failed" };
    }
    return { ok: true, output: `repair applied (${changed.length} file(s))` };
  } catch (err: any) {
    return { ok: false, output: err?.message ?? String(err) };
  } finally {
    if (worktree.isIsolated) {
      cleanupWorkerWorktree(opts.projectRoot, worktree.worktreePath, worktree.branchName);
    }
  }
}

/* ───────────────────────────── the watchdog ───────────────────────────── */

export interface WatchdogDispatchParams {
  projectId: string;
  projectName: string;
  projectRoot: string;
  taskTitle: string;
  prompt: string;
  model?: string;
  onLog?: (msg: string) => undefined | ((msg: string) => void);
  /** Internal guard: the watchdog retries itself once with a fallback model. */
  __isRetry?: boolean | undefined;
}

export interface WatchdogDispatchResult {
  ok: boolean;
  watchdogId: string;
  status: WatchdogStatus;
  verdict: string;
  workersCompleted: number;
  workersTotal: number;
  issues: string[];
}

/**
 * Start a watchdog over a task. The watchdog:
 *   1. splits the task,
 *   2. assigns each part to the sub-agent whose role matches it,
 *   3. watches every worker,
 *   4. reviews each worker's files the moment it completes,
 *   5. builds only when the change can break the build, then tests,
 *   6. hands one final verdict back to the Manager.
 */
export async function startWatchdogSupervision(
  params: WatchdogDispatchParams,
): Promise<WatchdogDispatchResult> {
  const {
    projectId,
    projectName,
    projectRoot,
    taskTitle,
    prompt,
    model = "deepseek-v4.1-flash-free",
  } = params;
  const log = typeof params.onLog === "function" ? params.onLog : undefined;

  const watchdogId = `watchdog-${now()}-${Math.random().toString(36).slice(2, 7)}`;
  const state: WatchdogState = {
    id: watchdogId,
    status: "watching",
    projectId,
    projectName,
    taskTitle,
    lastAction: "Splitting task and assigning sub-agents",
    workers: [],
    issues: [],
    recoveries: 0,
    startedAt: now(),
    updatedAt: now(),
    completedAt: undefined,
    verdict: "",
  };
  watchdogs.set(watchdogId, state);

  const touch = (action: string) => {
    state.lastAction = action;
    state.updatedAt = now();
    log?.(`[Watchdog] ${action}`);
  };

  try {
    const subtasks: SubtaskPlanItem[] = decomposeTask(taskTitle, prompt, projectRoot);
    touch(`Assigned ${subtasks.length} sub-agent(s) to watch`);

    for (const st of subtasks) {
      state.workers.push({
        id: `${watchdogId}-w${st.order}`,
        role: deriveSpecialistRole(st.title, st.category, st.order),
        goal: st.title,
        status: "running",
        filesChanged: 0,
        reviewNotes: [],
        buildRan: false,
        buildPassed: undefined,
        testRan: false,
        testPassed: undefined,
      });
    }

    const allocations = subtasks.map((st) => ({
      st,
      allocation: createWorkerWorktree(projectRoot, `${watchdogId}-${st.order}`),
    }));

    // ── Workers run in parallel; the watchdog watches each completion ──
    const settled = await Promise.allSettled(
      allocations.map(async ({ st, allocation }) => {
        const workerId = `${watchdogId}-w${st.order}`;
        registerWorkerTelemetry({
          id: workerId,
          role: state.workers.find((w) => w.id === workerId)?.role ?? "Autonomous Specialist",
          status: "running",
          model,
          cwd: allocation.worktreePath,
          goal: st.title,
          projectName,
          projectId,
          startedAt: now(),
        });

        let res = await executeOpenCodeTask({
          worktreePath: allocation.worktreePath,
          projectName,
          taskTitle: st.title,
          prompt: st.description,
          model,
          onLog: (m) => log?.(`[Watchdog/${st.order}] ${m}`),
        });

        // Watchdog self-heal #1: a failed model call is retried once with the
        // next model on the ladder before the worker is written off.
        if (!res.ok) {
          const fallback = resolveFallbackModel(model);
          if (fallback && fallback !== model) {
            state.recoveries += 1;
            touch(`Sub-agent ${st.order} failed — retrying with ${fallback}`);
            const row = state.workers.find((w) => w.id === workerId);
            row?.reviewNotes.push(`retried with fallback model ${fallback}`);
            res = await executeOpenCodeTask({
              worktreePath: allocation.worktreePath,
              projectName,
              taskTitle: st.title,
              prompt: st.description,
              model: fallback,
              onLog: (m) => log?.(`[Watchdog/${st.order}] ${m}`),
            });
          }
        }

        return { st, allocation, workerId, res };
      }),
    );

    // ── Watchdog reviews each completed worker, then builds/tests ──
    for (const outcome of settled) {
      if (outcome.status === "rejected") {
        state.issues.push(`Worker crashed: ${String(outcome.reason)}`);
        continue;
      }
      const { st, allocation, workerId, res } = outcome.value;
      const row = state.workers.find((w) => w.id === workerId);
      if (!row) continue;

      if (!res.ok) {
        row.status = "failed";
        row.reviewNotes.push(res.error ?? "worker failed");
        state.issues.push(`${row.role}: ${res.error ?? "worker failed"}`);
        updateWorkerTelemetryStatus(workerId, "failed", {
          completedAt: now(),
          error: res.error ?? "worker failed",
        });
        if (allocation.isIsolated) {
          cleanupWorkerWorktree(projectRoot, allocation.worktreePath, allocation.branchName);
        }
        continue;
      }

      // Review the worker's own output before it is merged.
      state.status = "reviewing";
      touch(`Reviewing ${row.role} output`);
      const changed = listChangedFiles(allocation.worktreePath);
      row.filesChanged = changed.length;
      const reviewIssues = reviewWorkerOutput(changed, allocation.worktreePath);
      row.reviewNotes.push(...reviewIssues);
      state.issues.push(...reviewIssues);

      // Merge only a worker whose review found no blocking problem.
      if (reviewIssues.length === 0 && allocation.isIsolated) {
        const merged = mergeWorkerWorktree(
          projectRoot,
          allocation.worktreePath,
          allocation.branchName,
          st.title,
        );
        if (!merged.ok) {
          row.reviewNotes.push(`merge failed: ${merged.error ?? "unknown"}`);
          state.issues.push(`Merge failed for ${row.role}: ${merged.error ?? "unknown"}`);
        }
      } else if (reviewIssues.length > 0 && allocation.isIsolated) {
        row.reviewNotes.push("skipped merge — review found issues");
      }

      if (allocation.isIsolated) {
        cleanupWorkerWorktree(projectRoot, allocation.worktreePath, allocation.branchName);
      }
      row.status = "completed";
      updateWorkerTelemetryStatus(workerId, "completed", {
        completedAt: now(),
        filesModified: changed,
      });

      // ── Build only when the change can break the build ──
      const pm = detectPackageManager(projectRoot);
      const scripts = readProjectScripts(projectRoot);
      if (requiresBuild(changed, projectRoot)) {
        state.status = "building";
        touch(`Build required — running ${pm} build`);
        const buildCmd =
          pm === "pnpm" ? "pnpm run build" : pm === "yarn" ? "yarn build" : "npm run build";
        const build = runCommand(buildCmd, projectRoot, 120_000);
        row.buildRan = true;
        row.buildPassed = build.ok;
        if (!build.ok) {
          row.reviewNotes.push(`build failed: ${build.output}`);
          // Watchdog self-heal #2: dispatch a repair sub-agent with the real
          // build error, merge its fix, then re-run the build.
          state.recoveries += 1;
          touch(`Build failed — dispatching repair sub-agent`);
          const repair = await dispatchRepairSubAgent({
            projectRoot,
            projectName,
            taskTitle: st.title,
            reason: build.output,
            kind: "build",
            model,
            onLog: (m) => log?.(`[Watchdog/repair] ${m}`),
          });
          if (repair.ok) {
            const rebuild = runCommand(buildCmd, projectRoot, 120_000);
            row.buildPassed = rebuild.ok;
            if (rebuild.ok) {
              row.reviewNotes.push("build repaired and re-verified ✓");
              touch(`Build repaired by sub-agent — verified clean`);
            } else {
              row.reviewNotes.push(`rebuild still failing: ${rebuild.output}`);
              state.issues.push(`Build failed after ${row.role}: ${build.output}`);
              state.status = "failed";
              continue;
            }
          } else {
            row.reviewNotes.push(`repair failed: ${repair.output}`);
            state.issues.push(`Build failed after ${row.role}: ${build.output}`);
            state.status = "failed";
            continue;
          }
        }
      } else {
        touch(`Build not required — skipping (${row.role} change is safe)`);
      }

      // ── Test (only when the project actually has tests) ──
      if (scripts.test) {
        state.status = "testing";
        touch(`Running ${pm} test suite`);
        const testCmd = pm === "pnpm" ? "pnpm run test" : pm === "yarn" ? "yarn test" : "npm test";
        const test = runCommand(testCmd, projectRoot, 120_000);
        row.testRan = true;
        row.testPassed = test.ok;
        if (!test.ok) {
          row.reviewNotes.push(`tests failed: ${test.output}`);
          // Watchdog self-heal #3: same repair loop for a failing test suite.
          state.recoveries += 1;
          touch(`Tests failed — dispatching repair sub-agent`);
          const repair = await dispatchRepairSubAgent({
            projectRoot,
            projectName,
            taskTitle: st.title,
            reason: test.output,
            kind: "test",
            model,
            onLog: (m) => log?.(`[Watchdog/repair] ${m}`),
          });
          if (repair.ok) {
            const retest = runCommand(testCmd, projectRoot, 120_000);
            row.testPassed = retest.ok;
            if (retest.ok) {
              row.reviewNotes.push("tests repaired and re-verified ✓");
              touch(`Tests repaired by sub-agent — verified clean`);
            } else {
              state.issues.push(`Tests failed after ${row.role}: ${test.output}`);
            }
          } else {
            state.issues.push(`Tests failed after ${row.role}: ${test.output}`);
          }
        }
      } else {
        touch(`No test script — skipping tests`);
      }
    }

    const completed = state.workers.filter((w) => w.status === "completed").length;
    const total = state.workers.length;
    const failed = state.workers.some((w) => w.status === "failed") || state.issues.length > 0;

    state.status = failed ? "failed" : "completed";
    state.completedAt = now();
    state.updatedAt = now();
    const recoveryNote = state.recoveries > 0 ? ` • ${state.recoveries} self-heal(s)` : "";
    state.verdict = failed
      ? `Watchdog verdict: ${completed}/${total} sub-agent(s) done, ${state.issues.length} issue(s) found${recoveryNote}`
      : `Watchdog verdict: all ${total} sub-agent(s) verified clean (review + build/test)${recoveryNote}`;
    state.lastAction = state.verdict;

    return {
      ok: !failed,
      watchdogId,
      status: state.status,
      verdict: state.verdict,
      workersCompleted: completed,
      workersTotal: total,
      issues: state.issues,
    };
  } catch (err: any) {
    const message = err?.message ?? String(err);
    // Watchdog self-heal #4: if the watchdog itself crashes, it restarts the
    // whole supervision once with a fallback model instead of failing the task.
    const fallback = resolveFallbackModel(model);
    if (!params.__isRetry && fallback && fallback !== model) {
      state.recoveries += 1;
      state.lastAction = `Watchdog crashed (${message}) — restarting with ${fallback}`;
      state.updatedAt = now();
      log?.(`[Watchdog] crashed (${message}) — restarting supervision with ${fallback}`);
      return startWatchdogSupervision({ ...params, model: fallback, __isRetry: true });
    }
    state.status = "failed";
    state.completedAt = now();
    state.updatedAt = now();
    state.issues.push(message);
    state.verdict = `Watchdog failed: ${message}`;
    return {
      ok: false,
      watchdogId,
      status: "failed",
      verdict: state.verdict,
      workersCompleted: 0,
      workersTotal: state.workers.length,
      issues: state.issues,
    };
  }
}
