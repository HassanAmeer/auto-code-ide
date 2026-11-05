export interface DesktopSnapShotBridge {
  readonly onSnapShot?: (listener: (snapShot: unknown) => void) => () => void;
  readonly getSnapShotShortcut?: () => Promise<unknown>;
  readonly setSnapShotShortcut?: (shortcut: unknown) => Promise<unknown>;
}

export function getDesktopSnapShotBridge(): DesktopSnapShotBridge | undefined {
  return undefined;
}

export function subscribeSnapShotComposerFocus(_listener: () => void): () => void {
  return () => {};
}
