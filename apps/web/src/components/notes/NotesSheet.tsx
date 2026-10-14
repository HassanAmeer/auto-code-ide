import React, { useState, useMemo } from "react";
import {
  XIcon,
  PlusIcon,
  Trash2Icon,
  Edit3Icon,
  CheckIcon,
  CheckCircle2Icon,
  CircleIcon,
  SearchIcon,
  CopyIcon,
  StickyNoteIcon,
  CheckSquareIcon,
  CalendarIcon,
  TagIcon,
  SparklesIcon,
} from "lucide-react";
import { useNotes, useNotesSheetState, type NoteItem } from "../../lib/notesStore";
import { Button } from "../ui/button";

const COLOR_CLASSES: Record<
  NonNullable<NoteItem["color"]>,
  { border: string; bg: string; dot: string; label: string }
> = {
  default: {
    border: "border-zinc-800",
    bg: "bg-zinc-900/40",
    dot: "bg-zinc-500",
    label: "Default",
  },
  amber: {
    border: "border-amber-500/30",
    bg: "bg-amber-500/5",
    dot: "bg-amber-400",
    label: "Amber",
  },
  emerald: {
    border: "border-emerald-500/30",
    bg: "bg-emerald-500/5",
    dot: "bg-emerald-400",
    label: "Emerald",
  },
  blue: {
    border: "border-blue-500/30",
    bg: "bg-blue-500/5",
    dot: "bg-blue-400",
    label: "Blue",
  },
  purple: {
    border: "border-purple-500/30",
    bg: "bg-purple-500/5",
    dot: "bg-purple-400",
    label: "Purple",
  },
  rose: {
    border: "border-rose-500/30",
    bg: "bg-rose-500/5",
    dot: "bg-rose-400",
    label: "Rose",
  },
};

export function NotesSheet() {
  const [isOpen, setIsOpen] = useNotesSheetState();
  const {
    notes,
    activeCount,
    completedCount,
    addNote,
    updateNote,
    toggleNoteCompleted,
    deleteNote,
    clearCompletedNotes,
  } = useNotes();

  const [filter, setFilter] = useState<"all" | "active" | "completed">("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [isCreating, setIsCreating] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  // New Note Form State
  const [newTitle, setNewTitle] = useState("");
  const [newContent, setNewContent] = useState("");
  const [newColor, setNewColor] = useState<NoteItem["color"]>("default");

  // Edit Form State
  const [editTitle, setEditTitle] = useState("");
  const [editContent, setEditContent] = useState("");
  const [editColor, setEditColor] = useState<NoteItem["color"]>("default");

  const [copiedId, setCopiedId] = useState<string | null>(null);

  const copyToClipboard = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 1800);
  };

  const handleStartCreate = () => {
    setIsCreating(true);
    setNewTitle("");
    setNewContent("");
    setNewColor("default");
    setEditingId(null);
  };

  const handleSaveNew = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTitle.trim()) return;
    addNote(newTitle, newContent, newColor);
    setIsCreating(false);
    setNewTitle("");
    setNewContent("");
  };

  const handleStartEdit = (note: NoteItem) => {
    setEditingId(note.id);
    setEditTitle(note.title);
    setEditContent(note.content);
    setEditColor(note.color || "default");
    setIsCreating(false);
  };

  const handleSaveEdit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingId || !editTitle.trim()) return;
    updateNote(editingId, {
      title: editTitle,
      content: editContent,
      color: editColor,
    });
    setEditingId(null);
  };

  const formatDate = (timestamp: number) => {
    const d = new Date(timestamp);
    return `${d.toLocaleDateString([], { month: "short", day: "numeric" })} at ${d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`;
  };

  const filteredNotes = useMemo(() => {
    return notes.filter((n) => {
      if (filter === "active" && n.completed) return false;
      if (filter === "completed" && !n.completed) return false;
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchesTitle = n.title.toLowerCase().includes(q);
        const matchesContent = n.content.toLowerCase().includes(q);
        return matchesTitle || matchesContent;
      }
      return true;
    });
  }, [notes, filter, searchQuery]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[120] flex justify-end">
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/60 backdrop-blur-xs transition-opacity"
        onClick={() => setIsOpen(false)}
      />

      {/* Slide-over Drawer */}
      <div className="relative z-[121] flex h-full w-full max-w-xl flex-col bg-zinc-950 text-zinc-100 border-l border-zinc-800 shadow-2xl animate-in slide-in-from-right duration-200">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-zinc-800/90 px-4 py-3 bg-zinc-900/80">
          <div className="flex items-center gap-2.5">
            <CheckSquareIcon className="size-4 text-amber-400" />
            <h2 className="text-sm font-semibold tracking-wide text-zinc-100 flex items-center gap-2">
              Notes & Reminders
              <span className="rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/30 px-2 py-0.2 text-xs font-mono font-medium">
                {activeCount} active
              </span>
            </h2>
          </div>

          <div className="flex items-center gap-2">
            {!isCreating && (
              <Button
                size="xs"
                variant="outline"
                onClick={handleStartCreate}
                className="h-7 text-xs gap-1 border-amber-500/30 bg-amber-500/10 hover:bg-amber-500/20 text-amber-300"
              >
                <PlusIcon className="size-3.5" />
                New Note
              </Button>
            )}

            <button
              type="button"
              onClick={() => setIsOpen(false)}
              className="rounded-md p-1.5 text-zinc-400 hover:bg-zinc-800 hover:text-zinc-100 transition-colors cursor-pointer"
            >
              <XIcon className="size-4" />
            </button>
          </div>
        </div>

        {/* Search & Filter Toolbar */}
        <div className="flex flex-col gap-2 border-b border-zinc-800/80 bg-zinc-900/30 p-3">
          <div className="relative">
            <SearchIcon className="absolute left-2.5 top-1/2 -translate-y-1/2 size-3.5 text-zinc-500" />
            <input
              type="text"
              placeholder="Search notes by title or content..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full rounded-md border border-zinc-800 bg-zinc-900/80 pl-8 pr-8 py-1.5 text-xs text-zinc-200 placeholder-zinc-500 focus:border-amber-500 focus:outline-none"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery("")}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-zinc-300"
              >
                <XIcon className="size-3" />
              </button>
            )}
          </div>

          <div className="flex items-center justify-between text-xs pt-1">
            <div className="flex items-center gap-1.5">
              {(
                [
                  { id: "all", label: `All (${notes.length})` },
                  { id: "active", label: `Active (${activeCount})` },
                  { id: "completed", label: `Done (${completedCount})` },
                ] as const
              ).map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setFilter(tab.id)}
                  className={`rounded-full px-2.5 py-0.5 font-medium transition-colors cursor-pointer ${
                    filter === tab.id
                      ? "bg-amber-500/20 text-amber-300 border border-amber-500/40 font-semibold"
                      : "bg-zinc-800/70 text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200"
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            {completedCount > 0 && (
              <button
                type="button"
                onClick={() => clearCompletedNotes()}
                className="text-[11px] text-zinc-500 hover:text-rose-400 transition-colors"
                title="Clear all completed notes"
              >
                Clear completed
              </button>
            )}
          </div>
        </div>

        {/* Content Area */}
        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {/* New Note Form */}
          {isCreating && (
            <form
              onSubmit={handleSaveNew}
              className="rounded-lg border border-amber-500/40 bg-zinc-900/90 p-3.5 space-y-3 shadow-lg animate-in fade-in duration-150"
            >
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-amber-300 flex items-center gap-1.5">
                  <SparklesIcon className="size-3.5 text-amber-400" />
                  Add New Note
                </span>
                <button
                  type="button"
                  onClick={() => setIsCreating(false)}
                  className="text-zinc-400 hover:text-zinc-200"
                >
                  <XIcon className="size-3.5" />
                </button>
              </div>

              <div>
                <input
                  type="text"
                  autoFocus
                  placeholder="Note title (required)..."
                  value={newTitle}
                  onChange={(e) => setNewTitle(e.target.value)}
                  className="w-full rounded border border-zinc-700 bg-zinc-950 px-2.5 py-1.5 text-xs text-zinc-100 placeholder-zinc-500 focus:border-amber-500 focus:outline-none"
                />
              </div>

              <div>
                <textarea
                  rows={3}
                  placeholder="Note content, code snippets, reminders (optional)..."
                  value={newContent}
                  onChange={(e) => setNewContent(e.target.value)}
                  className="w-full rounded border border-zinc-700 bg-zinc-950 p-2.5 text-xs text-zinc-200 placeholder-zinc-500 focus:border-amber-500 focus:outline-none resize-y"
                />
              </div>

              {/* Color Tag Selection */}
              <div className="flex items-center justify-between pt-1">
                <div className="flex items-center gap-1.5">
                  <span className="text-[11px] text-zinc-400">Color:</span>
                  {(["default", "amber", "emerald", "blue", "purple", "rose"] as const).map((c) => (
                    <button
                      key={c}
                      type="button"
                      onClick={() => setNewColor(c)}
                      className={`size-4 rounded-full transition-transform ${COLOR_CLASSES[c].dot} ${
                        newColor === c
                          ? "ring-2 ring-white scale-110"
                          : "opacity-60 hover:opacity-100"
                      }`}
                      title={COLOR_CLASSES[c].label}
                    />
                  ))}
                </div>

                <div className="flex items-center gap-1.5">
                  <Button
                    type="button"
                    size="xs"
                    variant="ghost"
                    onClick={() => setIsCreating(false)}
                    className="h-7 text-xs text-zinc-400 hover:text-zinc-200"
                  >
                    Cancel
                  </Button>
                  <Button
                    type="submit"
                    size="xs"
                    disabled={!newTitle.trim()}
                    className="h-7 text-xs bg-amber-500 hover:bg-amber-600 text-zinc-950 font-semibold"
                  >
                    Save Note
                  </Button>
                </div>
              </div>
            </form>
          )}

          {/* Notes List */}
          {filteredNotes.length === 0 ? (
            <div className="flex flex-col items-center justify-center p-12 text-center text-zinc-500">
              <StickyNoteIcon className="size-10 stroke-1 text-zinc-600 mb-2" />
              <p className="text-xs font-semibold text-zinc-400">No notes found</p>
              <p className="text-[11px] text-zinc-600 mt-1 max-w-xs">
                {searchQuery
                  ? "No notes matched your search query."
                  : filter === "completed"
                    ? "No completed notes yet."
                    : "Add reminders, prompts, keys, or checklist tasks to keep track of everything."}
              </p>
              {!isCreating && (
                <Button
                  size="xs"
                  variant="outline"
                  onClick={handleStartCreate}
                  className="mt-4 text-xs gap-1 border-amber-500/40 text-amber-300 hover:bg-amber-500/10"
                >
                  <PlusIcon className="size-3.5" />
                  Add Your First Note
                </Button>
              )}
            </div>
          ) : (
            <div className="space-y-2.5">
              {filteredNotes.map((note) => {
                const colorConfig = COLOR_CLASSES[note.color || "default"];
                const isEditing = editingId === note.id;

                if (isEditing) {
                  return (
                    <form
                      key={note.id}
                      onSubmit={handleSaveEdit}
                      className="rounded-lg border border-amber-500/50 bg-zinc-900/90 p-3 space-y-2.5 shadow-md"
                    >
                      <input
                        type="text"
                        autoFocus
                        value={editTitle}
                        onChange={(e) => setEditTitle(e.target.value)}
                        className="w-full rounded border border-zinc-700 bg-zinc-950 px-2 py-1 text-xs text-zinc-100 focus:border-amber-500 focus:outline-none"
                      />
                      <textarea
                        rows={3}
                        value={editContent}
                        onChange={(e) => setEditContent(e.target.value)}
                        className="w-full rounded border border-zinc-700 bg-zinc-950 p-2 text-xs text-zinc-200 focus:border-amber-500 focus:outline-none resize-y"
                      />
                      <div className="flex items-center justify-between pt-1">
                        <div className="flex items-center gap-1.5">
                          {(["default", "amber", "emerald", "blue", "purple", "rose"] as const).map(
                            (c) => (
                              <button
                                key={c}
                                type="button"
                                onClick={() => setEditColor(c)}
                                className={`size-3.5 rounded-full ${COLOR_CLASSES[c].dot} ${
                                  editColor === c ? "ring-2 ring-white scale-110" : "opacity-60"
                                }`}
                              />
                            ),
                          )}
                        </div>

                        <div className="flex items-center gap-1.5">
                          <Button
                            type="button"
                            size="xs"
                            variant="ghost"
                            onClick={() => setEditingId(null)}
                            className="h-6 text-[11px] text-zinc-400"
                          >
                            Cancel
                          </Button>
                          <Button
                            type="submit"
                            size="xs"
                            disabled={!editTitle.trim()}
                            className="h-6 text-[11px] bg-amber-500 hover:bg-amber-600 text-zinc-950 font-semibold"
                          >
                            Save
                          </Button>
                        </div>
                      </div>
                    </form>
                  );
                }

                return (
                  <div
                    key={note.id}
                    className={`group relative flex flex-col rounded-lg border p-3 transition-all duration-150 ${
                      colorConfig.border
                    } ${colorConfig.bg} ${
                      note.completed
                        ? "opacity-60 bg-zinc-950/40 border-zinc-800/40"
                        : "hover:border-zinc-700/80 hover:shadow-sm"
                    }`}
                  >
                    {/* Top Row: Checkmark + Title + Action Buttons */}
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-start gap-2.5 min-w-0 flex-1">
                        {/* Checkmark Button */}
                        <button
                          type="button"
                          onClick={() => toggleNoteCompleted(note.id)}
                          className="mt-0.5 shrink-0 text-zinc-400 hover:text-emerald-400 transition-colors cursor-pointer"
                          title={
                            note.completed ? "Mark as active" : "Mark as completed (check mark)"
                          }
                        >
                          {note.completed ? (
                            <CheckCircle2Icon className="size-4 text-emerald-400 fill-emerald-400/20" />
                          ) : (
                            <CircleIcon className="size-4 text-zinc-500 hover:text-emerald-400 transition-colors" />
                          )}
                        </button>

                        <div className="min-w-0 flex-1">
                          <h4
                            onClick={() => toggleNoteCompleted(note.id)}
                            className={`text-xs font-semibold cursor-pointer select-none leading-snug break-words ${
                              note.completed
                                ? "line-through text-zinc-500"
                                : "text-zinc-100 hover:text-amber-200"
                            }`}
                          >
                            {note.title}
                          </h4>
                        </div>
                      </div>

                      {/* Action Icons */}
                      <div className="flex items-center gap-1 opacity-80 group-hover:opacity-100 transition-opacity shrink-0">
                        <button
                          type="button"
                          onClick={() =>
                            copyToClipboard(`${note.title}\n\n${note.content}`.trim(), note.id)
                          }
                          className="p-1 rounded text-zinc-500 hover:text-zinc-200 hover:bg-zinc-800/60 transition-colors"
                          title="Copy note content"
                        >
                          {copiedId === note.id ? (
                            <CheckIcon className="size-3.5 text-emerald-400" />
                          ) : (
                            <CopyIcon className="size-3.5" />
                          )}
                        </button>

                        <button
                          type="button"
                          onClick={() => handleStartEdit(note)}
                          className="p-1 rounded text-zinc-500 hover:text-zinc-200 hover:bg-zinc-800/60 transition-colors"
                          title="Edit note"
                        >
                          <Edit3Icon className="size-3.5" />
                        </button>

                        <button
                          type="button"
                          onClick={() => deleteNote(note.id)}
                          className="p-1 rounded text-zinc-500 hover:text-rose-400 hover:bg-zinc-800/60 transition-colors"
                          title="Delete note"
                        >
                          <Trash2Icon className="size-3.5" />
                        </button>
                      </div>
                    </div>

                    {/* Note Content / Description */}
                    {note.content && (
                      <div
                        className={`mt-2 text-[11px] leading-relaxed whitespace-pre-wrap pl-6.5 break-words font-sans ${
                          note.completed ? "text-zinc-500 line-through" : "text-zinc-300"
                        }`}
                      >
                        {note.content}
                      </div>
                    )}

                    {/* Bottom Metadata */}
                    <div className="mt-2.5 pt-2 border-t border-zinc-800/40 flex items-center justify-between text-[10px] text-zinc-500 pl-6.5">
                      <span className="flex items-center gap-1 font-mono">
                        <CalendarIcon className="size-2.5 text-zinc-600" />
                        {formatDate(note.updatedAt)}
                      </span>

                      {note.completed && (
                        <span className="text-[10px] font-mono text-emerald-400 bg-emerald-500/10 px-1.5 py-0.2 rounded border border-emerald-500/20">
                          ✓ Completed
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="border-t border-zinc-800 px-4 py-2.5 bg-zinc-900/60 flex items-center justify-between text-[11px] text-zinc-400">
          <span>
            {notes.length} total note{notes.length === 1 ? "" : "s"} ({completedCount} completed)
          </span>
          <span className="text-zinc-500 text-[10px]">Saved securely in your browser</span>
        </div>
      </div>
    </div>
  );
}
