const EMPTY_PENDING_SNAPSHOT_ANIMATIONS: readonly any[] = Object.freeze([]);
const EMPTY_STRING_ARRAY: readonly string[] = Object.freeze([]);

export function shouldAnimateSnapShotArrival(..._args: any[]): boolean {
  return false;
}

export function subscribeToPendingSnapShotAnimations(..._args: any[]): () => void {
  return () => {};
}

export function scheduleSnapShotAnimationDestination(..._args: any[]): () => void {
  return () => {};
}

export function setSnapShotAnimationDestination(..._args: any[]): void {}

export function pendingSnapShotAnimationIdsForTarget(..._args: any[]): readonly string[] {
  return EMPTY_STRING_ARRAY;
}

export function beginSnapShotAnimation(..._args: any[]): void {}
export function finishSnapShotAnimation(..._args: any[]): void {}
export function dismissSnapShotAnimation(..._args: any[]): void {}
export function dismissAllSnapShotAnimations(..._args: any[]): void {}
export function updateSnapShotAnimationSource(..._args: any[]): void {}
export function getPendingSnapShotAnimations(..._args: any[]): readonly any[] {
  return EMPTY_PENDING_SNAPSHOT_ANIMATIONS;
}
export function waitForSnapShotAnimationDestination(..._args: any[]): Promise<void> {
  return Promise.resolve();
}
