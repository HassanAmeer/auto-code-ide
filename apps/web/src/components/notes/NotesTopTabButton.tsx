import React from "react";
import { CheckSquareIcon, StickyNoteIcon } from "lucide-react";
import { useNotes, openNotesSheet, useNotesSheetState } from "../../lib/notesStore";

interface NotesTopTabButtonProps {
  className?: string;
}

export function NotesTopTabButton({ className = "" }: NotesTopTabButtonProps) {
  const { activeCount, notes } = useNotes();
  const [isOpen] = useNotesSheetState();

  return (
    <button
      type="button"
      onClick={() => openNotesSheet()}
      className={`inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium transition-all duration-150 cursor-pointer [-webkit-app-region:no-drag] ${
        isOpen
          ? "bg-amber-500/20 text-amber-300 border border-amber-500/40 font-semibold shadow-xs"
          : "bg-zinc-800/60 text-zinc-300 hover:bg-zinc-800 hover:text-zinc-100 border border-zinc-700/50 hover:border-zinc-600"
      } ${className}`}
      title="Open Notes & Tasks (Keep reminders, snippets & checklist)"
    >
      <CheckSquareIcon
        className={`size-3.5 transition-colors ${
          isOpen ? "text-amber-400" : "text-amber-400/90 group-hover:text-amber-300"
        }`}
      />
      <span>Notes</span>

      {activeCount > 0 ? (
        <span className="rounded-full bg-amber-500/30 text-amber-200 px-1.5 py-0.2 text-[10px] font-mono font-bold">
          {activeCount}
        </span>
      ) : notes.length > 0 ? (
        <span className="rounded-full bg-zinc-700/60 text-zinc-400 px-1.5 py-0.2 text-[10px] font-mono">
          ✓
        </span>
      ) : null}
    </button>
  );
}
