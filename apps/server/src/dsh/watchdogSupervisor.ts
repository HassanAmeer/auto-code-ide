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
import { acquireWorktree, releaseWorktree, prewarmWorktrees } from "./worktreePool.ts";
import { executeOpenCodeTask } from "./opencodeBridge.ts";
import { extractChecklistFromPrompt } from "./selfReviewLoop.ts";
import type { ChecklistItem } from "./types.ts";
import {
  deriveSpecialistRole,
  registerWorkerTelemetry,
  updateWorkerTelemetryStatus,
  registerGoalTelemetry,
  updateGoalTelemetryStatus,
} from "./workerRegistry.ts";
import { isWorkerAborted, clearWorkerAbort, markWorkerAborted } from "./abortRegistry.ts";

export type WatchdogStatus =
  | "watching"
  | "reviewing"
  | "building"
  | "testing"
  | "completed"
  | "failed"
  | "cancelled";

/** A watchdog in one of these states is no longer supervising anything. */
export function isWatchdogStatusTerminal(status: WatchdogStatus): boolean {
  return status === "completed" || status === "failed" || status === "cancelled";
}

export interface WatchdogWorkerRow {
  id: string;
  role: string;
  goal: string;
  status: "running" | "completed" | "failed" | "cancelled";
  filesChanged: number;
  reviewNotes: string[];
  buildRan: boolean;
  buildPassed: boolean | undefined;
  testRan: boolean;
  testPassed: boolean | undefined;
  /** Model lane this worker runs on — different lanes = real parallelism. */
  model?: string | undefined;
  /** Live streamed output from the worker (newest last, capped). */
  logs?: string[] | undefined;
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
  /** Requirement checklist extracted from the user's task and audited vs the diff. */
  checklist: ChecklistItem[];
  /** Set by `stopWatchdog`; every later phase boundary bails out on it. */
  stopped?: boolean | undefined;
  startedAt: number;
  updatedAt: number;
  completedAt: number | undefined;
  verdict: string;
}

const watchdogs = new Map<string, WatchdogState>();

function now(): number {
  return Date.now();
}

/**
 * Finished watchdogs are kept for the UI history, but they must not accumulate
 * forever: the process is long-lived and every task adds a full state object
 * (workers, logs, issues). Anything terminal and older than the TTL is dropped.
 *
 * The TTL is 6 hours because the card is the only place a finished audit is
 * visible: at 30 minutes a user who stepped away lost the verdict before they
 * could read (or dismiss) it. Set SUPER_AGENT_WATCHDOG_TTL_MS to override.
 */
const WATCHDOG_TTL_MS = Number(process.env.SUPER_AGENT_WATCHDOG_TTL_MS || 6 * 60 * 60 * 1000);
function pruneWatchdogs(): void {
  const cutoff = now() - WATCHDOG_TTL_MS;
  for (const [id, state] of watchdogs) {
    if (isWatchdogStatusTerminal(state.status) && (state.completedAt ?? state.updatedAt) < cutoff) {
      watchdogs.delete(id);
    }
  }
  const finished = Array.from(watchdogs.values())
    .filter((state) => isWatchdogStatusTerminal(state.status))
    .sort((a, b) => (b.completedAt ?? b.updatedAt) - (a.completedAt ?? a.updatedAt));
  for (const state of finished.slice(100)) watchdogs.delete(state.id);
}

/**
 * Prune on a timer, not on read.
 *
 * `getWatchdogSnapshot` is a GET that the card polls every 2s for every open
 * client. Mutating the map inside a read meant a snapshot could delete the very
 * record it was asked for (and two concurrent reads could race the Map during
 * iteration). Pruning now happens on a slow unref'd interval; reads stay pure.
 */
if (typeof setInterval === "function") {
  const pruneTimer = setInterval(pruneWatchdogs, 5 * 60 * 1000);
  // Never hold the process (or a test runner) open just to prune.
  (pruneTimer as { unref?: () => void }).unref?.();
}

/**
 * Live snapshot for the UI watchdog card. */
export function getWatchdogSnapshot(filter?: {
  projectName?: string | undefined;
  projectId?: string | undefined;
}): {
  ok: boolean;
  watchdogs: WatchdogState[];
  active: number;
  timestamp: number;
} {
  // Reads stay pure: pruning runs on its own timer (see pruneWatchdogs).
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
    active: list.filter((w) => !isWatchdogStatusTerminal(w.status)).length,
    timestamp: now(),
  };
}

/**
 * Stop a watchdog for real.
 *
 * Marking the card as failed was not enough: `startWatchdogSupervision` keeps
 * running its own `Promise.allSettled` loop, so the workers stayed alive,
 * burned provider quota, and merged their output afterwards. Stopping now
 * cooperatively aborts every running worker (the same abort registry the
 * per-worker Stop button uses), marks their rows cancelled, and asks the
 * supervisor loop to bail out before review/merge/build/test.
 */
export function stopWatchdog(id: string): boolean {
  const existing = watchdogs.get(id);
  if (!existing) return false;
  if (isWatchdogStatusTerminal(existing.status)) return false;

  for (const worker of existing.workers) {
    if (worker.status !== "running") continue;
    // The supervisor loop polls `isWorkerAborted` at every checkpoint: before
    // dispatch, after the model call, before merge, before review.
    markWorkerAborted(worker.id);
    worker.status = "cancelled";
    worker.reviewNotes.push("stopped by user");
    updateWorkerTelemetryStatus(worker.id, "cancelled", { completedAt: now() });
    updateGoalTelemetryStatus(`goal-${worker.id}`, "cancelled", { completedAt: now() });
  }

  existing.status = "cancelled";
  existing.stopped = true;
  existing.lastAction = "Stopped by user";
  existing.verdict = "Watchdog verdict: stopped by user — no further work merged";
  existing.completedAt = now();
  existing.updatedAt = now();
  return true;
}

/**
 * Stop every watchdog that is still supervising.
 *
 * The UI "Stop All" button only aborted the worker telemetry, so the watchdog
 * loop kept running and still merged/built/tested the cancelled workers. This
 * flips every live watchdog to `cancelled` and returns how many it stopped.
 */
export function stopAllWatchdogs(): { stoppedWatchdogs: number } {
  let stoppedWatchdogs = 0;
  for (const id of watchdogs.keys()) {
    if (stopWatchdog(id)) stoppedWatchdogs += 1;
  }
  return { stoppedWatchdogs };
}

/* ───────────────────────── build & test helpers ───────────────────────── */

export type PackageManager = "pnpm" | "yarn" | "npm";

/** Build/test timeout. Big repos need more than the old 120s ceiling. */
const BUILD_TIMEOUT_MS = Number(process.env.SUPER_AGENT_BUILD_TIMEOUT_MS || 300_000);

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
    if (!NodeFS.existsSync(NodePath.join(worktreePath, ".git"))) {
      return [];
    }
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

/**
 * Async command runner for build/test.
 *
 * The old implementation was `execSync`, which blocked Node's event loop for
 * the whole build (up to BUILD_TIMEOUT_MS = 5 minutes). While it ran, the
 * server could not answer the watchdog snapshot poll or the Stop request — the
 * user pressed Stop and nothing happened until the build finished. This version
 * spawns a child and yields, and it kills the child as soon as the watchdog is
 * stopped, so Stop works during build and test as well.
 */
async function runCommandAsync(
  command: string,
  cwd: string,
  timeoutMs: number,
  abortCheck?: (() => boolean) | undefined,
): Promise<CommandRunResult> {
  return await new Promise<CommandRunResult>((resolve) => {
    let stdout = "";
    let stderr = "";
    let settled = false;
    let timedOut = false;
    // Declared before any handler can call `finish` so a synchronous `error`
    // event cannot hit a temporal-dead-zone read.
    let abortPoll: NodeJS.Timeout | undefined;
    let timeoutTimer: NodeJS.Timeout | undefined;
    let hardKillTimer: NodeJS.Timeout | undefined;

    const child = NodeChildProcess.spawn(command, {
      cwd,
      shell: true,
      // `detached` makes the shell its own process-group leader. Without it,
      // `kill(-pid)` targets the server's group instead, so the real build
      // (a grandchild of the shell) survived every Stop and kept burning CPU.
      detached: true,
      stdio: ["ignore", "pipe", "pipe"],
    });

    const finish = (result: CommandRunResult) => {
      if (settled) return;
      settled = true;
      if (abortPoll) clearInterval(abortPoll);
      if (timeoutTimer) clearTimeout(timeoutTimer);
      if (hardKillTimer) clearTimeout(hardKillTimer);
      resolve(result);
    };

    const kill = (reason: "timeout" | "stopped") => {
      if (reason === "timeout") timedOut = true;
      if (child.pid === undefined) return;
      try {
        process.kill(-child.pid, "SIGTERM");
      } catch {
        try {
          child.kill("SIGTERM");
        } catch {}
      }
      // A build that ignores SIGTERM (or a wedged child) must not leave the
      // watchdog awaiting forever: SIGKILL the group shortly after.
      if (hardKillTimer === undefined) {
        hardKillTimer = setTimeout(
          () => {
            if (child.pid !== undefined) {
              try {
                process.kill(-child.pid, "SIGKILL");
              } catch {}
            }
            finish({
              ok: false,
              output:
                (reason === "timeout" ? "command timed out: " : "stopped by user: ") +
                (stderr || stdout).slice(0, 1800),
              timedOut,
            });
          },
          reason === "stopped" ? 3000 : 5000,
        );
        (hardKillTimer as { unref?: () => void }).unref?.();
      }
    };

    abortPoll = setInterval(() => {
      // Do NOT resolve here: `close` (or the SIGKILL fallback) resolves once the
      // process group is really gone, so a stopped build cannot keep writing
      // into the project while the watchdog has already moved on.
      if (abortCheck?.()) kill("stopped");
    }, 250);
    (abortPoll as { unref?: () => void }).unref?.();

    timeoutTimer = setTimeout(() => {
      kill("timeout");
    }, timeoutMs);
    (timeoutTimer as { unref?: () => void }).unref?.();

    child.stdout?.on("data", (chunk) => {
      if (stdout.length < 8 * 1024 * 1024) stdout += String(chunk);
    });
    child.stderr?.on("data", (chunk) => {
      if (stderr.length < 8 * 1024 * 1024) stderr += String(chunk);
    });

    child.on("error", (err) => {
      finish({ ok: false, output: String(err?.message ?? err).slice(0, 2000), timedOut: false });
    });

    child.on("close", (code, signal) => {
      finish({
        ok: code === 0,
        output: (code === 0 ? stdout : stderr || stdout || `exited with ${code ?? signal}`).slice(
          0,
          2000,
        ),
        timedOut,
      });
    });
  });
}

/**
 * Audit the requirement checklist against the merged diff. Every requirement
 * the user asked for must be traceable to something that actually changed —
 * a missing requirement is a real accuracy failure, not a warning.
 */
export function auditRequirementChecklist(
  checklist: ChecklistItem[],
  diff: string,
): { passed: number; missing: string[] } {
  const haystack = diff.toLowerCase();
  const missing: string[] = [];
  for (const item of checklist) {
    const keywords = item.requirement
      .toLowerCase()
      .split(/\s+/)
      .filter((k) => k.length > 3);
    const matched = keywords.some((k) => haystack.includes(k));
    // Diff text is useful evidence for review, but keyword overlap cannot prove
    // that a requirement is implemented. Only the semantic verifier may pass it.
    item.status = "pending";
    item.evidence = matched
      ? "Diff contains related text; semantic verification required"
      : "No related text found in the diff; semantic verification required";
    missing.push(item.requirement);
  }
  return { passed: 0, missing };
}

/** The verifier must give an explicit, unambiguous PASS as its first line. */
export function isExplicitVerificationPass(output: string): boolean {
  return /^PASS\s*$/i.test(output.trim().split(/\r?\n/, 1)[0] ?? "");
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

/**
 * Model lanes for the parallel workers. Two workers on the SAME provider share
 * one upstream queue, so their "parallel" calls serialise behind a rate limit.
 * Spreading the workers over different models/providers is what makes the
 * parallelism real.
 *
 * Override with SUPER_AGENT_WORKER_LANES="model-a,model-b,model-c".
 */
export function resolveWorkerLaneModels(
  baseModel: string,
  workerCount: number,
  explicitLanes?: string | undefined,
): string[] {
  const override = (explicitLanes ?? process.env.SUPER_AGENT_WORKER_LANES ?? "")
    .split(",")
    .map((m) => m.trim())
    .filter((m) => m.length > 0);
  // Sub-agents (workers) use the same model as the manager (baseModel) by
  // default, so the user's selected model is honoured across all workers.
  // Only an explicit lane override (or env) spreads workers over other models.
  const lanes: string[] = [];
  for (let i = 0; i < Math.max(1, workerCount); i++) {
    if (override.length > 0) {
      lanes.push(override[i % override.length] ?? baseModel);
    } else {
      lanes.push(baseModel);
    }
  }
  return lanes;
}

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
  kind: "build" | "test" | "requirement";
  model: string;
  onLog?: (msg: string) => undefined | ((msg: string) => void);
  /** Cooperative abort — a stopped watchdog must not run (or merge) a repair. */
  abortCheck?: (() => boolean) | undefined;
}): Promise<{ ok: boolean; output: string }> {
  if (opts.abortCheck?.()) return { ok: false, output: "stopped by user" };
  const repairId = `repair-${now()}-${Math.random().toString(36).slice(2, 7)}`;
  const worktree = createWorkerWorktree(opts.projectRoot, repairId);
  try {
    const prompt = [
      opts.kind === "requirement"
        ? "The previous changes do NOT satisfy the requirements below."
        : `The ${opts.kind} of this project is FAILING after a recent change.`,
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
      abortCheck: opts.abortCheck,
    });

    if (!res.ok) {
      return { ok: false, output: res.error ?? "repair sub-agent failed" };
    }
    // Do not merge a repair the user already cancelled.
    if (opts.abortCheck?.()) return { ok: false, output: "stopped by user" };
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

/**
 * Verification Sub-Agent — the accuracy gate.
 *
 * Build and tests can pass while the code still does not do what was asked.
 * This agent reads the merged diff against the requirement checklist and
 * answers PASS or FAIL. On FAIL the watchdog dispatches a fix sub-agent with
 * the reason and re-verifies once.
 */
async function runVerificationSubAgent(opts: {
  projectRoot: string;
  projectName: string;
  taskTitle: string;
  requirements: ReadonlyArray<string>;
  diff: string;
  model: string;
  onLog?: (msg: string) => undefined | ((msg: string) => void);
  /** Cooperative abort — a stopped watchdog must not run a verifier either. */
  abortCheck?: (() => boolean) | undefined;
}): Promise<{ passed: boolean; reason: string }> {
  if (opts.abortCheck?.()) return { passed: false, reason: "stopped by user" };
  const requirements = opts.requirements.length > 0 ? opts.requirements : ["the requested task"];
  const prompt = [
    "You are a strict VERIFIER. Check whether the following code changes actually",
    "satisfy the requirements. Answer with PASS or FAIL on the first line, then one",
    "short paragraph of reasoning. Do not write any code.",
    "",
    "REQUIREMENTS:",
    ...requirements.map((r, i) => `${i + 1}. ${r}`),
    "",
    "CHANGES:",
    opts.diff.slice(0, 6000) || "(no diff available)",
  ].join("\n");

  try {
    const worktree = acquireWorktree(
      opts.projectRoot,
      `verify-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    );
    try {
      const res = await executeOpenCodeTask({
        worktreePath: worktree.worktreePath,
        projectName: opts.projectName,
        projectRoot: opts.projectRoot,
        taskTitle: "Verify requirements",
        readOnly: true,
        prompt,
        model: opts.model,
        onLog: (m) => opts.onLog?.(m),
        abortCheck: opts.abortCheck,
      });
      const content = res.modelOutput ?? res.outputSummary ?? "";
      const passed = res.ok && isExplicitVerificationPass(content);
      return {
        passed,
        reason: passed
          ? "Verification sub-agent confirmed the requirements are met"
          : `Verification sub-agent reported a problem: ${content.slice(0, 400) || "no reason recorded"}`,
      };
    } finally {
      releaseWorktree(opts.projectRoot, worktree);
    }
  } catch (err: any) {
    return {
      passed: false,
      reason: `verification sub-agent failed: ${err?.message ?? String(err)}`,
    };
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
  /** Comma-separated model lanes for the parallel workers. */
  lanes?: string | undefined;
  /**
   * How many sub-agents may run for this task. An explicit request (the
   * /parallel-subagents command) pins the count so a task never fans out into
   * an accidental army of workers.
   */
  maxWorkers?: number | undefined;
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
    model = "opencode/beam-free",
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
    checklist: [],
    startedAt: now(),
    updatedAt: now(),
    completedAt: undefined,
    verdict: "",
  };
  watchdogs.set(watchdogId, state);
  const readyWorkers = new Set<string>();
  const ownedAllocations = new Set<ReturnType<typeof acquireWorktree>>();
  const releaseOwned = (allocation: ReturnType<typeof acquireWorktree>) => {
    if (!ownedAllocations.delete(allocation)) return;
    releaseWorktree(projectRoot, allocation);
  };

  const touch = (action: string) => {
    state.lastAction = action;
    state.updatedAt = now();
    log?.(`[Watchdog] ${action}`);
  };

  try {
    // Cooperative cancellation. `stopWatchdog` flips the card to `cancelled`
    // and aborts the workers; every phase boundary calls this so a stopped run
    // stops immediately instead of finishing its review/build/test cycle.
    //
    // `isStopped` is the single predicate every call site uses. Before this,
    // each site spelled out `state.stopped === true || state.status ===
    // "cancelled"` by hand; one of the two halves could be set without the
    // other (stopWatchdog sets both, but the crash path sets only one), so the
    // answers could disagree mid-run.
    const isStopped = (): boolean => state.stopped === true || state.status === "cancelled";
    const stopIfRequested = (): WatchdogDispatchResult | undefined => {
      if (!isStopped()) return undefined;
      state.stopped = true;
      state.status = "cancelled";
      state.completedAt ??= now();
      state.updatedAt = now();
      return {
        ok: false,
        watchdogId,
        status: "cancelled",
        verdict: state.verdict || "Watchdog verdict: stopped by user",
        workersCompleted: state.workers.filter((w) => w.status === "completed").length,
        workersTotal: state.workers.length,
        issues: state.issues,
      };
    };
    // Phase transitions must never resurrect a stopped watchdog: a stop that
    // lands mid-build would otherwise put the card back on "building".
    const setPhase = (status: WatchdogStatus) => {
      if (isStopped()) return;
      state.status = status;
    };

    const subtasks: SubtaskPlanItem[] = decomposeTask(taskTitle, prompt, projectRoot);
    // The requirement checklist is the accuracy target: it is what the merged
    // code is audited against at the end.
    state.checklist = extractChecklistFromPrompt(prompt);
    touch(`Assigned ${subtasks.length} sub-agent(s) to watch`);

    // Worker count is capped so one huge task cannot fan out into a dozen
    // workers; the overflow is folded into the last worker instead of dropped.
    // An explicit request (the /parallel-subagents command) pins the count.
    const maxWorkers = Math.max(
      1,
      Math.min(12, params.maxWorkers ?? Number(process.env.SUPER_AGENT_MAX_WORKERS || 4)),
    );
    let planned = subtasks;
    if (planned.length > maxWorkers) {
      const overflow = planned.slice(maxWorkers - 1);
      const kept = planned.slice(0, maxWorkers - 1);
      const last = overflow[0]!;
      kept.push({
        ...last,
        title: `${last.title} (+${overflow.length - 1} folded milestones)`,
        description: [last.description, ...overflow.slice(1).map((o) => o.description)].join("\n"),
      });
      planned = kept;
      touch(`Folding ${subtasks.length} milestones into ${maxWorkers} workers`);
    }

    // Build one worker row per planned milestone. This must run AFTER the
    // fold above: the rows have to match the allocations the watchdog really
    // dispatches, and `planned` does not exist before it is computed.
    for (const st of planned) {
      const workerId = `${watchdogId}-w${st.order}`;
      state.workers.push({
        id: workerId,
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
      // Goals panel and the Subagents panel read the telemetry registry, not
      // the watchdog card. Registering here is what makes those two panels
      // show the milestone the watchdog is actually supervising.
      registerGoalTelemetry({
        id: `goal-${workerId}`,
        title: st.title,
        status: "running",
        workerId,
        order: st.order,
        projectName,
        projectId,
        createdAt: now(),
      });
    }

    // Park a few worktrees ahead of time so the first dispatch is instant too.
    prewarmWorktrees(projectRoot);
    let baseline = "HEAD";
    try {
      baseline = NodeChildProcess.execFileSync("git", ["rev-parse", "HEAD"], {
        cwd: projectRoot,
        encoding: "utf8",
        stdio: ["ignore", "pipe", "ignore"],
      }).trim();
    } catch {}

    const allocations = planned.map((st) => {
      const allocation = acquireWorktree(projectRoot, `${watchdogId}-${st.order}`);
      ownedAllocations.add(allocation);
      return { st, allocation };
    });

    // Each worker gets its own model lane so the calls really run in parallel
    // instead of queueing behind one provider's rate limit.
    const laneModels = resolveWorkerLaneModels(model, allocations.length, params.lanes);

    // Race guard: a Stop that landed while the task was being split/planned
    // arrives before any worker row could be aborted. Mark every planned
    // worker aborted here so the dispatch loop below bails out per worker, and
    // return before a single model call is made.
    if (isStopped()) {
      for (const { st } of allocations) markWorkerAborted(`${watchdogId}-w${st.order}`);
      // The allocations above are already parked in the pool, so a stop that
      // arrives here must hand them back or the pool leaks one worktree (and
      // one git branch) per cancelled task.
      for (const { allocation } of allocations) releaseOwned(allocation);
      const stoppedBeforeDispatch = stopIfRequested();
      if (stoppedBeforeDispatch) return stoppedBeforeDispatch;
    }

    // ── Workers run in parallel; the watchdog watches each completion ──
    const settled = await Promise.allSettled(
      allocations.map(async ({ st, allocation }) => {
        const workerId = `${watchdogId}-w${st.order}`;
        registerWorkerTelemetry({
          id: workerId,
          role: state.workers.find((w) => w.id === workerId)?.role ?? "Autonomous Specialist",
          status: "running",
          model: laneModels[st.order - 1] ?? model,
          cwd: allocation.worktreePath,
          goal: st.title,
          projectName,
          projectId,
          startedAt: now(),
        });

        const laneModel = laneModels[st.order - 1] ?? model;
        if (laneModel !== model) {
          log?.(`[Watchdog/${st.order}] using model lane: ${laneModel}`);
        }

        const row = state.workers.find((w) => w.id === workerId);
        if (row) {
          row.model = laneModel;
          row.logs = [];
        }
        const workerLog = (m: string) => {
          log?.(`[Watchdog/${st.order}] ${m}`);
          const target = state.workers.find((w) => w.id === workerId);
          if (target) {
            const lines = target.logs ?? [];
            lines.push(m.slice(-2048));
            // Keep only the newest lines so a long stream cannot grow forever.
            target.logs = lines.slice(-12);
          }
        };

        // A stop request from the card marks the worker aborted — do not even
        // start it, and never merge its output.
        const abortedResult = {
          ok: false,
          filesModified: [] as string[],
          outputSummary: "Stopped by user",
          error: "Stopped by user",
        };
        if (isWorkerAborted(workerId)) {
          clearWorkerAbort(workerId);
          const abortedRow = state.workers.find((w) => w.id === workerId);
          if (abortedRow) {
            abortedRow.status = "cancelled";
            abortedRow.reviewNotes.push("stopped by user before dispatch");
          }
          updateWorkerTelemetryStatus(workerId, "cancelled", { completedAt: now() });
          updateGoalTelemetryStatus(`goal-${workerId}`, "cancelled", { completedAt: now() });
          return { st, allocation, workerId, res: abortedResult };
        }

        let res = await executeOpenCodeTask({
          worktreePath: allocation.worktreePath,
          projectName,
          projectRoot,
          taskTitle: st.title,
          prompt: st.description,
          model: laneModel,
          onLog: workerLog,
          // Without this the Stop button only flagged the worker: the model
          // stream kept running (and burning quota) for minutes. The bridge
          // polls this at every step and discards unfinished output.
          abortCheck: () => isWorkerAborted(workerId),
        });

        // Watchdog self-heal #1: a failed model call is retried once with the
        // next model on the ladder before the worker is written off.
        // A user stop is NOT a failure: retrying it would fire one more model
        // call for work the user already cancelled, so bail out first.
        if (!res.ok && !isWorkerAborted(workerId)) {
          const fallback = resolveFallbackModel(model);
          if (fallback && fallback !== model) {
            state.recoveries += 1;
            touch(`Sub-agent ${st.order} failed — retrying with ${fallback}`);
            const retried = await executeOpenCodeTask({
              worktreePath: allocation.worktreePath,
              projectName,
              projectRoot,
              taskTitle: st.title,
              prompt: st.description,
              model: fallback,
              onLog: workerLog,
              abortCheck: () => isWorkerAborted(workerId),
            });
            res = retried;
            // Only annotate the row when the fallback did not save the worker:
            // an amber "retried" note under a green row reads like a failure.
            if (!retried.ok && !isWorkerAborted(workerId)) {
              const row = state.workers.find((w) => w.id === workerId);
              row?.reviewNotes.push(`retried with fallback model ${fallback}`);
            }
          }
        }

        // Stopped while the model was working — discard the output.
        if (isWorkerAborted(workerId)) {
          clearWorkerAbort(workerId);
          const abortedRow = state.workers.find((w) => w.id === workerId);
          if (abortedRow) {
            abortedRow.status = "cancelled";
            abortedRow.reviewNotes.push("stopped by user — output discarded");
          }
          updateWorkerTelemetryStatus(workerId, "cancelled", { completedAt: now() });
          updateGoalTelemetryStatus(`goal-${workerId}`, "cancelled", { completedAt: now() });
          return { st, allocation, workerId, res: abortedResult };
        }

        return { st, allocation, workerId, res };
      }),
    );

    // ── PHASE 2: Review every worker's output IN PARALLEL (cheap, no build) ──
    // A stop request may have landed while the workers were running: never
    // review, merge, build, test, or report a verdict for a stopped watchdog.
    const stoppedResult = stopIfRequested();
    if (stoppedResult) {
      // Every worker allocation is still parked: hand them all back before
      // bailing out so a stopped run does not drain the worktree pool.
      for (const outcome of settled) {
        if (outcome.status === "fulfilled") releaseOwned(outcome.value.allocation);
      }
      return stoppedResult;
    }
    setPhase("reviewing");
    touch("Reviewing all sub-agent outputs in parallel");

    const reviewed = await Promise.all(
      settled.map(async (outcome, index) => {
        if (outcome.status === "rejected") {
          const row = state.workers[index];
          if (row) {
            row.status = "failed";
            row.reviewNotes.push(String(outcome.reason));
          }
          return { crashed: true as const, reason: String(outcome.reason) };
        }
        const { st, allocation, workerId, res } = outcome.value;
        const row = state.workers.find((w) => w.id === workerId);
        if (!row) return { crashed: true as const, reason: "row missing" };

        if (!res.ok) {
          // The bridge reports a cancelled run as "Aborted by user" while the
          // local abort path uses "Stopped by user" — both mean the user
          // stopped it, not that the worker failed. Treat them the same so a
          // stop never shows up as a red failure in the card.
          const cancelled =
            isWorkerAborted(workerId) || /^(stopped|aborted) by user$/i.test(res.error ?? "");
          row.status = cancelled ? "cancelled" : "failed";
          row.reviewNotes.push(res.error ?? "worker failed");
          if (!cancelled) {
            state.issues.push(`${row.role}: ${res.error ?? "worker failed"}`);
          }
          updateWorkerTelemetryStatus(workerId, cancelled ? "cancelled" : "failed", {
            completedAt: now(),
            error: res.error ?? "worker failed",
          });
          updateGoalTelemetryStatus(`goal-${workerId}`, cancelled ? "cancelled" : "failed", {
            completedAt: now(),
          });
          // A failed worker still has to carry the same shape as a reviewed
          // one: the merge phase reads `reviewIssues`/`changed` off every row.
          return {
            crashed: false as const,
            workerId,
            st,
            allocation,
            changed: [] as string[],
            reviewIssues: [] as string[],
          };
        }

        const changed = listChangedFiles(allocation.worktreePath);
        row.filesChanged = changed.length;
        if (changed.length === 0) {
          const issue = `${st.title}: worker produced no changes`;
          row.status = "failed";
          row.reviewNotes.push(issue);
          state.issues.push(issue);
          updateWorkerTelemetryStatus(workerId, "failed", {
            completedAt: now(),
            filesModified: [],
            error: issue,
          });
          updateGoalTelemetryStatus(`goal-${workerId}`, "failed", { completedAt: now() });
          return {
            crashed: false as const,
            workerId,
            st,
            allocation,
            changed,
            reviewIssues: [issue],
          };
        }
        const reviewIssues = reviewWorkerOutput(changed, allocation.worktreePath);
        row.reviewNotes.push(...reviewIssues);
        state.issues.push(...reviewIssues);
        if (reviewIssues.length > 0) row.status = "failed";
        else readyWorkers.add(workerId);
        updateWorkerTelemetryStatus(workerId, "running", {
          filesModified: changed,
        });
        return { crashed: false as const, workerId, st, allocation, changed, reviewIssues };
      }),
    );

    // ── PHASE 3: Merge workers SEQUENTIALLY (git needs a stable order) ──
    // A stop that landed during review must not merge anything: the user said
    // stop, so the worktrees go back to the pool untouched.
    const stoppedBeforeMerge = stopIfRequested();
    if (stoppedBeforeMerge) {
      for (const r of reviewed) {
        if (r.crashed) continue;
        releaseOwned(r.allocation);
      }
      return stoppedBeforeMerge;
    }
    const mergeable = reviewed.filter(
      (r): r is Extract<typeof r, { crashed: false }> =>
        !r.crashed && (r.reviewIssues ?? []).length === 0 && r.changed.length > 0,
    );
    const allChangedFiles = reviewed.flatMap((r) => (r.crashed ? [] : r.changed));

    for (const r of reviewed) {
      if (r.crashed) {
        state.issues.push(`Worker crashed: ${r.reason}`);
        continue;
      }
      const row = state.workers.find((w) => w.id === r.workerId);
      if (!row) continue;
      if (!readyWorkers.has(row.id) || row.status === "cancelled") continue;
      if ((r.reviewIssues ?? []).length > 0) {
        row.reviewNotes.push("skipped merge — review found issues");
        continue;
      }
      if (!r.allocation.isIsolated) continue;
      const merged = mergeWorkerWorktree(
        projectRoot,
        r.allocation.worktreePath,
        r.allocation.branchName,
        r.st.title,
      );
      if (!merged.ok) {
        row.reviewNotes.push(`merge failed: ${merged.error ?? "unknown"}`);
        state.issues.push(`Merge failed for ${row.role}: ${merged.error ?? "unknown"}`);
      }
    }

    // Park the worktrees instead of deleting them — the next task reuses them.
    for (const r of reviewed) {
      if (r.crashed) continue;
      releaseOwned(r.allocation);
    }

    // ── PHASE 3.5: Requirement checklist audit ──
    // Build and tests can pass while a requirement was never implemented.
    // The checklist is traced against the real merged diff.
    const stoppedBeforeAudit = stopIfRequested();
    if (stoppedBeforeAudit) return stoppedBeforeAudit;
    let mergedDiff = "";
    if (mergeable.length > 0) {
      setPhase("reviewing");
      touch("Auditing requirements against the merged diff");
      mergedDiff = getWorktreeDiff(projectRoot, baseline);
      const audit = auditRequirementChecklist(state.checklist, mergedDiff);
      if (audit.missing.length > 0) {
        touch(`${audit.missing.length} requirement(s) awaiting semantic verification`);
      } else {
        touch(`All ${audit.passed} requirement(s) traced to the changes`);
      }
    }

    // ── PHASE 4: ONE build + ONE test for the whole merged workspace ──
    // Running a build per worker was the biggest waste: N workers meant N
    // builds and N test suites. The merged workspace is verified once.
    const pm = detectPackageManager(projectRoot);
    const scripts = readProjectScripts(projectRoot);
    const buildRequired = requiresBuild(allChangedFiles, projectRoot);

    if (mergeable.length === 0) {
      touch("Nothing merged — skipping build and tests");
    } else if (buildRequired) {
      setPhase("building");
      touch(`Build required — running ${pm} build once for the merged workspace`);
      const buildCmd =
        pm === "pnpm" ? "pnpm run build" : pm === "yarn" ? "yarn build" : "npm run build";
      const build = await runCommandAsync(buildCmd, projectRoot, BUILD_TIMEOUT_MS, isStopped);
      for (const row of state.workers) {
        if (readyWorkers.has(row.id) && row.status !== "cancelled") {
          row.buildRan = true;
          row.buildPassed = build.ok;
        }
      }
      if (!build.ok) {
        // A stop that landed during the build must not dispatch a repair.
        const stoppedDuringBuild = stopIfRequested();
        if (stoppedDuringBuild) return stoppedDuringBuild;
        // Watchdog self-heal: one repair sub-agent with the real build error.
        state.recoveries += 1;
        touch("Build failed — dispatching repair sub-agent");
        const repair = await dispatchRepairSubAgent({
          projectRoot,
          projectName,
          taskTitle,
          reason: build.output,
          kind: "build",
          model,
          onLog: (m) => log?.(`[Watchdog/repair] ${m}`),
          abortCheck: isStopped,
        });
        if (repair.ok) {
          const rebuild = await runCommandAsync(buildCmd, projectRoot, BUILD_TIMEOUT_MS, isStopped);
          for (const row of state.workers) {
            if (readyWorkers.has(row.id) && row.status !== "cancelled")
              row.buildPassed = rebuild.ok;
          }
          if (rebuild.ok) {
            touch("Build repaired by sub-agent — verified clean");
          } else {
            state.issues.push(`Build failed: ${rebuild.output}`);
          }
        } else {
          state.issues.push(`Build failed: ${build.output}`);
        }
      }
    } else {
      touch("Build not required — change is safe, skipping build");
    }

    if (mergeable.length > 0 && scripts.test) {
      setPhase("testing");
      touch(`Running ${pm} test suite once`);
      const testCmd = pm === "pnpm" ? "pnpm run test" : pm === "yarn" ? "yarn test" : "npm test";
      const test = await runCommandAsync(testCmd, projectRoot, BUILD_TIMEOUT_MS, isStopped);
      for (const row of state.workers) {
        if (readyWorkers.has(row.id) && row.status !== "cancelled") {
          row.testRan = true;
          row.testPassed = test.ok;
        }
      }
      if (!test.ok) {
        // A stop that landed during the test run must not dispatch a repair.
        const stoppedDuringTest = stopIfRequested();
        if (stoppedDuringTest) return stoppedDuringTest;
        state.recoveries += 1;
        touch("Tests failed — dispatching repair sub-agent");
        const repair = await dispatchRepairSubAgent({
          projectRoot,
          projectName,
          taskTitle,
          reason: test.output,
          kind: "test",
          model,
          onLog: (m) => log?.(`[Watchdog/repair] ${m}`),
          abortCheck: isStopped,
        });
        if (repair.ok) {
          const retest = await runCommandAsync(testCmd, projectRoot, BUILD_TIMEOUT_MS, isStopped);
          for (const row of state.workers) {
            if (readyWorkers.has(row.id) && row.status !== "cancelled") row.testPassed = retest.ok;
          }
          if (retest.ok) {
            touch("Tests repaired by sub-agent — verified clean");
            if (scripts.build) {
              const rebuild = await runCommandAsync(
                `${pm} run build`,
                projectRoot,
                BUILD_TIMEOUT_MS,
                isStopped,
              );
              const stoppedAfterRebuild = stopIfRequested();
              if (stoppedAfterRebuild) return stoppedAfterRebuild;
              for (const row of state.workers) {
                if (readyWorkers.has(row.id) && row.status !== "cancelled") {
                  row.buildRan = true;
                  row.buildPassed = rebuild.ok;
                }
              }
              if (!rebuild.ok)
                state.issues.push(`Build failed after test repair: ${rebuild.output}`);
            }
          } else {
            state.issues.push(`Tests failed: ${retest.output}`);
          }
        } else {
          state.issues.push(`Tests failed: ${test.output}`);
        }
      }
    } else if (mergeable.length > 0) {
      touch("No test script — skipping tests");
    }

    // ── PHASE 5: Verification Sub-Agent (semantic accuracy gate) ──
    // The verifier reads the merged diff against the requirement checklist and
    // decides PASS/FAIL. On FAIL the watchdog dispatches a fix sub-agent and
    // verifies once more.
    const stoppedBeforeVerification = stopIfRequested();
    if (stoppedBeforeVerification) return stoppedBeforeVerification;
    if (mergeable.length > 0) {
      setPhase("reviewing");
      touch("Verification sub-agent checking the requirements");
      const requirements = state.checklist.map((c) => c.requirement);
      const verification = await runVerificationSubAgent({
        projectRoot,
        projectName,
        taskTitle,
        requirements,
        diff: getWorktreeDiff(projectRoot, baseline),
        model,
        onLog: (m) => log?.(`[Watchdog/verify] ${m}`),
        abortCheck: isStopped,
      });

      const stoppedAfterVerification = stopIfRequested();
      if (stoppedAfterVerification) return stoppedAfterVerification;
      if (verification.passed) {
        state.checklist.forEach((c) => {
          c.status = "passed";
          c.evidence = "Confirmed by the verification sub-agent";
        });
        touch("Verification passed — requirements met");
      } else {
        state.recoveries += 1;
        touch("Verification failed — dispatching fix sub-agent");
        const fix = await dispatchRepairSubAgent({
          projectRoot,
          projectName,
          taskTitle,
          reason: verification.reason,
          kind: "requirement",
          model,
          onLog: (m) => log?.(`[Watchdog/fix] ${m}`),
          abortCheck: isStopped,
        });
        const stoppedAfterFix = stopIfRequested();
        if (stoppedAfterFix) return stoppedAfterFix;
        if (fix.ok) {
          // Repairs change the workspace after the original build/test gate.
          // Validate the repaired code before allowing a semantic PASS.
          const repairedScripts = readProjectScripts(projectRoot);
          for (const kind of ["build", "test"] as const) {
            if (!repairedScripts[kind]) continue;
            setPhase(kind === "build" ? "building" : "testing");
            const checked = await runCommandAsync(
              `${pm} run ${kind}`,
              projectRoot,
              BUILD_TIMEOUT_MS,
              isStopped,
            );
            const stoppedDuringRepairCheck = stopIfRequested();
            if (stoppedDuringRepairCheck) return stoppedDuringRepairCheck;
            for (const row of state.workers) {
              if (!readyWorkers.has(row.id) || row.status === "cancelled") continue;
              if (kind === "build") {
                row.buildRan = true;
                row.buildPassed = checked.ok;
              } else {
                row.testRan = true;
                row.testPassed = checked.ok;
              }
            }
            if (!checked.ok)
              state.issues.push(`${kind} failed after requirement repair: ${checked.output}`);
          }
          const recheck = await runVerificationSubAgent({
            projectRoot,
            projectName,
            taskTitle,
            requirements,
            diff: getWorktreeDiff(projectRoot, baseline),
            model,
            onLog: (m) => log?.(`[Watchdog/verify] ${m}`),
            abortCheck: isStopped,
          });
          const stoppedAfterRecheck = stopIfRequested();
          if (stoppedAfterRecheck) return stoppedAfterRecheck;
          if (recheck.passed) {
            state.checklist.forEach((c) => {
              c.status = "passed";
              c.evidence = "Confirmed after repair by the verification sub-agent";
            });
            touch("Fix applied — re-verified ✓");
          } else {
            state.issues.push(recheck.reason);
          }
        } else {
          state.issues.push(fix.output || verification.reason);
        }
      }
    }

    for (const worker of state.workers) {
      if (isWorkerAborted(worker.id)) worker.status = "cancelled";
    }
    const completed = state.workers.filter(
      (w) => readyWorkers.has(w.id) && w.status === "running",
    ).length;
    const total = state.workers.length;
    const stoppedBeforeVerdict = stopIfRequested();
    if (stoppedBeforeVerdict) return stoppedBeforeVerdict;
    const failed = completed !== total || state.issues.length > 0;

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
    // A stopped watchdog must not restart itself through the crash self-heal.
    if (state.stopped) {
      state.status = "cancelled";
      state.updatedAt = now();
      return {
        ok: false,
        watchdogId,
        status: "cancelled",
        verdict: state.verdict || "Watchdog verdict: stopped by user",
        workersCompleted: state.workers.filter((w) => w.status === "completed").length,
        workersTotal: state.workers.length,
        issues: state.issues,
      };
    }
    // Watchdog self-heal #4: if the watchdog itself crashes, it restarts the
    // whole supervision once with a fallback model instead of failing the task.
    const fallback = resolveFallbackModel(model);
    if (!params.__isRetry && fallback && fallback !== model) {
      state.recoveries += 1;
      state.lastAction = `Watchdog crashed (${message}) — restarting with ${fallback}`;
      state.status = "failed";
      state.completedAt = now();
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
  } finally {
    for (const allocation of ownedAllocations) releaseOwned(allocation);
    for (const worker of state.workers) {
      if (worker.status !== "cancelled") {
        worker.status =
          state.status === "completed"
            ? "completed"
            : state.status === "cancelled"
              ? "cancelled"
              : "failed";
      }
      updateWorkerTelemetryStatus(worker.id, worker.status, { completedAt: now() });
      updateGoalTelemetryStatus(`goal-${worker.id}`, worker.status, { completedAt: now() });
    }
    // Abort flags are per-run, not per-id-forever. A stopped watchdog marks its
    // workers aborted, but an aborted worker may bail out at a boundary that
    // never reaches a `clearWorkerAbort` call (pre-dispatch, crash, early
    // return). Those ids then stayed in the registry Set for the lifetime of
    // the process. Clear every id this run owned as it finishes.
    for (const worker of state.workers) clearWorkerAbort(worker.id);
    // Stream buffers are useful only while supervising. Keep the final audit
    // and worker statuses for history without retaining the streamed payloads.
    for (const worker of state.workers) worker.logs = [];
    pruneWatchdogs();
  }
}
