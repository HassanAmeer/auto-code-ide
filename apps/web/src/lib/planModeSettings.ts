const STORAGE_KEY = "autocode_show_build_plan_button";

export function isPlanModeButtonEnabled(settingsPlanModeEnabled?: boolean): boolean {
  if (settingsPlanModeEnabled === true) return true;
  if (typeof window === "undefined") return false;
  try {
    const item = window.localStorage.getItem(STORAGE_KEY);
    return item === "true";
  } catch {
    return false;
  }
}

export function savePlanModeButtonEnabled(enabled: boolean): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, String(enabled));
  } catch {
    // Ignore localStorage write errors
  }
}
