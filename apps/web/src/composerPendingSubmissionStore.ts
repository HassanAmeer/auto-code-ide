import { scopedThreadKey, scopeThreadRef } from "@t3tools/client-runtime/environment";
import type { StartThreadTurnInput } from "@t3tools/client-runtime/operations";
import {
  CommandId,
  EnvironmentId,
  MessageId,
  ThreadId,
  type ScopedThreadRef,
} from "@t3tools/contracts";
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

import { resolveStorage } from "./lib/storage";

export const PENDING_COMPOSER_SUBMISSION_STORAGE_KEY = "t3code:pending-composer-submissions:v1";

export type PendingComposerSubmissionPhase = "dispatching" | "ambiguous";

export type PendingComposerSubmissionPayload = StartThreadTurnInput;

export interface PendingComposerSubmission {
  readonly environmentId: EnvironmentId;
  readonly threadId: ThreadId;
  readonly commandId: CommandId;
  readonly messageId: MessageId;
  readonly phase: PendingComposerSubmissionPhase;
  readonly createdAt: string;
  readonly payload: PendingComposerSubmissionPayload;
}

interface PendingComposerSubmissionStoreState {
  readonly submissionsByThreadKey: Record<string, PendingComposerSubmission>;
  readonly setPendingSubmission: (submission: PendingComposerSubmission) => void;
  readonly markPendingSubmissionAmbiguous: (threadRef: ScopedThreadRef) => void;
  readonly removePendingSubmission: (threadRef: ScopedThreadRef) => void;
}

const isPendingSubmission = (value: unknown): value is PendingComposerSubmission => {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<PendingComposerSubmission>;
  return (
    typeof candidate.environmentId === "string" &&
    typeof candidate.threadId === "string" &&
    typeof candidate.commandId === "string" &&
    typeof candidate.messageId === "string" &&
    (candidate.phase === "dispatching" || candidate.phase === "ambiguous") &&
    typeof candidate.createdAt === "string" &&
    !!candidate.payload &&
    typeof candidate.payload === "object" &&
    candidate.payload.threadId === candidate.threadId &&
    candidate.payload.message?.messageId === candidate.messageId
  );
};

export const usePendingComposerSubmissionStore = create<PendingComposerSubmissionStoreState>()(
  persist(
    (set) => ({
      submissionsByThreadKey: {},
      setPendingSubmission: (submission) =>
        set((state) => ({
          submissionsByThreadKey: {
            ...state.submissionsByThreadKey,
            [scopedThreadKey(scopeThreadRef(submission.environmentId, submission.threadId))]:
              submission,
          },
        })),
      markPendingSubmissionAmbiguous: (threadRef) =>
        set((state) => {
          const threadKey = scopedThreadKey(threadRef);
          const submission = state.submissionsByThreadKey[threadKey];
          if (!submission) return state;
          return {
            submissionsByThreadKey: {
              ...state.submissionsByThreadKey,
              [threadKey]: { ...submission, phase: "ambiguous" },
            },
          };
        }),
      removePendingSubmission: (threadRef) =>
        set((state) => {
          const threadKey = scopedThreadKey(threadRef);
          if (!state.submissionsByThreadKey[threadKey]) return state;
          const next = { ...state.submissionsByThreadKey };
          delete next[threadKey];
          return { submissionsByThreadKey: next };
        }),
    }),
    {
      name: PENDING_COMPOSER_SUBMISSION_STORAGE_KEY,
      storage: createJSONStorage(() =>
        resolveStorage(typeof window !== "undefined" ? window.localStorage : undefined),
      ),
      version: 1,
      migrate: (persisted) => {
        const submissions = (persisted as { submissionsByThreadKey?: unknown } | null)
          ?.submissionsByThreadKey;
        return {
          submissionsByThreadKey:
            submissions && typeof submissions === "object"
              ? Object.fromEntries(
                  Object.entries(submissions).filter(([, submission]) =>
                    isPendingSubmission(submission),
                  ),
                )
              : {},
        };
      },
      partialize: ({ submissionsByThreadKey }) => ({ submissionsByThreadKey }),
    },
  ),
);

export function getPendingComposerSubmission(
  threadRef: ScopedThreadRef,
): PendingComposerSubmission | null {
  return (
    usePendingComposerSubmissionStore.getState().submissionsByThreadKey[
      scopedThreadKey(threadRef)
    ] ?? null
  );
}

export function clearPendingComposerSubmission(threadRef: ScopedThreadRef): void {
  usePendingComposerSubmissionStore.getState().removePendingSubmission(threadRef);
}
