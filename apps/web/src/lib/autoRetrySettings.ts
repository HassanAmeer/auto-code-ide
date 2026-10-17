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
  timeoutSeconds: 90,
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
          ? parsed.timeoutSeconds
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

  // Build a lookup of favorited model keys
  const favoriteKeys = new Set((favorites ?? []).map((f) => `${f.provider}:${f.model}`));

  // Per user instruction:
  // "The next model that was favorited can move.
  // In the general settings, we have a setting for auto-retry, and then the next model is selected.
  // If it's on retry, after two to three attempts, it moves to the next model.
  // It should only move from the favorited models.
  // We have favorited or starred models that we select from the dropdown in the provider.
  // When we click on the favorite, only that model should auto-retry,
  // and no other model from any provider should retry until it's added to the favorites."
  const favoriteCandidates: FallbackModelCandidate[] = [];

  for (const entry of availableEntries) {
    for (const m of entry.models) {
      const key = `${entry.instanceId}:${m.slug}`;
      if (favoriteKeys.has(key)) {
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
