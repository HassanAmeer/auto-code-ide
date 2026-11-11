import { ProviderThreadId, ProviderTurnId, RunAttemptId } from "@t3tools/contracts";
import { assert, describe, it } from "@effect/vitest";

import { findRollbackProviderTurn, providerTurnForRun } from "./RollbackTargetLookup.ts";

const providerThreadId = ProviderThreadId.make("provider-thread-rollback");

const run = (ordinal: number, activeAttemptId: string | null) =>
  ({ ordinal, activeAttemptId }) as never;

const attempt = (id: string, providerTurnId: string | null) => ({ id, providerTurnId }) as never;

const turn = (input: {
  readonly id: string;
  readonly runAttemptId?: string | null;
  readonly ordinal?: number;
  readonly providerThreadId?: ProviderThreadId;
}) =>
  ({
    id: input.id,
    runAttemptId: input.runAttemptId ?? null,
    ordinal: input.ordinal ?? 0,
    providerThreadId: input.providerThreadId ?? providerThreadId,
  }) as never;

describe("findRollbackProviderTurn", () => {
  it("returns the target run's own provider turn when it has one", () => {
    const resolved = findRollbackProviderTurn(
      {
        runs: [run(1, "attempt-1"), run(2, "attempt-2")] as never,
        attempts: [attempt("attempt-1", "turn-1"), attempt("attempt-2", "turn-2")] as never,
        providerTurns: [
          turn({ id: "turn-1", runAttemptId: "attempt-1", ordinal: 1 }),
          turn({ id: "turn-2", runAttemptId: "attempt-2", ordinal: 1 }),
        ] as never,
      },
      { ordinal: 2, providerThreadId },
    );
    assert.equal(resolved?.turn.id, ProviderTurnId.make("turn-2"));
  });

  it("walks back when the target run never reached the provider", () => {
    // Run 2 failed during preparation, so it has no provider turn of its own.
    const resolved = findRollbackProviderTurn(
      {
        runs: [run(1, "attempt-1"), run(2, "attempt-2")] as never,
        attempts: [attempt("attempt-1", "turn-1"), attempt("attempt-2", null)] as never,
        providerTurns: [turn({ id: "turn-1", runAttemptId: "attempt-1", ordinal: 1 })] as never,
      },
      { ordinal: 2, providerThreadId },
    );
    assert.equal(resolved?.run.ordinal, 1);
    assert.equal(resolved?.turn.id, ProviderTurnId.make("turn-1"));
  });

  it("ignores turns from another provider thread and gives up when none match", () => {
    const otherThread = ProviderThreadId.make("provider-thread-other");
    assert.isUndefined(
      findRollbackProviderTurn(
        {
          runs: [run(1, "attempt-1")] as never,
          attempts: [attempt("attempt-1", "turn-1")] as never,
          providerTurns: [turn({ id: "turn-1", providerThreadId: otherThread })] as never,
        },
        { ordinal: 1, providerThreadId },
      ),
    );
  });
});

describe("providerTurnForRun", () => {
  it("has no turn for a run that never started an attempt", () => {
    assert.isUndefined(
      providerTurnForRun({ attempts: [] as never, providerTurns: [] as never }, run(1, null)),
    );
  });

  it("prefers the latest turn of the active attempt", () => {
    const found = providerTurnForRun(
      {
        attempts: [attempt("attempt-1", "turn-1")] as never,
        providerTurns: [
          turn({ id: "turn-1", runAttemptId: "attempt-1", ordinal: 1 }),
          turn({ id: "turn-2", runAttemptId: "attempt-1", ordinal: 2 }),
        ] as never,
      },
      { activeAttemptId: RunAttemptId.make("attempt-1") } as never,
    );
    assert.equal(found?.id, ProviderTurnId.make("turn-2"));
  });
});
