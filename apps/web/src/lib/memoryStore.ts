import { saveServerSetting } from "./serverSettingsSync";
import { useState, useEffect, useMemo, useCallback } from "react";
import { type NoteItem } from "./notesStore";
import { getActiveSessionId } from "./callAssistantStore";

export interface MemoryRecord {
  id: string;
  chatId: string; // Unique chat session ID this memory belongs to
  title: string;
  description: string;
  source: "manual" | "imported_from_notes";
  sourceNoteId?: string;
  sourceNoteTitle?: string;
  createdAt: number;
  updatedAt: number;
}

const STORAGE_KEY = "t3code:workspace-memory:v2";

export function loadAllMemories(): MemoryRecord[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      return parsed;
    }
    return [];
  } catch (err) {
    console.warn("Failed to load workspace memory records:", err);
    return [];
  }
}

export function saveAllMemories(records: MemoryRecord[]): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(records));
    void saveServerSetting(STORAGE_KEY, records);
    window.dispatchEvent(new CustomEvent("t3-memory-changed", { detail: records }));
  } catch (err) {
    console.warn("Failed to save workspace memory records:", err);
  }
}

/** Get memories scoped specifically to a particular chat session */
export function loadChatMemories(chatId?: string): MemoryRecord[] {
  const targetChatId = chatId || getActiveSessionId() || "default-chat";
  const all = loadAllMemories();
  return all.filter((m) => m.chatId === targetChatId);
}

export function addMemory(
  title: string,
  description: string = "",
  options?: {
    chatId?: string;
    source?: "manual" | "imported_from_notes";
    sourceNoteId?: string;
    sourceNoteTitle?: string;
  },
): MemoryRecord {
  const current = loadAllMemories();
  const now = Date.now();
  const targetChatId = options?.chatId || getActiveSessionId() || "default-chat";
  const newRecord: MemoryRecord = {
    id: "mem-" + now + "-" + Math.random().toString(36).slice(2, 7),
    chatId: targetChatId,
    title: title.trim(),
    description: description.trim(),
    source: options?.source || "manual",
    sourceNoteId: options?.sourceNoteId,
    sourceNoteTitle: options?.sourceNoteTitle,
    createdAt: now,
    updatedAt: now,
  };
  const updated = [newRecord, ...current];
  saveAllMemories(updated);
  return newRecord;
}

export function updateMemory(
  id: string,
  patch: Partial<Pick<MemoryRecord, "title" | "description">>,
): void {
  const current = loadAllMemories();
  const idx = current.findIndex((m) => m.id === id);
  if (idx === -1) return;

  const updatedItem: MemoryRecord = {
    ...current[idx]!,
    ...patch,
    updatedAt: Date.now(),
  };
  const updated = [...current];
  updated[idx] = updatedItem;
  saveAllMemories(updated);
}

export function deleteMemory(id: string): void {
  const current = loadAllMemories();
  const filtered = current.filter((m) => m.id !== id);
  saveAllMemories(filtered);
}

/**
 * Import chosen notes into the current chat's Memory.
 * Can import multiple notes as separate memory records.
 */
export function importNotesIntoMemory(notesToImport: NoteItem[], chatId?: string): MemoryRecord[] {
  if (!notesToImport.length) return [];
  const current = loadAllMemories();
  const now = Date.now();
  const targetChatId = chatId || getActiveSessionId() || "default-chat";

  const newRecords: MemoryRecord[] = notesToImport.map((n, idx) => ({
    id: "mem-" + (now + idx) + "-" + Math.random().toString(36).slice(2, 7),
    chatId: targetChatId,
    title: n.title.trim(),
    description: (n.content || "").trim(),
    source: "imported_from_notes",
    sourceNoteId: n.id,
    sourceNoteTitle: n.title,
    createdAt: now + idx,
    updatedAt: now + idx,
  }));

  const updated = [...newRecords, ...current];
  saveAllMemories(updated);
  return newRecords;
}

/** Lookup a memory record by title within a specific chat */
export function findMemoryByTitle(query: string, chatId?: string): MemoryRecord | undefined {
  const memories = loadChatMemories(chatId);
  if (!query || !query.trim()) return undefined;
  const clean = query
    .trim()
    .toLowerCase()
    .replace(/['"“”]/g, "");

  // 1. Exact title match
  const exact = memories.find((m) => m.title.trim().toLowerCase() === clean);
  if (exact) return exact;

  // 2. Partial containment match
  const partial = memories.find((m) => {
    const t = m.title.toLowerCase();
    return t.length >= 2 && (t.includes(clean) || clean.includes(t));
  });
  return partial;
}

/** Hook to access memories for the active (or explicit) chat */
export function useChatMemories(explicitChatId?: string): {
  memories: MemoryRecord[];
  activeChatId: string;
  addMemory: (
    title: string,
    description?: string,
    options?: {
      source?: "manual" | "imported_from_notes";
      sourceNoteId?: string;
      sourceNoteTitle?: string;
    },
  ) => MemoryRecord;
  updateMemory: typeof updateMemory;
  deleteMemory: typeof deleteMemory;
  importNotesIntoMemory: (notesToImport: NoteItem[]) => MemoryRecord[];
} {
  const [activeChatId, setActiveChatId] = useState<string>(
    () => explicitChatId || getActiveSessionId() || "default-chat",
  );
  const [allMemories, setAllMemories] = useState<MemoryRecord[]>(loadAllMemories);

  useEffect(() => {
    if (explicitChatId) {
      setActiveChatId(explicitChatId);
    }
  }, [explicitChatId]);

  useEffect(() => {
    const sessionHandler = (e: Event) => {
      const custom = e as CustomEvent<string>;
      if (custom.detail && !explicitChatId) {
        setActiveChatId(custom.detail);
      }
    };

    const memoryHandler = (e: Event) => {
      const custom = e as CustomEvent<MemoryRecord[]>;
      if (Array.isArray(custom.detail)) {
        setAllMemories(custom.detail);
      } else {
        setAllMemories(loadAllMemories());
      }
    };

    window.addEventListener("t3-call-session-selected", sessionHandler);
    window.addEventListener("t3-memory-changed", memoryHandler);
    window.addEventListener("storage", memoryHandler);

    return () => {
      window.removeEventListener("t3-call-session-selected", sessionHandler);
      window.removeEventListener("t3-memory-changed", memoryHandler);
      window.removeEventListener("storage", memoryHandler);
    };
  }, [explicitChatId]);

  const chatMemories = useMemo(() => {
    return allMemories.filter((m) => m.chatId === activeChatId);
  }, [allMemories, activeChatId]);

  const boundAddMemory = useCallback(
    (
      title: string,
      description?: string,
      options?: {
        source?: "manual" | "imported_from_notes";
        sourceNoteId?: string;
        sourceNoteTitle?: string;
      },
    ) => {
      return addMemory(title, description, { ...options, chatId: activeChatId });
    },
    [activeChatId],
  );

  const boundImportNotes = useCallback(
    (notesToImport: NoteItem[]) => {
      return importNotesIntoMemory(notesToImport, activeChatId);
    },
    [activeChatId],
  );

  return {
    memories: chatMemories,
    activeChatId,
    addMemory: boundAddMemory,
    updateMemory,
    deleteMemory,
    importNotesIntoMemory: boundImportNotes,
  };
}

export const useMemories = useChatMemories;
export const loadMemories = loadChatMemories;
export const saveMemories = saveAllMemories;

// Global modal open/close controller for Memory Sheet
let globalMemoryOpen = false;
const memoryListeners = new Set<(open: boolean) => void>();

function notifyMemoryOpen(open: boolean) {
  globalMemoryOpen = open;
  for (const listener of memoryListeners) {
    try {
      listener(open);
    } catch {}
  }
}

export function openMemorySheet(): void {
  notifyMemoryOpen(true);
}

export function closeMemorySheet(): void {
  notifyMemoryOpen(false);
}

export function toggleMemorySheet(): void {
  notifyMemoryOpen(!globalMemoryOpen);
}

export function useMemorySheetState(): [boolean, (open: boolean) => void] {
  const [isOpen, setIsOpen] = useState(globalMemoryOpen);

  useEffect(() => {
    memoryListeners.add(setIsOpen);
    return () => {
      memoryListeners.delete(setIsOpen);
    };
  }, []);

  return [isOpen, notifyMemoryOpen];
}
