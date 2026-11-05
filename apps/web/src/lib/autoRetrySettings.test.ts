import { describe, expect, it } from "vite-plus/test";
import {
  markThreadUserStopped,
  clearThreadUserStopped,
  pauseThreadAutoRetry,
  resumeThreadAutoRetry,
  resetThreadAutoRetry,
  isThreadUserStopped,
  isThreadAutoRetryPaused,
} from "./autoRetrySettings";

describe("autoRetrySettings thread-level status", () => {
  const threadId = "test-thread-retry-123";

  it("handles thread user-stop (cancel)", () => {
    resetThreadAutoRetry(threadId);
    expect(isThreadUserStopped(threadId)).toBe(false);

    markThreadUserStopped(threadId);
    expect(isThreadUserStopped(threadId)).toBe(true);

    clearThreadUserStopped(threadId);
    expect(isThreadUserStopped(threadId)).toBe(false);
  });

  it("handles thread pause and resume", () => {
    resetThreadAutoRetry(threadId);
    expect(isThreadAutoRetryPaused(threadId)).toBe(false);

    pauseThreadAutoRetry(threadId);
    expect(isThreadAutoRetryPaused(threadId)).toBe(true);

    resumeThreadAutoRetry(threadId);
    expect(isThreadAutoRetryPaused(threadId)).toBe(false);
  });

  it("resetThreadAutoRetry clears both stopped and paused states", () => {
    markThreadUserStopped(threadId);
    pauseThreadAutoRetry(threadId);

    resetThreadAutoRetry(threadId);
    expect(isThreadUserStopped(threadId)).toBe(false);
    expect(isThreadAutoRetryPaused(threadId)).toBe(false);
  });
});
