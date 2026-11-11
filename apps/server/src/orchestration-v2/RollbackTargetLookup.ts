import {
  latestProviderTurnForAttempt,
  type OrchestrationV2ProviderTurn,
  type OrchestrationV2Run,
  type OrchestrationV2ThreadProjection,
  type ProviderThreadId,
} from "@t3tools/contracts";

type ProviderTurnLookupProjection = Pick<
  OrchestrationV2ThreadProjection,
  "providerTurns" | "attempts"
>;

/** The provider turn an app run ended on, if the provider ever answered. */
export function providerTurnForRun(
  projection: ProviderTurnLookupProjection,
  run: OrchestrationV2Run,
): OrchestrationV2ProviderTurn | undefined {
  if (run.activeAttemptId === null) {
    return undefined;
  }

  return (
    latestProviderTurnForAttempt(projection.providerTurns, run.activeAttemptId) ??
    projection.providerTurns.find((turn) => {
      const attempt = projection.attempts.find((candidate) => candidate.id === run.activeAttemptId);
      return attempt?.providerTurnId === turn.id;
    })
  );
}

export interface RollbackProviderTurn {
  readonly run: OrchestrationV2Run;
  readonly turn: OrchestrationV2ProviderTurn;
}

/**
 * Resolves the provider turn a rollback to `ordinal` must target.
 *
 * A turn can settle without ever producing a provider turn: the preparation
 * step can fail before the provider is called, an interrupt can land before it
 * answers, and a provider can reject the turn outright (auth, rate limit,
 * timeout). Those turns still have a checkpoint — it is the workspace state the
 * turn ended on — but rolling the conversation back to them means rolling it
 * back to the newest turn that does exist at or before them. Without this walk
 * the rollback failed with "its provider turn is unavailable" and the user
 * could not revert the message at all.
 */
export function findRollbackProviderTurn(
  projection: ProviderTurnLookupProjection & Pick<OrchestrationV2ThreadProjection, "runs">,
  input: { readonly ordinal: number; readonly providerThreadId: ProviderThreadId },
): RollbackProviderTurn | undefined {
  const runs = projection.runs
    .filter((run) => run.ordinal <= input.ordinal)
    .sort((left, right) => right.ordinal - left.ordinal);
  for (const run of runs) {
    const turn = providerTurnForRun(projection, run);
    if (turn !== undefined && turn.providerThreadId === input.providerThreadId) {
      return { run, turn };
    }
  }
  return undefined;
}
