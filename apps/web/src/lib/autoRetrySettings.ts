import { useState, useEffect } from "react";
import type { ModelSelection, ProviderInstanceId } from "@t3tools/contracts";
import type { ProviderInstanceEntry } from "~/providerInstances";

export interface AutoRetrySettings {
  enabled: boolean;
  delaySeconds: number;
  maxRetries: number;
  autoSwitchModel: boolean;
  retryOnRateLimit: boolean;
  timeoutSeconds: number;
}

const STORAGE_KEY = "t3code:auto-retry-settings:v2";
const LEGACY_STORAGE_KEY = "t3code:auto-retry-settings:v1";

export const DEFAULT_AUTO_RETRY_SETTINGS: AutoRetrySettings = {
  enabled: true,
  delaySeconds: 10,
  maxRetries: 3,
  autoSwitchModel: true,
  retryOnRateLimit: true,
  timeoutSeconds: 300,
};

export function loadAutoRetrySettings(): AutoRetrySettings {
  if (typeof window === "undefined") return DEFAULT_AUTO_RETRY_SETTINGS;
  try {
    const raw = localStorage.getItem(STORAGE_KEY) ?? localStorage.getItem(LEGACY_STORAGE_KEY);
    if (!raw) return DEFAULT_AUTO_RETRY_SETTINGS;
    const parsed = JSON.parse(raw);
    return {
      enabled:
        typeof parsed.enabled === "boolean" ? parsed.enabled : DEFAULT_AUTO_RETRY_SETTINGS.enabled,
      delaySeconds:
        typeof parsed.delaySeconds === "number" && parsed.delaySeconds > 0
          ? parsed.delaySeconds
          : DEFAULT_AUTO_RETRY_SETTINGS.delaySeconds,
      maxRetries:
        typeof parsed.maxRetries === "number" && parsed.maxRetries > 0
          ? parsed.maxRetries
          : DEFAULT_AUTO_RETRY_SETTINGS.maxRetries,
      autoSwitchModel:
        typeof parsed.autoSwitchModel === "boolean"
          ? parsed.autoSwitchModel
          : DEFAULT_AUTO_RETRY_SETTINGS.autoSwitchModel,
      retryOnRateLimit:
        typeof parsed.retryOnRateLimit === "boolean"
          ? parsed.retryOnRateLimit
          : DEFAULT_AUTO_RETRY_SETTINGS.retryOnRateLimit,
      timeoutSeconds:
        typeof parsed.timeoutSeconds === "number" && parsed.timeoutSeconds > 0
          ? parsed.timeoutSeconds === 90
            ? DEFAULT_AUTO_RETRY_SETTINGS.timeoutSeconds
            : parsed.timeoutSeconds
          : DEFAULT_AUTO_RETRY_SETTINGS.timeoutSeconds,
    };
  } catch {
    return DEFAULT_AUTO_RETRY_SETTINGS;
  }
}

import { saveServerSetting } from "./serverSettingsSync";

export function saveAutoRetrySettings(patch: Partial<AutoRetrySettings>): void {
  if (typeof window === "undefined") return;
  try {
    const current = loadAutoRetrySettings();
    const updated: AutoRetrySettings = {
      ...current,
      ...patch,
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
    window.dispatchEvent(new CustomEvent("t3-auto-retry-settings-changed", { detail: updated }));
    void saveServerSetting(STORAGE_KEY, updated);
  } catch (err) {
    console.warn("Failed to save auto-retry settings:", err);
  }
}

export function subscribeAutoRetrySettings(
  callback: (settings: AutoRetrySettings) => void,
): () => void {
  if (typeof window === "undefined") return () => {};
  const handler = (e: Event) => {
    const custom = e as CustomEvent<AutoRetrySettings>;
    if (custom.detail) {
      callback(custom.detail);
    } else {
      callback(loadAutoRetrySettings());
    }
  };
  window.addEventListener("t3-auto-retry-settings-changed", handler);
  return () => {
    window.removeEventListener("t3-auto-retry-settings-changed", handler);
  };
}

export function useAutoRetrySettings(): [
  AutoRetrySettings,
  (patch: Partial<AutoRetrySettings>) => void,
] {
  const [settings, setSettings] = useState<AutoRetrySettings>(loadAutoRetrySettings);

  useEffect(() => {
    setSettings(loadAutoRetrySettings());
    return subscribeAutoRetrySettings(setSettings);
  }, []);

  return [settings, saveAutoRetrySettings];
}

export interface FallbackModelCandidate {
  instanceId: ProviderInstanceId;
  model: string;
  displayName: string;
}

export function findNextFallbackModel(
  currentSelection: ModelSelection | null,
  providerEntries: ReadonlyArray<ProviderInstanceEntry>,
  favorites?: ReadonlyArray<{
    readonly provider: ProviderInstanceId;
    readonly model: string;
  }> | null,
): FallbackModelCandidate | null {
  const availableEntries = providerEntries.filter(
    (p) => p.enabled && p.isAvailable && p.models.length > 0,
  );
  if (availableEntries.length === 0) return null;

  const isKeyFavorited = (instId: string, slug: string): boolean => {
    return (favorites ?? []).some((f) => {
      const provMatch =
        f.provider === instId ||
        `custom_${f.provider}` === instId ||
        f.provider === `custom_${instId}` ||
        String(f.provider) === String(instId);
      const modelMatch = f.model === slug || f.model.toLowerCase() === slug.toLowerCase();
      return provMatch && modelMatch;
    });
  };

  const favoriteCandidates: FallbackModelCandidate[] = [];

  for (const entry of availableEntries) {
    for (const m of entry.models) {
      if (isKeyFavorited(entry.instanceId, m.slug)) {
        favoriteCandidates.push({
          instanceId: entry.instanceId,
          model: m.slug,
          displayName: `${entry.displayName} (${m.name || m.slug})`,
        });
      }
    }
  }

  // If no favorited models are available, return null
  if (favoriteCandidates.length === 0) {
    return null;
  }

  // If there's only 1 favorited model:
  if (favoriteCandidates.length === 1) {
    if (
      favoriteCandidates[0]?.instanceId !== currentSelection?.instanceId ||
      favoriteCandidates[0]?.model !== currentSelection?.model
    ) {
      return favoriteCandidates[0] ?? null;
    }
    return null;
  }

  const currentIndex = favoriteCandidates.findIndex(
    (item) =>
      item.instanceId === currentSelection?.instanceId && item.model === currentSelection?.model,
  );

  if (currentIndex === -1) {
    return favoriteCandidates[0] ?? null;
  }

  const nextIndex = (currentIndex + 1) % favoriteCandidates.length;
  return favoriteCandidates[nextIndex] ?? null;
}

// ---------------------------------------------------------------------------
// Thread-level Retry Status Tracking (Stopped from input box / Paused from card)
// ---------------------------------------------------------------------------

const userStoppedThreadIds = new Set<string>();
const userPausedThreadIds = new Set<string>();

/**
 * Mark that the user explicitly clicked the Stop button in the input box / composer.
 * When a thread is marked as user-stopped, auto-retry is completely cancelled for that turn.
 */
export function markThreadUserStopped(threadId: string | null | undefined): void {
  if (!threadId) return;
  userStoppedThreadIds.add(threadId);
  userPausedThreadIds.delete(threadId);
  if (typeof window !== "undefined") {
    window.dispatchEvent(
      new CustomEvent("t3-thread-retry-status-changed", {
        detail: { threadId, status: "stopped" },
      }),
    );
    window.dispatchEvent(
      new CustomEvent("t3-thread-user-stopped", { detail: { threadId, stopped: true } }),
    );
  }
}

/**
 * Clear the user-stopped state (e.g. when the user submits a new prompt or manually clicks Retry).
 */
export function clearThreadUserStopped(threadId: string | null | undefined): void {
  if (!threadId) return;
  userStoppedThreadIds.delete(threadId);
  if (typeof window !== "undefined") {
    window.dispatchEvent(
      new CustomEvent("t3-thread-retry-status-changed", {
        detail: { threadId, status: "active" },
      }),
    );
    window.dispatchEvent(
      new CustomEvent("t3-thread-user-stopped", { detail: { threadId, stopped: false } }),
    );
  }
}

/**
 * Pause auto-retry for the entire thread (when the user pauses any error card in the thread).
 */
export function pauseThreadAutoRetry(threadId: string | null | undefined): void {
  if (!threadId) return;
  userPausedThreadIds.add(threadId);
  if (typeof window !== "undefined") {
    window.dispatchEvent(
      new CustomEvent("t3-thread-retry-status-changed", {
        detail: { threadId, status: "paused" },
      }),
    );
  }
}

/**
 * Resume auto-retry for the thread (when the user clicks play/resume on an error card).
 */
export function resumeThreadAutoRetry(threadId: string | null | undefined): void {
  if (!threadId) return;
  userPausedThreadIds.delete(threadId);
  userStoppedThreadIds.delete(threadId);
  if (typeof window !== "undefined") {
    window.dispatchEvent(
      new CustomEvent("t3-thread-retry-status-changed", {
        detail: { threadId, status: "active" },
      }),
    );
    window.dispatchEvent(
      new CustomEvent("t3-thread-user-stopped", { detail: { threadId, stopped: false } }),
    );
  }
}

/**
 * Reset all retry override states (both stopped and paused) for a thread.
 */
export function resetThreadAutoRetry(threadId: string | null | undefined): void {
  if (!threadId) return;
  userStoppedThreadIds.delete(threadId);
  userPausedThreadIds.delete(threadId);
  if (typeof window !== "undefined") {
    window.dispatchEvent(
      new CustomEvent("t3-thread-retry-status-changed", {
        detail: { threadId, status: "reset" },
      }),
    );
    window.dispatchEvent(
      new CustomEvent("t3-thread-user-stopped", { detail: { threadId, stopped: false } }),
    );
  }
}

export function isThreadUserStopped(threadId: string | null | undefined): boolean {
  if (!threadId) return false;
  return userStoppedThreadIds.has(threadId);
}

export function isThreadAutoRetryPaused(threadId: string | null | undefined): boolean {
  if (!threadId) return false;
  return userPausedThreadIds.has(threadId);
}

/**
 * Hook to reactively observe thread-level retry status (stopped, paused, active).
 */
export function useThreadAutoRetryStatus(threadId: string | null | undefined) {
  const [isStopped, setIsStopped] = useState(() => isThreadUserStopped(threadId));
  const [isPaused, setIsPaused] = useState(() => isThreadAutoRetryPaused(threadId));

  useEffect(() => {
    setIsStopped(isThreadUserStopped(threadId));
    setIsPaused(isThreadAutoRetryPaused(threadId));
    if (typeof window === "undefined" || !threadId) return;

    const handler = (e: Event) => {
      const custom = e as CustomEvent<{ threadId?: string; status?: string }>;
      if (!custom.detail?.threadId || custom.detail.threadId === threadId) {
        setIsStopped(isThreadUserStopped(threadId));
        setIsPaused(isThreadAutoRetryPaused(threadId));
      }
    };

    window.addEventListener("t3-thread-retry-status-changed", handler);
    window.addEventListener("t3-thread-user-stopped", handler);
    return () => {
      window.removeEventListener("t3-thread-retry-status-changed", handler);
      window.removeEventListener("t3-thread-user-stopped", handler);
    };
  }, [threadId]);

  return {
    isStopped,
    isPaused,
    pause: () => pauseThreadAutoRetry(threadId),
    resume: () => resumeThreadAutoRetry(threadId),
    cancel: () => markThreadUserStopped(threadId),
    reset: () => resetThreadAutoRetry(threadId),
  };
}

/**
 * Hook to reactively observe whether the active chat / thread was stopped by the user from the input box.
 */
export function useIsThreadUserStopped(threadId: string | null | undefined): boolean {
  const { isStopped } = useThreadAutoRetryStatus(threadId);
  return isStopped;
}
