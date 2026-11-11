// @effect-diagnostics globalDateInEffect:off globalRandomInEffect:off nodeBuiltinImport:off globalTimers:off globalTimersInEffect:off preferSchemaOverJson:off globalDate:off globalFetchInEffect:off globalFetch:off globalConsoleInEffect:off
/**
 * Reviewer Sub-Agent
 *
 * Dedicated agent that runs AFTER parallel workers finish their tasks.
 * Responsibilities:
 *   1. Collect all worker-merged code into the main workspace
 *   2. Run build check (Level 1)
 *   3. Run preview health check (Level 2)
 *   4. Run checklist audit vs git diff (Level 3)
 *   5. Auto-heal minor issues if build/preview fails
 *   6. Report final verified result back to Super Agent
 *
 * The Super Agent stays FREE — it only receives the final verified result
 * and can approve/reject or start a new discussion.
 */
import * as NodeFS from "node:fs";
import * as NodePath from "node:path";
import * as NodeChildProcess from "node:child_process";
import type { ReviewRoundResult, ChecklistItem } from "./types.ts";
import { extractChecklistFromPrompt, executeAutonomousReviewLoop } from "./selfReviewLoop.ts";

export interface ReviewerSubAgentInput {
  projectName: string;
  projectRoot: string;
  taskTitle: string;
  prompt: string;
  selectedModel: string;
  maxReviewRounds?: number;
}

export interface ReviewerSubAgentResult {
  ok: boolean;
  passed: boolean;
  reviewRounds: ReviewRoundResult[];
  checklist: ChecklistItem[];
  allFixedIssues: string[];
  previewUrl: string;
  error?: string | undefined;
  message: string;
}

export class ReviewerSubAgent {
  readonly name = "Reviewer Sub-Agent";

  /**
   * Run the full review cycle on the merged workspace.
   * This is the only agent that touches build/preview/verify —
   * workers just produce code, reviewer guarantees quality.
   */
  async reviewMergedWorkspace(
    input: ReviewerSubAgentInput,
    onLog?: (msg: string) => void,
  ): Promise<ReviewerSubAgentResult> {
    const {
      projectName,
      projectRoot,
      taskTitle,
      prompt,
      selectedModel,
      maxReviewRounds = 1, // Single focused pass — workers already wrote clean code
    } = input;

    onLog?.(`🔍 Reviewer Sub-Agent starting verification for: "${taskTitle}"`);

    try {
      const reviewResult = await executeAutonomousReviewLoop({
        worktreePath: projectRoot,
        projectName,
        taskTitle,
        prompt,
        selectedModel,
        maxRounds: maxReviewRounds,
        onLog: (msg) => {
          onLog?.(`[Reviewer] ${msg}`);
        },
      });

      const passed = reviewResult.passed;
      const ok = passed;

      onLog?.(
        passed
          ? `✓ Reviewer verified: code clean, build passed, preview healthy`
          : `⚠️ Reviewer: issues detected — ${reviewResult.allFixedIssues.length} auto-healed`,
      );

      return {
        ok,
        passed,
        reviewRounds: reviewResult.rounds,
        checklist: reviewResult.checklist,
        allFixedIssues: reviewResult.allFixedIssues,
        previewUrl: reviewResult.previewUrl,
        message: passed
          ? `Task "${taskTitle}" verified clean by Reviewer Sub-Agent`
          : `Task "${taskTitle}" review completed with ${reviewResult.allFixedIssues.length} fixes applied`,
      };
    } catch (err: any) {
      const errorMsg = err?.message || String(err);
      onLog?.(`✗ Reviewer Sub-Agent failed: ${errorMsg}`);
      return {
        ok: false,
        passed: false,
        reviewRounds: [],
        checklist: [],
        allFixedIssues: [],
        previewUrl: "",
        error: errorMsg,
        message: `Reviewer Sub-Agent error: ${errorMsg}`,
      };
    }
  }
}

export const reviewerSubAgent = new ReviewerSubAgent();
