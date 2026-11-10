// @effect-diagnostics globalDateInEffect:off globalRandomInEffect:off nodeBuiltinImport:off
/**
 * Cooperative abort registry for in-flight dsh workers.
 *
 * The embedded engine runs workers in-process and there is no forced kill
 * switch for a running completion, so stopping a worker is cooperative:
 * call sites check `isWorkerAborted` at stage boundaries (before dispatch,
 * after the model call, before merge, before review) and bail out without
 * writing files, merging, or notifying the client.
 */
const abortedWorkerIds = new Set<string>();

export function markWorkerAborted(workerId: string): void {
  abortedWorkerIds.add(workerId);
}

export function isWorkerAborted(workerId: string): boolean {
  return abortedWorkerIds.has(workerId);
}

export function clearWorkerAbort(workerId: string): void {
  abortedWorkerIds.delete(workerId);
}

export function clearAllWorkerAborts(): void {
  abortedWorkerIds.clear();
}
