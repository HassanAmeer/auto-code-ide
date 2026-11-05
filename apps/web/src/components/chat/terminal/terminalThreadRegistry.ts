import { useState, useEffect } from "react";

const STORAGE_KEY_TERMINAL_THREAD_IDS = "adc_terminal_thread_ids";

// Seed known terminal thread IDs from user activity
const SEED_TERMINAL_THREAD_IDS = [
  "264e216e-2596-46d3-bb51-6aa51a70f5c4",
  "ed3093f0-3414-49c7-81a2-381e0fbeb589",
  "e81cf360-194d-4f01-af60-ce317dea07c3",
  "9859c2e3-998f-46ad-893f-c7262b53ea5c",
];

export function getTerminalThreadIds(): string[] {
  if (typeof window === "undefined") return SEED_TERMINAL_THREAD_IDS;
  try {
    const raw = localStorage.getItem(STORAGE_KEY_TERMINAL_THREAD_IDS);
    if (!raw) {
      localStorage.setItem(
        STORAGE_KEY_TERMINAL_THREAD_IDS,
        JSON.stringify(SEED_TERMINAL_THREAD_IDS),
      );
      return SEED_TERMINAL_THREAD_IDS;
    }
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      return Array.from(new Set([...SEED_TERMINAL_THREAD_IDS, ...parsed]));
    }
    return SEED_TERMINAL_THREAD_IDS;
  } catch {
    return SEED_TERMINAL_THREAD_IDS;
  }
}

export function addTerminalThreadId(threadId: string): void {
  if (!threadId || typeof window === "undefined") return;
  try {
    const current = getTerminalThreadIds();
    const updated = Array.from(new Set([threadId, ...current]));
    localStorage.setItem(STORAGE_KEY_TERMINAL_THREAD_IDS, JSON.stringify(updated));
    window.dispatchEvent(new CustomEvent("t3:terminal-threads-changed", { detail: updated }));
  } catch {}
}

export function removeTerminalThreadId(threadId: string): void {
  if (!threadId || typeof window === "undefined") return;
  try {
    const current = getTerminalThreadIds();
    const updated = current.filter((id) => id !== threadId);
    localStorage.setItem(STORAGE_KEY_TERMINAL_THREAD_IDS, JSON.stringify(updated));
    window.dispatchEvent(new CustomEvent("t3:terminal-threads-changed", { detail: updated }));
  } catch {}
}

export function isTerminalThreadId(threadId: string): boolean {
  return getTerminalThreadIds().includes(threadId);
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
