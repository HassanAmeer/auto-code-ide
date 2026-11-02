/**
 * Autonomous DeepSeek Harness & Worker Types
 * Defines tickets, worktree isolation states, review rounds, and checklist audits.
 */

export type TaskStage =
  | "PENDING"
  | "SPAWNING_WORKTREE"
  | "OPENCODE_CODING"
  | "LEVEL1_SYNTAX_CHECK"
  | "LEVEL2_PREVIEW_CHECK"
  | "LEVEL3_CHECKLIST_AUDIT"
  | "AUTO_HEALING"
  | "MERGING_WORKTREE"
  | "COMPLETED"
  | "FAILED";

export interface ChecklistItem {
  id: string;
  requirement: string;
  status: "pending" | "passed" | "missing" | "failed";
  evidence?: string | undefined;
}

export interface ReviewRoundResult {
  round: number;
  phase: string;
  syntaxClean: boolean;
  previewHttpStatus?: number | undefined;
  errorsFound: string[];
  autoHealedPatches: string[];
  status: "verified_clean" | "repaired" | "retrying" | "fatal";
}

export interface WorktreeSession {
  taskId: string;
  taskTitle: string;
  projectName: string;
  projectRoot: string;
  worktreePath: string;
  branchName: string;
  stage: TaskStage;
  model: string;
  checklist: ChecklistItem[];
  reviewRounds: ReviewRoundResult[];
  previewUrl?: string | undefined;
  createdAt: number;
  completedAt?: number | undefined;
  error?: string | undefined;
}

export interface WorkerDispatchParams {
  projectIdOrName: string;
  taskTitle: string;
  prompt: string;
  model?: string | undefined;
  stream?: boolean | undefined;
  clientNotificationTarget?: string | undefined;
}
