import { saveServerSetting } from "./serverSettingsSync";
import { useState, useEffect } from "react";

export interface NoteItem {
  id: string;
  title: string;
  content: string;
  completed: boolean;
  createdAt: number;
  updatedAt: number;
  color?: "default" | "amber" | "emerald" | "blue" | "purple" | "rose";
}

const STORAGE_KEY = "t3code:user-notes:v1";

// In-memory cache + event dispatch for cross-component reactivity
export function loadNotes(): NoteItem[] {
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
    console.warn("Failed to load user notes:", err);
    return [];
  }
}

export function saveNotes(notes: NoteItem[]): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(notes));
    // Notes are user content: the live database keeps the copy that follows
    // the user to another machine.
    void saveServerSetting(STORAGE_KEY, notes);
    window.dispatchEvent(new CustomEvent("t3-notes-changed", { detail: notes }));
  } catch (err) {
    console.warn("Failed to save user notes:", err);
  }
}

export function addNote(
  title: string,
  content: string = "",
  color: NoteItem["color"] = "default",
): NoteItem {
  const current = loadNotes();
  const now = Date.now();
  const newNote: NoteItem = {
    id: "note-" + now + "-" + Math.random().toString(36).slice(2, 7),
    title: title.trim(),
    content: content.trim(),
    completed: false,
    createdAt: now,
    updatedAt: now,
    color,
  };
  const updated = [newNote, ...current];
  saveNotes(updated);
  return newNote;
}

export function updateNote(
  id: string,
  patch: Partial<Pick<NoteItem, "title" | "content" | "completed" | "color">>,
): void {
  const current = loadNotes();
  const idx = current.findIndex((n) => n.id === id);
  if (idx === -1) return;

  const updatedItem: NoteItem = {
    ...current[idx]!,
    ...patch,
    updatedAt: Date.now(),
  };
  const updated = [...current];
  updated[idx] = updatedItem;
  saveNotes(updated);
}

export function toggleNoteCompleted(id: string): void {
  const current = loadNotes();
  const item = current.find((n) => n.id === id);
  if (!item) return;
  updateNote(id, { completed: !item.completed });
}

export function deleteNote(id: string): void {
  const current = loadNotes();
  const filtered = current.filter((n) => n.id !== id);
  saveNotes(filtered);
}

export function clearCompletedNotes(): void {
  const current = loadNotes();
  const filtered = current.filter((n) => !n.completed);
  saveNotes(filtered);
}

// React Hook for notes
export function useNotes(): {
  notes: NoteItem[];
  activeCount: number;
  completedCount: number;
  addNote: typeof addNote;
  updateNote: typeof updateNote;
  toggleNoteCompleted: typeof toggleNoteCompleted;
  deleteNote: typeof deleteNote;
  clearCompletedNotes: typeof clearCompletedNotes;
} {
  const [notes, setNotes] = useState<NoteItem[]>(loadNotes);

  useEffect(() => {
    setNotes(loadNotes());

    const handler = (e: Event) => {
      const custom = e as CustomEvent<NoteItem[]>;
      if (Array.isArray(custom.detail)) {
        setNotes(custom.detail);
      } else {
        setNotes(loadNotes());
      }
    };

    window.addEventListener("t3-notes-changed", handler);
    window.addEventListener("storage", handler);
    return () => {
      window.removeEventListener("t3-notes-changed", handler);
      window.removeEventListener("storage", handler);
    };
  }, []);

  const activeCount = notes.filter((n) => !n.completed).length;
  const completedCount = notes.filter((n) => n.completed).length;

  return {
    notes,
    activeCount,
    completedCount,
    addNote,
    updateNote,
    toggleNoteCompleted,
    deleteNote,
    clearCompletedNotes,
  };
}

// Global modal open/close controller
let globalNotesOpen = false;
const listeners = new Set<(open: boolean) => void>();

function notifyOpen(open: boolean) {
  globalNotesOpen = open;
  for (const listener of listeners) {
    try {
      listener(open);
    } catch {}
  }
}

export function openNotesSheet(): void {
  notifyOpen(true);
}

export function closeNotesSheet(): void {
  notifyOpen(false);
}

export function toggleNotesSheet(): void {
  notifyOpen(!globalNotesOpen);
}

export function useNotesSheetState(): [boolean, (open: boolean) => void] {
  const [isOpen, setIsOpen] = useState(globalNotesOpen);

  useEffect(() => {
    listeners.add(setIsOpen);
    return () => {
      listeners.delete(setIsOpen);
    };
  }, []);

  return [isOpen, notifyOpen];
}
