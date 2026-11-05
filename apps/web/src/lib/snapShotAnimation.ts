export function shouldAnimateSnapShotArrival(_capturedAt?: number): boolean {
  return false;
}

export function subscribeToPendingSnapShotAnimations(_listener: () => void): () => void {
  return () => {};
}

export function scheduleSnapShotAnimationDestination(): () => void {
  return () => {};
}

export function setSnapShotAnimationDestination(): void {}

export function pendingSnapShotAnimationIdsForTarget(): readonly string[] {
  return [];
}

export function beginSnapShotAnimation(): void {}
export function finishSnapShotAnimation(): void {}
export function dismissSnapShotAnimation(): void {}
export function dismissAllSnapShotAnimations(): void {}
export function updateSnapShotAnimationSource(): void {}
export function getPendingSnapShotAnimations(): readonly unknown[] {
  return [];
}
export function waitForSnapShotAnimationDestination(): Promise<void> {
  return Promise.resolve();
}
