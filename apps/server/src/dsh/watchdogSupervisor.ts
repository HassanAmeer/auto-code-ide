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
} from "./workerRegistry.ts";
import { isWorkerAborted, clearWorkerAbort } from "./abortRegistry.ts";

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
 * The active Manager → Watchdog flow mode. "watchdog" (default) routes every
 * Manager task through the watchdog; "direct" keeps the plain model path.
 */
export const SUPER_AGENT_FLOW_MODE_KEY = "super_agent_flow_mode";

/** Live snapshot for the UI watchdog card. */
export function getWatchdogSnapshot(filter?: {
  projectName?: string | undefined;
  projectId?: string | undefined;
}): {
  ok: boolean;
  watchdogs: WatchdogState[];
  active: number;
  flowMode: "watchdog" | "direct";
  timestamp: number;
} {
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
    flowMode: "watchdog",
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
  let passed = 0;
  for (const item of checklist) {
    const keywords = item.requirement
      .toLowerCase()
      .split(/\s+/)
      .filter((k) => k.length > 3);
    const matched = keywords.some((k) => haystack.includes(k));
    if (matched || (haystack.length > 50 && keywords.length === 0)) {
      item.status = "passed";
      item.evidence = "Matched changes in the merged diff";
      passed += 1;
    } else {
      item.status = "missing";
      item.evidence = "No matching change found in the merged diff";
      missing.push(item.requirement);
    }
  }
  return { passed, missing };
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
  const pool = override.length > 0 ? override : [...WATCHDOG_FALLBACK_MODELS];
  const lanes: string[] = [];
  for (let i = 0; i < Math.max(1, workerCount); i++) {
    lanes.push(i === 0 ? baseModel : (pool[i % pool.length] ?? baseModel));
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
}): Promise<{ ok: boolean; output: string }> {
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
}): Promise<{ passed: boolean; reason: string }> {
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
        prompt,
        model: opts.model,
        onLog: (m) => opts.onLog?.(m),
      });
      const content = res.outputSummary ?? "";
      // The verifier answers in its log stream; treat an explicit FAIL as a failure.
      const failed = /\bFAIL\b/i.test(content);
      const passed = res.ok && !failed;
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
    checklist: [],
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

    // Park a few worktrees ahead of time so the first dispatch is instant too.
    prewarmWorktrees(projectRoot);

    const allocations = planned.map((st) => ({
      st,
      allocation: acquireWorktree(projectRoot, `${watchdogId}-${st.order}`),
    }));

    // Each worker gets its own model lane so the calls really run in parallel
    // instead of queueing behind one provider's rate limit.
    const laneModels = resolveWorkerLaneModels(model, allocations.length, params.lanes);

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
            lines.push(m);
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
              projectRoot,
              taskTitle: st.title,
              prompt: st.description,
              model: fallback,
              onLog: workerLog,
            });
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
          return { st, allocation, workerId, res: abortedResult };
        }

        return { st, allocation, workerId, res };
      }),
    );

    // ── PHASE 2: Review every worker's output IN PARALLEL (cheap, no build) ──
    state.status = "reviewing";
    touch("Reviewing all sub-agent outputs in parallel");

    const reviewed = await Promise.all(
      settled.map(async (outcome) => {
        if (outcome.status === "rejected") {
          return { crashed: true as const, reason: String(outcome.reason) };
        }
        const { st, allocation, workerId, res } = outcome.value;
        const row = state.workers.find((w) => w.id === workerId);
        if (!row) return { crashed: true as const, reason: "row missing" };

        if (!res.ok) {
          const cancelled = res.error === "Stopped by user";
          row.status = cancelled ? "cancelled" : "failed";
          row.reviewNotes.push(res.error ?? "worker failed");
          if (!cancelled) {
            state.issues.push(`${row.role}: ${res.error ?? "worker failed"}`);
          }
          updateWorkerTelemetryStatus(workerId, cancelled ? "cancelled" : "failed", {
            completedAt: now(),
            error: res.error ?? "worker failed",
          });
          return { crashed: false as const, workerId, st, allocation, changed: [] as string[] };
        }

        const changed = listChangedFiles(allocation.worktreePath);
        row.filesChanged = changed.length;
        const reviewIssues = reviewWorkerOutput(changed, allocation.worktreePath);
        row.reviewNotes.push(...reviewIssues);
        state.issues.push(...reviewIssues);
        row.status = "completed";
        updateWorkerTelemetryStatus(workerId, "completed", {
          completedAt: now(),
          filesModified: changed,
        });
        return { crashed: false as const, workerId, st, allocation, changed, reviewIssues };
      }),
    );

    // ── PHASE 3: Merge workers SEQUENTIALLY (git needs a stable order) ──
    const mergeable = reviewed.filter(
      (r): r is Extract<typeof r, { crashed: false }> =>
        !r.crashed && r.reviewIssues.length === 0 && r.changed.length > 0,
    );
    const allChangedFiles = reviewed.flatMap((r) => (r.crashed ? [] : r.changed));

    for (const r of reviewed) {
      if (r.crashed) {
        state.issues.push(`Worker crashed: ${r.reason}`);
        continue;
      }
      const row = state.workers.find((w) => w.id === r.workerId);
      if (!row) continue;
      if (r.reviewIssues.length > 0) {
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
      releaseWorktree(projectRoot, r.allocation);
    }

    // ── PHASE 3.5: Requirement checklist audit ──
    // Build and tests can pass while a requirement was never implemented.
    // The checklist is traced against the real merged diff.
    let mergedDiff = "";
    if (mergeable.length > 0) {
      state.status = "reviewing";
      touch("Auditing requirements against the merged diff");
      mergedDiff = getWorktreeDiff(projectRoot);
      const audit = auditRequirementChecklist(state.checklist, mergedDiff);
      if (audit.missing.length > 0) {
        for (const missing of audit.missing) {
          state.issues.push(`Requirement not found in changes: ${missing}`);
        }
        touch(`${audit.missing.length} requirement(s) missing from the changes`);
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
      state.status = "building";
      touch(`Build required — running ${pm} build once for the merged workspace`);
      const buildCmd =
        pm === "pnpm" ? "pnpm run build" : pm === "yarn" ? "yarn build" : "npm run build";
      const build = runCommand(buildCmd, projectRoot, BUILD_TIMEOUT_MS);
      for (const row of state.workers) {
        if (row.status === "completed") {
          row.buildRan = true;
          row.buildPassed = build.ok;
        }
      }
      if (!build.ok) {
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
        });
        if (repair.ok) {
          const rebuild = runCommand(buildCmd, projectRoot, BUILD_TIMEOUT_MS);
          for (const row of state.workers) {
            if (row.status === "completed") row.buildPassed = rebuild.ok;
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
      state.status = "testing";
      touch(`Running ${pm} test suite once`);
      const testCmd = pm === "pnpm" ? "pnpm run test" : pm === "yarn" ? "yarn test" : "npm test";
      const test = runCommand(testCmd, projectRoot, BUILD_TIMEOUT_MS);
      for (const row of state.workers) {
        if (row.status === "completed") {
          row.testRan = true;
          row.testPassed = test.ok;
        }
      }
      if (!test.ok) {
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
        });
        if (repair.ok) {
          const retest = runCommand(testCmd, projectRoot, BUILD_TIMEOUT_MS);
          for (const row of state.workers) {
            if (row.status === "completed") row.testPassed = retest.ok;
          }
          if (retest.ok) {
            touch("Tests repaired by sub-agent — verified clean");
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
    if (mergeable.length > 0) {
      state.status = "reviewing";
      touch("Verification sub-agent checking the requirements");
      const requirements = state.checklist.map((c) => c.requirement);
      const verification = await runVerificationSubAgent({
        projectRoot,
        projectName,
        taskTitle,
        requirements,
        diff: mergedDiff,
        model,
        onLog: (m) => log?.(`[Watchdog/verify] ${m}`),
      });

      if (verification.passed) {
        state.checklist.forEach((c) => {
          if (c.status === "missing") {
            c.status = "passed";
            c.evidence = "Confirmed by the verification sub-agent";
          }
        });
        touch("Verification passed — requirements met");
      } else {
        state.recoveries += 1;
        state.issues.push(verification.reason);
        touch("Verification failed — dispatching fix sub-agent");
        const fix = await dispatchRepairSubAgent({
          projectRoot,
          projectName,
          taskTitle,
          reason: verification.reason,
          kind: "requirement",
          model,
          onLog: (m) => log?.(`[Watchdog/fix] ${m}`),
        });
        if (fix.ok) {
          const recheck = await runVerificationSubAgent({
            projectRoot,
            projectName,
            taskTitle,
            requirements,
            diff: getWorktreeDiff(projectRoot),
            model,
            onLog: (m) => log?.(`[Watchdog/verify] ${m}`),
          });
          if (recheck.passed) {
            touch("Fix applied — re-verified ✓");
          } else {
            state.issues.push(recheck.reason);
          }
        }
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
