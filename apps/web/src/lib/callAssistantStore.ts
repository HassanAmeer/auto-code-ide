import { useState, useEffect, useCallback } from "react";
import { saveServerSetting } from "./serverSettingsSync";

export interface DelegatedTaskMeta {
  projectName: string;
  taskTitle: string;
  status: "running" | "completed" | "error";
  progress: number;
  threadId?: string;
}

export interface CallAssistantMessage {
  id: string;
  role: "user" | "assistant";
  text: string;
  timestamp: number;
  meta?: {
    delegatedTask?: DelegatedTaskMeta;
    actionType?: string;
    details?: unknown;
  };
}

export interface CallAssistantSession {
  id: string;
  title: string;
  createdAt: number;
  updatedAt: number;
  messages: CallAssistantMessage[];
}

const STORAGE_KEY = "t3code:super-call-assistant:v1";
const ACTIVE_SESSION_STORAGE_KEY = "t3code:active-call-session-id";

export function getActiveSessionId(): string {
  if (typeof window === "undefined") return "";
  try {
    return localStorage.getItem(ACTIVE_SESSION_STORAGE_KEY) || "";
  } catch {
    return "";
  }
}

export function setActiveSessionIdGlobal(id: string): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(ACTIVE_SESSION_STORAGE_KEY, id);
    window.dispatchEvent(new CustomEvent("t3-call-session-selected", { detail: id }));
  } catch (err) {
    console.warn("Failed to set active session ID:", err);
  }
}

export function loadCallSessions(): CallAssistantSession[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed) && parsed.length > 0) {
      return parsed;
    }
    return [];
  } catch (err) {
    console.warn("Failed to load call assistant sessions:", err);
    return [];
  }
}

export function saveCallSessions(sessions: CallAssistantSession[]): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(sessions));
    void saveServerSetting(STORAGE_KEY, sessions);
    window.dispatchEvent(new CustomEvent("t3-call-sessions-changed", { detail: sessions }));
  } catch (err) {
    console.warn("Failed to save call assistant sessions:", err);
  }
}

export function createNewCallSession(title?: string): CallAssistantSession {
  const current = loadCallSessions();
  const now = Date.now();
  const num = current.length + 1;
  const newSession: CallAssistantSession = {
    id: `call-session-${now}-${Math.random().toString(36).slice(2, 7)}`,
    title: title || `Call Session #${num}`,
    createdAt: now,
    updatedAt: now,
    messages: [
      {
        id: `msg-${now}-welcome`,
        role: "assistant",
        text: "Assalam-o-Alaikum! Main aapka Super Call Assistant hoon. Main aapke tamam projects aur workspace ko oversee karta hoon. Aap Urdu ya English mein baat kar saktay hain.",
        timestamp: now,
      },
    ],
  };
  const updated = [newSession, ...current];
  saveCallSessions(updated);
  return newSession;
}

export function deleteCallSession(sessionId: string): void {
  const current = loadCallSessions();
  const filtered = current.filter((s) => s.id !== sessionId);
  saveCallSessions(filtered);
}

export function clearAllCallSessions(): void {
  saveCallSessions([]);
}

export function addMessageToSession(
  sessionId: string,
  role: "user" | "assistant",
  text: string,
  meta?: CallAssistantMessage["meta"],
): void {
  const current = loadCallSessions();
  const now = Date.now();
  const idx = current.findIndex((s) => s.id === sessionId);
  if (idx === -1) {
    const created = createNewCallSession();
    addMessageToSession(created.id, role, text, meta);
    return;
  }

  const session = current[idx]!;
  const newMsg: CallAssistantMessage = {
    id: `msg-${now}-${Math.random().toString(36).slice(2, 7)}`,
    role,
    text: text.trim(),
    timestamp: now,
    meta,
  };

  const updatedSession: CallAssistantSession = {
    ...session,
    updatedAt: now,
    // Auto title from first user query
    title:
      session.messages.length === 1 && role === "user"
        ? text.slice(0, 32).trim() + (text.length > 32 ? "..." : "")
        : session.title,
    messages: [...session.messages, newMsg],
  };

  const updated = [...current];
  updated[idx] = updatedSession;
  saveCallSessions(updated);
}

export function useCallSessions() {
  const [sessions, setSessions] = useState<CallAssistantSession[]>(() => {
    const initial = loadCallSessions();
    if (initial.length === 0 && typeof window !== "undefined") {
      return [createNewCallSession()];
    }
    return initial;
  });

  const [activeSessionId, setActiveSessionIdState] = useState<string>(() => {
    const saved = getActiveSessionId();
    const initial = loadCallSessions();
    if (saved && initial.some((s) => s.id === saved)) {
      return saved;
    }
    return initial[0]?.id || "";
  });

  const setActiveSessionId = useCallback((id: string) => {
    setActiveSessionIdState(id);
    setActiveSessionIdGlobal(id);
  }, []);

  useEffect(() => {
    const sessionSelectedHandler = (e: Event) => {
      const custom = e as CustomEvent<string>;
      if (custom.detail) {
        setActiveSessionIdState(custom.detail);
      }
    };
    window.addEventListener("t3-call-session-selected", sessionSelectedHandler);
    return () => window.removeEventListener("t3-call-session-selected", sessionSelectedHandler);
  }, []);

  useEffect(() => {
    const handler = (e: Event) => {
      const custom = e as CustomEvent<CallAssistantSession[]>;
      if (custom.detail) {
        setSessions(custom.detail);
        if (!custom.detail.some((s) => s.id === activeSessionId)) {
          const nextId = custom.detail[0]?.id || "";
          setActiveSessionIdState(nextId);
          setActiveSessionIdGlobal(nextId);
        }
      } else {
        const loaded = loadCallSessions();
        setSessions(loaded);
      }
    };
    window.addEventListener("t3-call-sessions-changed", handler);
    return () => window.removeEventListener("t3-call-sessions-changed", handler);
  }, [activeSessionId]);

  const activeSession = sessions.find((s) => s.id === activeSessionId) || sessions[0] || null;

  const handleNewSession = useCallback(() => {
    const s = createNewCallSession();
    setActiveSessionId(s.id);
    return s;
  }, [setActiveSessionId]);

  const handleDeleteSession = useCallback((id: string) => {
    deleteCallSession(id);
  }, []);

  const handleClearHistory = useCallback(() => {
    clearAllCallSessions();
    const fresh = createNewCallSession();
    setActiveSessionId(fresh.id);
  }, [setActiveSessionId]);

  const handleAddMessage = useCallback(
    (role: "user" | "assistant", text: string, meta?: CallAssistantMessage["meta"]) => {
      if (!activeSession) {
        const fresh = createNewCallSession();
        addMessageToSession(fresh.id, role, text, meta);
        setActiveSessionId(fresh.id);
      } else {
        addMessageToSession(activeSession.id, role, text, meta);
      }
    },
    [activeSession, setActiveSessionId],
  );

  return {
    sessions,
    activeSession,
    activeSessionId,
    setActiveSessionId,
    handleNewSession,
    handleDeleteSession,
    handleClearHistory,
    handleAddMessage,
  };
}
