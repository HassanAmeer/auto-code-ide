import { useState, useEffect } from "react";
import { terminalStore } from "./terminalStore";

export const STORAGE_KEY_TERMINAL_THREAD_IDS = "adc_terminal_thread_ids";
export const STORAGE_KEY_TERMINAL_DELETED_THREAD_IDS = "adc_terminal_deleted_thread_ids";
export const STORAGE_KEY_TERMINAL_THREAD_PROJECT_MAP = "adc_terminal_thread_project_map";

// Seed known terminal thread IDs from user activity
export const SEED_TERMINAL_THREAD_IDS = [
  "264e216e-2596-46d3-bb51-6aa51a70f5c4",
  "ed3093f0-3414-49c7-81a2-381e0fbeb589",
  "e81cf360-194d-4f01-af60-ce317dea07c3",
  "9859c2e3-998f-46ad-893f-c7262b53ea5c",
];

function getDeletedTerminalThreadIds(): Set<string> {
  if (typeof window === "undefined") return new Set();
  try {
    const raw = localStorage.getItem(STORAGE_KEY_TERMINAL_DELETED_THREAD_IDS);
    if (!raw) return new Set();
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed)
      ? new Set(parsed.filter((id) => typeof id === "string"))
      : new Set();
  } catch {
    return new Set();
  }
}

function markTerminalThreadIdDeleted(threadId: string): void {
  if (!threadId || typeof window === "undefined") return;
  try {
    const deleted = getDeletedTerminalThreadIds();
    deleted.add(threadId);
    localStorage.setItem(
      STORAGE_KEY_TERMINAL_DELETED_THREAD_IDS,
      JSON.stringify(Array.from(deleted)),
    );
  } catch {}
}

function unmarkTerminalThreadIdDeleted(threadId: string): void {
  if (!threadId || typeof window === "undefined") return;
  try {
    const deleted = getDeletedTerminalThreadIds();
    if (deleted.has(threadId)) {
      deleted.delete(threadId);
      localStorage.setItem(
        STORAGE_KEY_TERMINAL_DELETED_THREAD_IDS,
        JSON.stringify(Array.from(deleted)),
      );
    }
  } catch {}
}

export function getTerminalThreadIds(): string[] {
  if (typeof window === "undefined") return SEED_TERMINAL_THREAD_IDS;
  try {
    const deleted = getDeletedTerminalThreadIds();
    const raw = localStorage.getItem(STORAGE_KEY_TERMINAL_THREAD_IDS);
    if (raw === null) {
      const initial = SEED_TERMINAL_THREAD_IDS.filter((id) => !deleted.has(id));
      localStorage.setItem(STORAGE_KEY_TERMINAL_THREAD_IDS, JSON.stringify(initial));
      return initial;
    }
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      // LocalStorage is authoritative once initialized.
      // Never merge SEED_TERMINAL_THREAD_IDS back into parsed.
      return parsed.filter((id) => typeof id === "string" && !deleted.has(id));
    }
    return [];
  } catch {
    return [];
  }
}

export function addTerminalThreadId(threadId: string): void {
  if (!threadId || typeof window === "undefined") return;
  try {
    unmarkTerminalThreadIdDeleted(threadId);
    const current = getTerminalThreadIds();
    const updated = Array.from(new Set([threadId, ...current]));
    localStorage.setItem(STORAGE_KEY_TERMINAL_THREAD_IDS, JSON.stringify(updated));
    window.dispatchEvent(new CustomEvent("t3:terminal-threads-changed", { detail: updated }));
  } catch {}
}

export function getTerminalThreadProject(threadId: string): string | null {
  if (!threadId || typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(STORAGE_KEY_TERMINAL_THREAD_PROJECT_MAP);
    if (!raw) return null;
    const map = JSON.parse(raw);
    return typeof map[threadId] === "string" ? map[threadId] : null;
  } catch {
    return null;
  }
}

export function setTerminalThreadProject(threadId: string, projectId: string | null): void {
  if (!threadId || typeof window === "undefined") return;
  try {
    const raw = localStorage.getItem(STORAGE_KEY_TERMINAL_THREAD_PROJECT_MAP);
    const map = raw ? JSON.parse(raw) : {};
    if (projectId) {
      map[threadId] = projectId;
    } else {
      delete map[threadId];
    }
    localStorage.setItem(STORAGE_KEY_TERMINAL_THREAD_PROJECT_MAP, JSON.stringify(map));
    window.dispatchEvent(
      new CustomEvent("t3:terminal-thread-project-changed", {
        detail: { threadId, projectId },
      }),
    );
  } catch {}
}

export function removeTerminalThreadId(threadId: string): void {
  if (!threadId || typeof window === "undefined") return;
  try {
    markTerminalThreadIdDeleted(threadId);
    setTerminalThreadProject(threadId, null);
    const current = getTerminalThreadIds();
    const updated = current.filter((id) => id !== threadId);
    localStorage.setItem(STORAGE_KEY_TERMINAL_THREAD_IDS, JSON.stringify(updated));

    try {
      terminalStore.deleteChat(threadId);
    } catch {}

    window.dispatchEvent(new CustomEvent("t3:terminal-threads-changed", { detail: updated }));
  } catch {}
}

export function isTerminalThreadId(threadId: string): boolean {
  if (!threadId) return false;
  if (getDeletedTerminalThreadIds().has(threadId)) return false;
  return getTerminalThreadIds().includes(threadId);
}

export function clearAllTerminalThreadIds(): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.removeItem(STORAGE_KEY_TERMINAL_THREAD_IDS);
    localStorage.removeItem(STORAGE_KEY_TERMINAL_DELETED_THREAD_IDS);
    localStorage.removeItem(STORAGE_KEY_TERMINAL_THREAD_PROJECT_MAP);
    window.dispatchEvent(new CustomEvent("t3:terminal-threads-changed", { detail: [] }));
  } catch {}
}

export function useTerminalThreadIds(): string[] {
  const [ids, setIds] = useState<string[]>(getTerminalThreadIds);

  useEffect(() => {
    const handler = () => {
      setIds(getTerminalThreadIds());
    };
    window.addEventListener("t3:terminal-threads-changed", handler);
    return () => {
      window.removeEventListener("t3:terminal-threads-changed", handler);
    };
  }, []);

  return ids;
}
