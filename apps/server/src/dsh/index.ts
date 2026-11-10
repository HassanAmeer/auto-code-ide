// @effect-diagnostics globalDateInEffect:off globalRandomInEffect:off nodeBuiltinImport:off globalTimers:off globalTimersInEffect:off preferSchemaOverJson:off globalDate:off globalFetchInEffect:off globalFetch:off globalConsoleInEffect:off
import type { WorkerDispatchParams, SubtaskPlanItem } from "./types.ts";
import {
  createWorkerWorktree,
  mergeWorkerWorktree,
  cleanupWorkerWorktree,
} from "./worktreeRunner.ts";
import {
  registerWorkerTelemetry,
  updateWorkerTelemetryStatus,
  registerGoalTelemetry,
  updateGoalTelemetryStatus,
  deriveSpecialistRole,
} from "./workerRegistry.ts";
import { isWorkerAborted, clearWorkerAbort } from "./abortRegistry.ts";
import { executeOpenCodeTask } from "./opencodeBridge.ts";
import { executeAutonomousReviewLoop } from "./selfReviewLoop.ts";
import { decomposeTask } from "./taskDecomposer.ts";
import { sendWhatsAppMessage, fetchWhatsAppSettings } from "../botBridge.ts";
import { isSkillEnabled, getDshWorkerSkillPrompt } from "@t3tools/shared/superpowerSkills";
import {
  createSupervisorWorkerEnvelope,
  formatSupervisorWorkerPrompt,
  type SupervisorWorkerTaskEnvelope,
} from "@t3tools/shared/taskEnvelope";

export * from "./types.ts";
export * from "./worktreeRunner.ts";
export * from "./selfReviewLoop.ts";
export * from "./opencodeBridge.ts";
export * from "./taskDecomposer.ts";

export interface HarnessExecutionResult {
  ok: boolean;
  workerId: string;
  projectId: string;
  projectName: string;
  taskTitle: string;
  status: "completed" | "error";
  progress: number;
  previewUrl: string;
  checklist: any[];
  subtasks: SubtaskPlanItem[];
  filesModified?: string[] | undefined;
  reviewLoop: any[];
  errorsFixed: string[];
  streamingLogs: string[];
  summary: string;
  clientNotificationSent?: boolean | undefined;
  error?: string | undefined;
}

/**
 * Master Autonomous Execution Orchestrator:
 * 1. Spawns isolated Git Worktree
 * 2. Runs OpenCode coding session
 * 3. Executes 3-Level Review & Auto-Correction Loop
 * 4. Merges worktree safely back to main branch
 * 5. Notifies priority client via WhatsApp (if specified or configured)
 */
export async function runAutonomousHarnessWorkflow(
  params: WorkerDispatchParams & {
    projectId: string;
    projectName: string;
    projectRoot: string;
    onLog?: (msg: string) => void;
  },
): Promise<HarnessExecutionResult> {
  const {
    projectId,
    projectName,
    projectRoot,
    taskTitle,
    prompt,
    model = "default",
    clientNotificationTarget,
    onLog,
  } = params;

  const logs: string[] = [];
  const logStep = (step: string, msg: string) => {
    const formatted = `[${new Date().toLocaleTimeString()}] [${step.toUpperCase()}] ${msg}`;
    logs.push(formatted);
    onLog?.(formatted);
  };

  const taskId = `${Date.now()}`;
  logStep(
    "init",
    `🚀 Autonomous Harness Worker [worker-${taskId}] started for "${taskTitle}" (${model}).`,
  );

  // Check if dispatching-parallel-agents Superpower skill is active
  const isParallelSkillActive = isSkillEnabled("dispatching-parallel-agents", projectRoot);
  const parallelSkillPrompt = isParallelSkillActive ? getDshWorkerSkillPrompt(projectRoot) : "";
  if (isParallelSkillActive) {
    logStep(
      "skill",
      "⚡ Superpower Active: [dispatching-parallel-agents] - Isolated worker worktree & domain boundaries enabled.",
    );
  }

  // 1. Supervisor Task Decomposition (Bara Kaam Chotay Tukron Mein Baantna)
  const subtasks = decomposeTask(taskTitle, prompt, projectRoot);
  const mainGoalId = `goal-${taskId}`;

  // Register telemetry for primary supervisor goal
  registerGoalTelemetry({
    id: mainGoalId,
    title: taskTitle,
    status: "running",
    projectName,
    projectId,
    createdAt: Date.now(),
  });

  if (subtasks.length > 1) {
    logStep(
      "plan",
      `📋 Supervisor decomposed composite task into ${subtasks.length} milestones:\n` +
        subtasks
          .map((st) => `   • [Milestone ${st.order}/${subtasks.length}] ${st.title}`)
          .join("\n"),
    );

    // Register each milestone as an active goal
    subtasks.forEach((st) => {
      registerGoalTelemetry({
        id: `goal-${taskId}-${st.order}`,
        title: st.title,
        status: "running",
        workerId: `worker-${taskId}-${st.order}`,
        order: st.order,
        projectName,
        projectId,
        createdAt: Date.now(),
      });
    });
  } else {
    logStep("plan", `📋 Task confirmed as single atomic milestone: "${taskTitle}".`);
  }

  // 2. Concurrency Pool: Spawn isolated Git Worktree(s) for true parallel execution
  const isMultiTask = subtasks.length > 1;
  logStep(
    "worktree",
    isMultiTask
      ? `🌿 Concurrency Pool: Spawning ${subtasks.length} parallel isolated Git Worktrees for concurrent subagents...`
      : `🌿 Spawning isolated Git Worktree for safe execution...`,
  );

  const workerAllocations = subtasks.map((st) => {
    const workerSubId = isMultiTask ? `${taskId}-${st.order}` : taskId;
    const allocation = createWorkerWorktree(projectRoot, workerSubId);
    logStep(
      `worker-${st.order}`,
      allocation.isIsolated
        ? `✓ [Parallel Worker #${st.order}] Isolated Worktree allocated at: ${allocation.worktreePath} (Branch: ${allocation.branchName}).`
        : `ℹ️ [Parallel Worker #${st.order}] Running in project root (${allocation.error || "standard mode"}).`,
    );
    return {
      st,
      allocation,
      workerId: `worker-${workerSubId}`,
    };
  });

  // 3. Concurrent Subtask Execution via OpenCode Engine & DeepSeek Harness (Promise.all)
  const filesModifiedSet = new Set<string>();

  const parallelResults = await Promise.all(
    workerAllocations.map(async ({ st, allocation, workerId }) => {
      if (isWorkerAborted(workerId)) {
        st.status = "failed";
        updateWorkerTelemetryStatus(workerId, "cancelled", { completedAt: Date.now() });
        if (subtasks.length > 1) {
          updateGoalTelemetryStatus(`goal-${taskId}-${st.order}`, "cancelled", {
            completedAt: Date.now(),
          });
        }
        clearWorkerAbort(workerId);
        logStep(
          `worker-${st.order}`,
          `⛔ [Worker #${st.order}] Aborted by user before execution — output skipped.`,
        );
        return null;
      }
      st.status = "in_progress";
      const specialistRole = deriveSpecialistRole(st.title, st.category, st.order);
      logStep(
        `worker-${st.order}`,
        `⚙️ [Parallel Worker #${st.order}: ${specialistRole}] Started executing: "${st.title}"...`,
      );

      const milestoneEnvelope = createSupervisorWorkerEnvelope({
        task:
          subtasks.length > 1
            ? `[Milestone ${st.order}/${subtasks.length} for ${projectName}]: ${st.title}`
            : taskTitle,
        requirements: [st.description, ...(params.envelope?.rules || [])],
        constraints: [
          `Focus strictly on milestone ${st.order} deliverables without breaking existing code.`,
        ],
        expectedOutput:
          st.category === "frontend_ui"
            ? "Clean HTML/TSX/CSS UI implementation verified for live preview rendering."
            : "Complete, production-ready implementation of types, state models, and business logic.",
        projectName,
        targetPath: allocation.worktreePath,
      });

      const basePrompt = formatSupervisorWorkerPrompt(milestoneEnvelope);
      const subtaskPrompt = parallelSkillPrompt
        ? `${parallelSkillPrompt}\n\n${basePrompt}`
        : basePrompt;

      // Register active worker telemetry for live dashboard / bot chat screen
      registerWorkerTelemetry({
        id: workerId,
        role: specialistRole,
        status: "running",
        model: model.includes("deepseek") ? "DeepSeek V4.1" : model || "DeepSeek V4.1",
        cwd: allocation.worktreePath,
        goal: st.title,
        projectName,
        projectId,
        startedAt: Date.now(),
      });

      logStep(
        `worker-${st.order}`,
        `✉️ Dispatched Supervisor-to-Worker Task Envelope (${milestoneEnvelope.rules.length} strict bounds).`,
      );

      const subtaskRes = await executeOpenCodeTask({
        worktreePath: allocation.worktreePath,
        projectName,
        taskTitle: st.title,
        prompt: subtaskPrompt,
        model,
        onLog: (m) => logStep(`worker-${st.order}`, m),
        abortCheck: () => isWorkerAborted(workerId),
      });

      if (isWorkerAborted(workerId)) {
        st.status = "failed";
        updateWorkerTelemetryStatus(workerId, "cancelled", { completedAt: Date.now() });
        if (subtasks.length > 1) {
          updateGoalTelemetryStatus(`goal-${taskId}-${st.order}`, "cancelled", {
            completedAt: Date.now(),
          });
        }
        clearWorkerAbort(workerId);
        logStep(
          `worker-${st.order}`,
          `⛔ [Worker #${st.order}] Aborted by user — model output discarded.`,
        );
        return null;
      }

      if (subtaskRes.ok) {
        st.status = "completed";
        subtaskRes.filesModified.forEach((f) => filesModifiedSet.add(f));
        updateWorkerTelemetryStatus(workerId, "completed", {
          progress: 100,
          completedAt: Date.now(),
          filesModified: subtaskRes.filesModified,
        });
        updateGoalTelemetryStatus(`goal-${taskId}-${st.order}`, "completed", {
          completedAt: Date.now(),
        });
        clearWorkerAbort(workerId);
        logStep(
          `worker-${st.order}`,
          `✓ [Parallel Worker #${st.order}] "${st.title}" completed (${subtaskRes.filesModified.length} files).`,
        );
      } else {
        st.status = "failed";
        updateWorkerTelemetryStatus(workerId, "failed", {
          completedAt: Date.now(),
          error:
            subtaskRes.error ||
            (subtaskRes.filesModified.length === 0
              ? "Worker produced 0 files (model error, rate-limit, or no actionable steps)"
              : "Worker reported failure"),
        });
        updateGoalTelemetryStatus(`goal-${taskId}-${st.order}`, "failed", {
          completedAt: Date.now(),
        });
        clearWorkerAbort(workerId);
        logStep(
          `worker-${st.order}`,
          `⚠️ [Parallel Worker #${st.order}] Notice: finished with status failed, proceeding to merge.`,
        );
      }

      return { st, allocation, workerId, subtaskRes };
    }),
  );

  // 4. Sequential Merge of Parallel Worktree Branches into Main Workspace with Conflict Auto-Resolution
  logStep("merge", `🔀 Merging parallel worker branches back into main workspace...`);
  // Aborted workers produced nothing to merge — they are excluded from the merge phase.
  const runnableResults = parallelResults.filter(
    (result): result is NonNullable<(typeof parallelResults)[number]> => result !== null,
  );
  for (const result of runnableResults) {
    const { st, allocation, subtaskRes } = result;
    // Nothing to merge when the model produced zero files (failed/empty branch).
    if (!subtaskRes.ok || subtaskRes.filesModified.length === 0) {
      if (allocation.isIsolated) {
        logStep(
          "merge",
          `⏭️ [Worker #${st.order}] No file changes produced (${subtaskRes.error ? "error: " + subtaskRes.error : "empty output"}) — skipping merge and cleaning up worktree.`,
        );
        cleanupWorkerWorktree(projectRoot, allocation.worktreePath, allocation.branchName);
      }
      continue;
    }
    if (allocation.isIsolated) {
      logStep("merge", `🔀 Merging [Worker #${st.order}] branch (${allocation.branchName})...`);
      const mergeRes = mergeWorkerWorktree(
        projectRoot,
        allocation.worktreePath,
        allocation.branchName,
        st.title,
      );
      if (mergeRes.ok) {
        logStep(
          "merge",
          mergeRes.autoHealed
            ? `✓ [Worker #${st.order}] Merged and auto-healed conflicts (${mergeRes.resolvedFiles?.length || 0} files).`
            : `✓ [Worker #${st.order}] Merged cleanly into main.`,
        );
      } else {
        logStep(
          "merge",
          `⚠️ Merge notice for [Worker #${st.order}]: ${mergeRes.error || "unresolved"}`,
        );
      }
      cleanupWorkerWorktree(projectRoot, allocation.worktreePath, allocation.branchName);
    }
  }

  // 5. Autonomous 3-Level Review & Auto-Heal Loop on Merged Workspace.
  // Skipped entirely when no worker produced a milestone — claiming a clean
  // review on top of zero merged changes would be fabrication.
  const anyCompleted = runnableResults.some(({ subtaskRes }) => subtaskRes.ok);
  const doneCount = runnableResults.filter(({ subtaskRes }) => subtaskRes.ok).length;
  let reviewResult: Awaited<ReturnType<typeof executeAutonomousReviewLoop>> | null = null;
  if (anyCompleted) {
    logStep("review", `🔍 Beginning 3-Level Autonomous Review Loop across merged workspace...`);
    reviewResult = await executeAutonomousReviewLoop({
      worktreePath: projectRoot,
      projectName,
      taskTitle,
      prompt,
      selectedModel: model,
      onLog: (m) => logStep("review", m),
      abortCheck: () => workerAllocations.some(({ workerId }) => isWorkerAborted(workerId)),
    });
  } else {
    logStep(
      "review",
      "ℹ️ Skipping review — no milestone completed (aborted or failed). Nothing to verify.",
    );
  }

  // 6. Optional Auto WhatsApp Notification to the configured priority client.
  // Only when a client target is configured or auto-notify is enabled — never a hardcoded number.
  let clientNotified = false;
  try {
    const settings = (await fetchWhatsAppSettings().catch(() => null)) as any;
    const priorityTargets: Array<{ jid?: string; phoneNumber?: string }> =
      settings?.priorityTargets || [];
    const activePriorityJid = settings?.activePriorityJid;

    const targetRecipient = clientNotificationTarget || activePriorityJid || null;

    if (targetRecipient && reviewResult) {
      logStep("whatsapp", `📱 Notifying priority client (${targetRecipient}) via WhatsApp...`);
      const waRes = await sendWhatsAppMessage({
        to: targetRecipient,
        text: `Assalam-o-Alaikum! Project update: "${taskTitle}" — ${doneCount}/${subtasks.length} milestones complete.\n\nLive Preview: ${reviewResult.previewUrl}`,
      });
      if (waRes?.ok) {
        clientNotified = true;
        logStep("whatsapp", `✓ WhatsApp preview delivery sent to ${targetRecipient}.`);
      }
    } else if (settings?.autoNotifyOnCompletion && priorityTargets.length > 0 && reviewResult) {
      const fallbackTarget = priorityTargets[0]?.jid;
      if (fallbackTarget) {
        logStep("whatsapp", `📱 Notifying priority client (${fallbackTarget}) via WhatsApp...`);
        const waRes = await sendWhatsAppMessage({
          to: fallbackTarget,
          text: `Assalam-o-Alaikum! Project update: "${taskTitle}" — ${doneCount}/${subtasks.length} milestones complete.\n\nLive Preview: ${reviewResult.previewUrl}`,
        });
        if (waRes?.ok) {
          clientNotified = true;
          logStep("whatsapp", `✓ WhatsApp preview delivery sent to ${fallbackTarget}.`);
        }
      }
    }
  } catch (err) {
    logStep(
      "whatsapp",
      `⚠️ WhatsApp notification skipped: ${err instanceof Error ? err.message : String(err)}`,
    );
  }

  logStep(
    "complete",
    anyCompleted
      ? `🎉 Task done: ${doneCount}/${subtasks.length} milestones completed${reviewResult ? `. Live preview: ${reviewResult.previewUrl}` : "."}`
      : `🛑 Task ended without producing changes (${subtasks.length - doneCount}/${subtasks.length} milestones aborted or failed).`,
  );

  // Mark main goal completed in telemetry
  updateGoalTelemetryStatus(mainGoalId, anyCompleted ? "completed" : "failed", {
    completedAt: Date.now(),
  });

  return {
    ok: anyCompleted,
    workerId: `worker-${taskId}`,
    projectId,
    projectName,
    taskTitle,
    status: anyCompleted ? "completed" : "error",
    progress: anyCompleted ? 100 : 0,
    previewUrl: reviewResult?.previewUrl ?? "",
    checklist: reviewResult?.checklist ?? [],
    subtasks,
    reviewLoop: reviewResult?.rounds ?? [],
    errorsFixed: reviewResult?.allFixedIssues ?? [],
    streamingLogs: logs,
    clientNotificationSent: clientNotified,
    filesModified: Array.from(filesModifiedSet),
    summary: anyCompleted
      ? `Autonomous Harness Worker completed "${taskTitle}" (${doneCount}/${subtasks.length} milestones).${reviewResult ? ` 3-Level Review passed (${reviewResult.rounds.length} rounds). Auto-healed ${reviewResult.allFixedIssues.length} issues.` : ""}`
      : `Task "${taskTitle}" ended without producing changes — milestones aborted or failed; no files were merged.`,
  };
}

export * from "./conflictResolver.ts";
