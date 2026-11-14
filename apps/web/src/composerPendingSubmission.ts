import type { StartThreadTurnInput } from "@t3tools/client-runtime/operations";
import { isTransportConnectionErrorMessage } from "@t3tools/client-runtime/errors";
import type { AtomCommandResult } from "@t3tools/client-runtime/state/runtime";
import { squashAtomCommandFailure } from "@t3tools/client-runtime/state/runtime";

import {
  usePendingComposerSubmissionStore,
  type PendingComposerSubmission,
} from "./composerPendingSubmissionStore";

export type PendingComposerSubmissionDispatchResult = "success" | "ambiguous" | "rejected";

export async function dispatchPendingComposerSubmission(input: {
  readonly submission: PendingComposerSubmission;
  readonly dispatch: (
    payload: StartThreadTurnInput,
  ) => Promise<AtomCommandResult<unknown, unknown>>;
  readonly insertOptimisticMessage: () => void;
}): Promise<PendingComposerSubmissionDispatchResult> {
  const { submission } = input;
  const result = await input.dispatch(submission.payload);
  if (result._tag === "Success") {
    usePendingComposerSubmissionStore.getState().removePendingSubmission({
      environmentId: submission.environmentId,
      threadId: submission.threadId,
    });
    return "success";
  }

  const error = squashAtomCommandFailure(result);
  const message = error instanceof Error ? error.message : null;
  if (isTransportConnectionErrorMessage(message)) {
    usePendingComposerSubmissionStore.getState().markPendingSubmissionAmbiguous({
      environmentId: submission.environmentId,
      threadId: submission.threadId,
    });
    return "ambiguous";
  }

  usePendingComposerSubmissionStore.getState().removePendingSubmission({
    environmentId: submission.environmentId,
    threadId: submission.threadId,
  });
  return "rejected";
}
