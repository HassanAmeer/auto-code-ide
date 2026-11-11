// @effect-diagnostics globalDateInEffect:off globalRandomInEffect:off nodeBuiltinImport:off globalTimers:off globalTimersInEffect:off preferSchemaOverJson:off globalDate:off globalFetchInEffect:off globalFetch:off globalConsoleInEffect:off
/**
 * Super Agent Manager
 *
 * Orchestrates the Manager → Workers → Reviewer flow:
 *   1. Super Agent receives task from user
 *   2. Splits task into parallel Worker Sub-Agents (isolated worktrees)
 *   3. Workers write code concurrently
 *   4. Reviewer Sub-Agent verifies merged code (build, preview, checklist)
 *   5. Super Agent receives FINAL verified result only — stays free for chat/discussion/brainstorming/new tasks
 *
 * The Super Agent is NEVER blocked inside worker/reviewer loops.
 */
import * as NodeFS from "node:fs";
import * as NodePath from "node:path";
import type { SubtaskPlanItem, TaskStage } from "./types.ts";
import { decomposeTask, type SubtaskPlanItem as SubtaskItem } from "./taskDecomposer.ts";
import {
  createWorkerWorktree,
  mergeWorkerWorktree,
  cleanupWorkerWorktree,
} from "./worktreeRunner.ts";
import { executeOpenCodeTask } from "./opencodeBridge.ts";
import { reviewerSubAgent, type ReviewerSubAgentInput } from "./reviewerSubAgent.ts";

export interface SuperAgentManagerInput {
  projectId: string;
  projectName: string;
  projectRoot: string;
  taskTitle: string;
  prompt: string;
  model?: string;
  clientNotificationTarget?: string;
}

export interface SuperAgentManagerResult {
  ok: boolean;
  taskId: string;
  workersCompleted: number;
  workersTotal: number;
  filesModified: string[];
  previewUrl: string;
  reviewPassed: boolean;
  reviewerMessage: string;
  message: string;
  // Super agent stays free — this is what user-facing chat shows
  superAgentFree: boolean;
}

export class SuperAgentManager {
  readonly name = "Super Agent Manager";

  /**
   * Entry point called by Super Agent when user gives a task.
   * Returns immediately with a tracking ID; workers run in background.
   * Super agent remains available for discussion while workers operate.
   */
  async dispatchTask(
    input: SuperAgentManagerInput,
    onLog?: (msg: string) => void,
  ): Promise<SuperAgentManagerResult> {
    const {
      projectId,
      projectName,
      projectRoot,
      taskTitle,
      prompt,
      model = "deepseek-v4.1-flash-free",
      clientNotificationTarget,
    } = input;

    const taskId = `task-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const logStep = (step: string, msg: string) => {
      const formatted = `[${new Date().toLocaleTimeString()}] [${step.toUpperCase()}] ${msg}`;
      onLog?.(formatted);
    };

    logStep("init", `Super Agent Manager dispatching task: "${taskTitle}" (id: ${taskId})`);
    logStep("superAgent", "Super Agent is FREE — available for chat, discussion, brainstorming");

    // ── Step 1: Split task into parallel subtasks ──
    logStep("decompose", "Splitting task into parallel worker subtasks...");
    const subtasks: SubtaskPlanItem[] = decomposeTask(taskTitle, prompt, projectRoot);
    logStep(
      "decompose",
      `Task split into ${subtasks.length} subtask(s): ${subtasks.map((s) => s.title).join(", ")}`,
    );

    // ── Step 2: Create isolated worktrees for each worker ──
    const workerAllocations = subtasks.map((st) => {
      const allocation = createWorkerWorktree(projectRoot, `${taskId}-${st.order}`);
      logStep(
        `worker-${st.order}`,
        allocation.isIsolated
          ? `Isolated worktree allocated: ${allocation.worktreePath}`
          : `Running in project root (worktree fallback): ${allocation.error}`,
      );
      return { st, allocation };
    });

    // ── Step 3: Dispatch workers in parallel ──
    logStep("workers", `Dispatching ${workerAllocations.length} worker(s) in parallel...`);
    const parallelResults = await Promise.allSettled(
      workerAllocations.map(async ({ st, allocation }) => {
        logStep(`worker-${st.order}`, `Worker started: "${st.title}"`);

        const subtaskRes = await executeOpenCodeTask({
          worktreePath: allocation.worktreePath,
          projectName,
          taskTitle: st.title,
          prompt: st.description,
          model,
          onLog: (m) => logStep(`worker-${st.order}`, m),
        });

        return { st, allocation, subtaskRes };
      }),
    );

    // ── Step 4: Merge completed workers back ──
    logStep("merge", "Merging completed worker branches into main workspace...");
    const filesModified: string[] = [];
    let workersCompleted = 0;

    for (const settled of parallelResults) {
      if (settled.status === "rejected") {
        logStep("merge", `Worker crashed: ${settled.reason}`);
        continue;
      }
      const { st, allocation, subtaskRes } = settled.value;

      if (!subtaskRes.ok || subtaskRes.filesModified.length === 0) {
        logStep(
          "merge",
          `Worker ${st.order} produced no changes — skipping merge: ${subtaskRes.error || "empty"}`,
        );
        if (allocation.isIsolated) {
          cleanupWorkerWorktree(projectRoot, allocation.worktreePath, allocation.branchName);
        }
        continue;
      }

      subtaskRes.filesModified.forEach((f) => filesModified.push(f));
      workersCompleted++;

      const mergeRes = mergeWorkerWorktree(
        projectRoot,
        allocation.worktreePath,
        allocation.branchName,
        st.title,
      );

      if (mergeRes.ok) {
        logStep(
          "merge",
          `Worker ${st.order} merged${mergeRes.autoHealed ? " (auto-healed conflicts)" : ""} cleanly`,
        );
      } else {
        logStep("merge", `Worker ${st.order} merge warning: ${mergeRes.error}`);
      }

      cleanupWorkerWorktree(projectRoot, allocation.worktreePath, allocation.branchName);
    }

    logStep(
      "merge",
      `Merge complete: ${workersCompleted}/${workerAllocations.length} workers merged, ${filesModified.length} file(s) modified`,
    );

    // ── Step 5: Reviewer Sub-Agent verifies merged workspace ──
    logStep("reviewer", "Reviewer Sub-Agent starting verification of merged code...");
    const reviewerInput: ReviewerSubAgentInput = {
      projectName,
      projectRoot,
      taskTitle,
      prompt,
      selectedModel: model,
      maxReviewRounds: 1,
    };

    const reviewerResult = await reviewerSubAgent.reviewMergedWorkspace(reviewerInput, (msg) =>
      logStep("reviewer", msg),
    );

    // ── Step 6: Final result to Super Agent ──
    const ok = workersCompleted > 0 && reviewerResult.passed;
    logStep(
      "complete",
      ok
        ? `Task complete and verified. Super Agent free for new tasks/discussion.`
        : `Task completed with issues. Reviewer message: ${reviewerResult.message}`,
    );

    return {
      ok,
      taskId,
      workersCompleted,
      workersTotal: workerAllocations.length,
      filesModified,
      previewUrl: reviewerResult.previewUrl,
      reviewPassed: reviewerResult.passed,
      reviewerMessage: reviewerResult.message,
      message: ok
        ? `✓ Task "${taskTitle}" completed: ${workersCompleted}/${workerAllocations.length} workers done, code verified by Reviewer Sub-Agent. Super Agent ready for next task.`
        : `⚠️ Task "${taskTitle}" finished: ${workersCompleted}/${workerAllocations.length} workers done. ${reviewerResult.message}`,
      superAgentFree: true,
    };
  }
}

export const superAgentManager = new SuperAgentManager();
