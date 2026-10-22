import { useCallback, useEffect } from "react";

import { usePrimarySettings, useUpdatePrimarySettings } from "~/hooks/useSettings";
import { useBackgroundModeStore } from "./backgroundModeStore";

/**
 * How long a local write is trusted before the server snapshot is allowed to
 * overwrite the optimistic local state again.
 */
const PENDING_WRITE_TTL_MS = 10_000;

let pendingWrite: { readonly value: boolean; readonly at: number } | null = null;

/**
 * Server-backed "24/7 VPS background" state.
 *
 * The toggle used to live only in this browser, so flipping it never changed
 * what the server did. It now writes the environment settings the server
 * actually reads:
 * - `backgroundActivity.overrides.runWithoutClient` keeps host-side background
 *   work (git refresh, provider health) running while no browser is connected.
 * - `continueThreadsAfterServerUpdate` lets the server pick a running thread
 *   back up after a restart instead of leaving it cut.
 */
export function useBackgroundModeServerState() {
  const settings = usePrimarySettings();
  const updateSettings = useUpdatePrimarySettings();
  const setLocalEnabled = useBackgroundModeStore((state) => state.setBgEnabled);

  const runWithoutClient = settings.backgroundActivity?.overrides?.runWithoutClient === true;
  const continueThreads = settings.continueThreadsAfterServerUpdate === true;
  // The headline promise is that a task keeps running on the host with no
  // browser attached, so the switch follows the thread-continuation setting
  // and the host-polling override follows along with it.
  const isBgEnabled = continueThreads;

  const setBgEnabled = useCallback(
    (next: boolean) => {
      pendingWrite = { value: next, at: Date.now() };
      setLocalEnabled(next);
      updateSettings({
        backgroundActivity: {
          profile: "custom",
          baseProfile: next ? "performance" : "battery-saver",
          overrides: { runWithoutClient: next },
        },
        continueThreadsAfterServerUpdate: next,
      });
    },
    [setLocalEnabled, updateSettings],
  );

  return { isBgEnabled, setBgEnabled, runWithoutClient, continueThreads };
}

/**
 * Keeps the local store in step with the server truth so every surface shows
 * the real state, on every device, not just this browser.
 */
export function BackgroundModeServerSync() {
  const { isBgEnabled } = useBackgroundModeServerState();
  const storeEnabled = useBackgroundModeStore((state) => state.isBgEnabled);
  const setStoreEnabled = useBackgroundModeStore((state) => state.setBgEnabled);

  useEffect(() => {
    if (pendingWrite) {
      if (isBgEnabled === pendingWrite.value) {
        pendingWrite = null;
      } else if (Date.now() - pendingWrite.at < PENDING_WRITE_TTL_MS) {
        // The write is still in flight; do not fight it with the old snapshot.
        return;
      } else {
        pendingWrite = null;
      }
    }
    if (storeEnabled !== isBgEnabled) {
      setStoreEnabled(isBgEnabled);
    }
  }, [isBgEnabled, setStoreEnabled, storeEnabled]);

  return null;
}
