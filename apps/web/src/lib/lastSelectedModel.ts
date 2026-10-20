import type { ModelSelection, ProviderInstanceId } from "@t3tools/contracts";

export const LAST_SELECTED_MODEL_STORAGE_KEY = "t3:last_selected_model";

/**
 * Read the user's last selected AI model from localStorage.
 */
export function getSavedLastSelectedModel(): ModelSelection | null {
  if (typeof window === "undefined" || !window.localStorage) {
    return null;
  }
  try {
    const raw = window.localStorage.getItem(LAST_SELECTED_MODEL_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed.instanceId === "string" && typeof parsed.model === "string") {
      return {
        instanceId: parsed.instanceId as ProviderInstanceId,
        model: parsed.model,
        options: Array.isArray(parsed.options) ? parsed.options : undefined,
      };
    }
  } catch {
    // Ignore storage parse errors
  }
  return null;
}

/**
 * Persist the user's last selected AI model to localStorage so it survives page reloads.
 */
export function saveLastSelectedModel(selection: ModelSelection | null | undefined): void {
  if (typeof window === "undefined" || !window.localStorage) {
    return;
  }
  if (!selection || !selection.instanceId || !selection.model) {
    return;
  }
  try {
    window.localStorage.setItem(
      LAST_SELECTED_MODEL_STORAGE_KEY,
      JSON.stringify({
        instanceId: selection.instanceId,
        model: selection.model,
        options: selection.options,
      }),
    );
  } catch {
    // Ignore quota or security errors
  }
}
