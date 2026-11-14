import { EnvironmentId, MessageId, ThreadId } from "@t3tools/contracts";
import { scopeThreadRef } from "@t3tools/client-runtime/environment";
import { afterEach, describe, expect, it } from "vite-plus/test";

import {
  PENDING_COMPOSER_SUBMISSION_STORAGE_KEY,
  clearPendingComposerSubmission,
  getPendingComposerSubmission,
  usePendingComposerSubmissionStore,
  type PendingComposerSubmission,
} from "./composerPendingSubmissionStore";
import { useComposerDraftStore } from "./composerDraftStore";

const environmentId = EnvironmentId.make("pending-submission-environment");
const threadId = ThreadId.make("pending-submission-thread");

function makeSubmission(): PendingComposerSubmission {
  return {
    environmentId,
    threadId,
    commandId: "command-original" as PendingComposerSubmission["commandId"],
    messageId: MessageId.make("message-original"),
    phase: "dispatching",
    createdAt: "2026-11-14T10:00:00.000Z",
    payload: {
      threadId,
      message: {
        messageId: MessageId.make("message-original"),
        role: "user",
        text: "Retry this exact payload",
        attachments: [],
      },
      runtimeMode: "full-access",
      interactionMode: "default",
      dispatchMode: "start",
    },
  };
}

describe("pending composer submission", () => {
  afterEach(async () => {
    clearPendingComposerSubmission(scopeThreadRef(environmentId, threadId));
    await usePendingComposerSubmissionStore.persist.clearStorage();
  });

  it("retains the original command and message identity across an ambiguous retry", () => {
    const submission = makeSubmission();
    usePendingComposerSubmissionStore.getState().setPendingSubmission(submission);

    usePendingComposerSubmissionStore
      .getState()
      .markPendingSubmissionAmbiguous(scopeThreadRef(environmentId, threadId));

    const retained = getPendingComposerSubmission(scopeThreadRef(environmentId, threadId));
    expect(retained?.commandId).toBe(submission.commandId);
    expect(retained?.messageId).toBe(submission.messageId);
    expect(retained?.payload.message.messageId).toBe(submission.payload.message.messageId);
    expect(retained?.payload.message.text).toBe("Retry this exact payload");
    expect(retained?.phase).toBe("ambiguous");
  });

  it("persists the pending submission separately from the editable composer draft", async () => {
    const draftBefore = useComposerDraftStore
      .getState()
      .getComposerDraft(scopeThreadRef(environmentId, threadId));
    usePendingComposerSubmissionStore.getState().setPendingSubmission(makeSubmission());

    await usePendingComposerSubmissionStore.persist.rehydrate();

    const retained = getPendingComposerSubmission(scopeThreadRef(environmentId, threadId));
    expect(retained?.commandId).toBe("command-original");
    expect(retained?.messageId).toBe("message-original");
    expect(retained?.phase).toBe("dispatching");
    expect(usePendingComposerSubmissionStore.persist.getOptions().name).toBe(
      PENDING_COMPOSER_SUBMISSION_STORAGE_KEY,
    );
    expect(
      useComposerDraftStore.getState().getComposerDraft(scopeThreadRef(environmentId, threadId)),
    ).toBe(draftBefore);
  });
});
