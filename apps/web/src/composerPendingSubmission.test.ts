import { EnvironmentId, MessageId, ThreadId } from "@t3tools/contracts";
import { scopeThreadRef } from "@t3tools/client-runtime/environment";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";
import * as Cause from "effect/Cause";

import { dispatchPendingComposerSubmission } from "./composerPendingSubmission";
import {
  clearPendingComposerSubmission,
  usePendingComposerSubmissionStore,
  type PendingComposerSubmission,
} from "./composerPendingSubmissionStore";

const environmentId = EnvironmentId.make("pending-dispatch-environment");
const threadId = ThreadId.make("pending-dispatch-thread");

function makeSubmission(): PendingComposerSubmission {
  return {
    environmentId,
    threadId,
    commandId: "command-original" as PendingComposerSubmission["commandId"],
    messageId: MessageId.make("message-original"),
    phase: "ambiguous",
    createdAt: "2026-11-14T10:00:00.000Z",
    payload: {
      commandId: "command-original" as PendingComposerSubmission["commandId"],
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

describe("pending composer submission dispatch", () => {
  afterEach(() => {
    clearPendingComposerSubmission(scopeThreadRef(environmentId, threadId));
  });

  it("replays an ambiguous submission with its original command and message identity", async () => {
    const submission = makeSubmission();
    usePendingComposerSubmissionStore.getState().setPendingSubmission(submission);
    const dispatch = vi.fn().mockResolvedValue({ _tag: "Success" });
    const insertOptimisticMessage = vi.fn();

    const result = await dispatchPendingComposerSubmission({
      submission,
      dispatch,
      insertOptimisticMessage,
    });

    expect(result).toBe("success");
    expect(dispatch).toHaveBeenCalledOnce();
    expect(dispatch).toHaveBeenCalledWith(submission.payload);
    expect(dispatch.mock.calls[0]?.[0]?.commandId).toBe(submission.commandId);
    expect(dispatch.mock.calls[0]?.[0]?.message.messageId).toBe(submission.messageId);
    expect(insertOptimisticMessage).not.toHaveBeenCalled();
    expect(
      usePendingComposerSubmissionStore.getState().submissionsByThreadKey[
        `${environmentId}:${threadId}`
      ],
    ).toBeUndefined();
  });

  it("retains the same submission after another ambiguous transport failure", async () => {
    const submission = makeSubmission();
    usePendingComposerSubmissionStore.getState().setPendingSubmission(submission);
    const dispatch = vi.fn().mockResolvedValue({
      _tag: "Failure",
      cause: Cause.die(new Error("RpcClientError: socket closed")),
    });

    const result = await dispatchPendingComposerSubmission({
      submission,
      dispatch,
      insertOptimisticMessage: vi.fn(),
    });

    expect(result).toBe("ambiguous");
    expect(dispatch.mock.calls[0]?.[0]?.commandId).toBe(submission.commandId);
    expect(dispatch.mock.calls[0]?.[0]?.message.messageId).toBe(submission.messageId);
    expect(
      usePendingComposerSubmissionStore.getState().submissionsByThreadKey[
        `${environmentId}:${threadId}`
      ]?.commandId,
    ).toBe(submission.commandId);
  });

  it("removes the submission after a definite server rejection", async () => {
    const submission = makeSubmission();
    usePendingComposerSubmissionStore.getState().setPendingSubmission(submission);
    const dispatch = vi.fn().mockResolvedValue({
      _tag: "Failure",
      cause: Cause.die(new Error("Thread not found")),
    });

    const result = await dispatchPendingComposerSubmission({
      submission,
      dispatch,
      insertOptimisticMessage: vi.fn(),
    });

    expect(result).toBe("rejected");
    expect(
      usePendingComposerSubmissionStore.getState().submissionsByThreadKey[
        `${environmentId}:${threadId}`
      ],
    ).toBeUndefined();
  });
});
