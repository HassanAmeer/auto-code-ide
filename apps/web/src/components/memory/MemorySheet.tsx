import React, { useState, useMemo } from "react";
import {
  XIcon,
  PlusIcon,
  Trash2Icon,
  Edit3Icon,
  CheckIcon,
  SearchIcon,
  CopyIcon,
  CalendarIcon,
  SparklesIcon,
  Brain,
  Download,
  CheckSquare,
  Square,
  StickyNote,
  ChevronDown,
  ChevronUp,
  FileText,
  MessageSquare,
  PenTool,
} from "lucide-react";
import { useChatMemories, useMemorySheetState, type MemoryRecord } from "../../lib/memoryStore";
import { useNotes, type NoteItem } from "../../lib/notesStore";
import { useCallSessions } from "../../lib/callAssistantStore";
import { Button } from "../ui/button";

export function MemorySheet() {
  const [isOpen, setIsOpen] = useMemorySheetState();
  const { activeSession } = useCallSessions();
  const { memories, activeChatId, addMemory, updateMemory, deleteMemory, importNotesIntoMemory } =
    useChatMemories();
  const { notes } = useNotes();

  const [searchQuery, setSearchQuery] = useState("");
  const [isCreating, setIsCreating] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  // Form inputs (just title and description as requested)
  const [formTitle, setFormTitle] = useState("");
  const [formDescription, setFormDescription] = useState("");
  const [formSource, setFormSource] = useState<"manual" | "imported_from_notes">("manual");
  const [formSourceNote, setFormSourceNote] = useState<{ id: string; title: string } | undefined>(
    undefined,
  );

  // Notes selection area (Uncollapsed by default)
  const [showNotesPicker, setShowNotesPicker] = useState(true);
  const [selectedNoteIds, setSelectedNoteIds] = useState<Set<string>>(new Set());

  const [copiedId, setCopiedId] = useState<string | null>(null);

  const copyToClipboard = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 1800);
  };

  const handleStartCreate = () => {
    setIsCreating(true);
    setFormTitle("");
    setFormDescription("");
    setFormSource("manual");
    setFormSourceNote(undefined);
    setSelectedNoteIds(new Set());
    setShowNotesPicker(true);
    setEditingId(null);
  };

  const handleSaveForm = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formTitle.trim()) return;

    if (editingId) {
      updateMemory(editingId, {
        title: formTitle.trim(),
        description: formDescription.trim(),
      });
      setEditingId(null);
    } else {
      addMemory(formTitle.trim(), formDescription.trim(), {
        source: formSource,
        sourceNoteId: formSourceNote?.id,
        sourceNoteTitle: formSourceNote?.title,
      });
      setIsCreating(false);
    }

    setFormTitle("");
    setFormDescription("");
    setFormSource("manual");
    setFormSourceNote(undefined);
    setSelectedNoteIds(new Set());
  };

  const handleStartEdit = (record: MemoryRecord) => {
    setEditingId(record.id);
    setFormTitle(record.title);
    setFormDescription(record.description);
    setIsCreating(false);
  };

  const toggleSelectNote = (noteId: string) => {
    setSelectedNoteIds((prev) => {
      const next = new Set(prev);
      if (next.has(noteId)) {
        next.delete(noteId);
      } else {
        next.add(noteId);
      }
      return next;
    });
  };

  // Import selected note into the active form fields
  const handleImportIntoForm = (note: NoteItem) => {
    setFormTitle(note.title);
    setFormDescription(note.content || "");
    setFormSource("imported_from_notes");
    setFormSourceNote({ id: note.id, title: note.title });
  };

  // Direct 1-click import of all selected notes into this chat's memory
  const handleImportSelectedAsRecords = () => {
    const selectedNotes = notes.filter((n) => selectedNoteIds.has(n.id));
    if (!selectedNotes.length) return;

    importNotesIntoMemory(selectedNotes);
    setSelectedNoteIds(new Set());
    setIsCreating(false);
  };

  const formatDate = (timestamp: number) => {
    const d = new Date(timestamp);
    return `${d.toLocaleDateString([], { month: "short", day: "numeric" })} at ${d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`;
  };

  const filteredMemories = useMemo(() => {
    if (!searchQuery.trim()) return memories;
    const q = searchQuery.toLowerCase();
    return memories.filter(
      (m) => m.title.toLowerCase().includes(q) || m.description.toLowerCase().includes(q),
    );
  }, [memories, searchQuery]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[125] flex justify-end">
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/60 backdrop-blur-xs transition-opacity"
        onClick={() => setIsOpen(false)}
      />

      {/* Slide-over Drawer (Cupertino iOS Style, 90% Width on Mobile) */}
      <div className="relative z-[126] flex h-full w-[90vw] max-w-[90vw] sm:w-full sm:max-w-xl md:max-w-2xl flex-col bg-zinc-950 text-zinc-100 border-l border-purple-500/25 shadow-2xl animate-in slide-in-from-right duration-200 overflow-hidden">
        {/* Header with Active Chat Attribution */}
        <div className="flex items-center justify-between border-b border-zinc-800/90 px-3.5 py-2.5 sm:px-4 sm:py-3 bg-zinc-900/90 backdrop-blur-md shrink-0">
          <div className="flex items-center gap-2.5 min-w-0">
            <Brain className="size-4 text-purple-400 shrink-0" />
            <div className="min-w-0">
              <h2 className="text-sm font-semibold tracking-wide text-zinc-100 flex items-center gap-2 truncate">
                <span>Chat Memory Vault</span>
                <span className="rounded-full bg-purple-500/20 text-purple-300 border border-purple-500/30 px-2 py-0.2 text-xs font-mono font-medium shrink-0">
                  {memories.length} records
                </span>
              </h2>
              <div className="flex items-center gap-1.5 text-[10px] text-zinc-400 truncate mt-0.5">
                <MessageSquare className="size-2.5 text-purple-400/80" />
                <span className="truncate">
                  Active Chat:{" "}
                  <span className="text-zinc-200 font-medium">
                    {activeSession?.title || "Current Chat"}
                  </span>
                </span>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
            {!isCreating && (
              <Button
                size="xs"
                variant="outline"
                onClick={handleStartCreate}
                className="h-7 text-xs gap-1 border-purple-500/30 bg-purple-500/10 hover:bg-purple-500/20 text-purple-300 rounded-full px-2.5 cursor-pointer"
              >
                <PlusIcon className="size-3.5" />
                <span className="hidden sm:inline">Add Memory</span>
                <span className="inline sm:hidden">New</span>
              </Button>
            )}

            <button
              type="button"
              onClick={() => setIsOpen(false)}
              className="rounded-full p-1.5 text-zinc-400 hover:bg-zinc-800 hover:text-zinc-100 border border-transparent hover:border-zinc-700 transition-all cursor-pointer active:scale-95"
              title="Close Memory Vault"
            >
              <XIcon className="size-4" />
            </button>
          </div>
        </div>

        {/* Search Toolbar */}
        <div className="flex flex-col gap-2.5 border-b border-zinc-800/80 bg-zinc-900/40 p-3 shrink-0">
          <div className="relative">
            <SearchIcon className="absolute left-2.5 top-1/2 -translate-y-1/2 size-3.5 text-zinc-500" />
            <input
              type="text"
              placeholder="Search active chat memory by title or description..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full rounded-full border border-zinc-800 bg-zinc-900/80 pl-8 pr-8 py-1.5 text-xs text-zinc-200 placeholder-zinc-500 focus:border-purple-500 focus:outline-none transition-all"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery("")}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-zinc-300 cursor-pointer"
              >
                <XIcon className="size-3" />
              </button>
            )}
          </div>
        </div>

        {/* Content Area */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {/* New / Edit Memory Form */}
          {(isCreating || editingId) && (
            <form
              onSubmit={handleSaveForm}
              className="rounded-xl border border-purple-500/40 bg-zinc-900/90 p-4 space-y-3.5 shadow-xl animate-in fade-in duration-150"
            >
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-purple-300 flex items-center gap-1.5">
                  <SparklesIcon className="size-3.5 text-purple-400" />
                  {editingId ? "Edit Chat Memory Record" : "Add New Chat Memory"}
                </span>
                <button
                  type="button"
                  onClick={() => {
                    setIsCreating(false);
                    setEditingId(null);
                  }}
                  className="text-zinc-400 hover:text-zinc-200 cursor-pointer"
                >
                  <XIcon className="size-3.5" />
                </button>
              </div>

              {/* Title input */}
              <div>
                <label className="block text-[11px] font-medium text-zinc-400 mb-1">Title:</label>
                <input
                  type="text"
                  autoFocus
                  placeholder="Record Title (e.g. Supabase Schema, API Rules, Deployment Guide)..."
                  value={formTitle}
                  onChange={(e) => setFormTitle(e.target.value)}
                  className="w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-xs text-zinc-100 placeholder-zinc-500 focus:border-purple-500 focus:outline-none"
                />
              </div>

              {/* Description input */}
              <div>
                <label className="block text-[11px] font-medium text-zinc-400 mb-1">
                  Description / Content:
                </label>
                <textarea
                  rows={4}
                  placeholder="Yahan aap jo bhi likhna chahein khud se likh sakte hain..."
                  value={formDescription}
                  onChange={(e) => setFormDescription(e.target.value)}
                  className="w-full rounded-lg border border-zinc-700 bg-zinc-950 p-3 text-xs text-zinc-200 placeholder-zinc-500 focus:border-purple-500 focus:outline-none resize-y font-mono"
                />
              </div>

              {/* UNCOLLAPSED "Choose from Notes" Selection Area */}
              {notes.length > 0 && !editingId && (
                <div className="rounded-lg border border-amber-500/25 bg-amber-500/5 p-3 space-y-2.5">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-amber-300 flex items-center gap-1.5">
                      <StickyNote className="size-3.5 text-amber-400" />
                      <span>Choose from Notes (List of Titles)</span>
                      <span className="text-[10px] text-zinc-500 font-normal">
                        ({notes.length} notes)
                      </span>
                    </span>

                    <button
                      type="button"
                      onClick={() => setShowNotesPicker(!showNotesPicker)}
                      className="text-zinc-400 hover:text-zinc-200 text-xs flex items-center gap-1 cursor-pointer"
                    >
                      <span className="text-[10px]">
                        {showNotesPicker ? "Collapse" : "Uncollapse"}
                      </span>
                      {showNotesPicker ? (
                        <ChevronUp className="size-3" />
                      ) : (
                        <ChevronDown className="size-3" />
                      )}
                    </button>
                  </div>

                  {showNotesPicker && (
                    <div className="space-y-2 pt-1">
                      <div className="max-h-48 overflow-y-auto space-y-1.5 pr-1">
                        {notes.map((note) => {
                          const isSelected = selectedNoteIds.has(note.id);
                          return (
                            <div
                              key={note.id}
                              className={`flex items-start justify-between gap-2 p-2 rounded-md border text-xs transition-colors ${
                                isSelected
                                  ? "border-amber-500/60 bg-amber-500/15 text-amber-200"
                                  : "border-zinc-800 bg-zinc-950/70 text-zinc-300 hover:border-zinc-700"
                              }`}
                            >
                              <div
                                onClick={() => toggleSelectNote(note.id)}
                                className="flex items-start gap-2 flex-1 cursor-pointer select-none min-w-0"
                              >
                                <button type="button" className="mt-0.5 text-amber-400 shrink-0">
                                  {isSelected ? (
                                    <CheckSquare className="size-3.5" />
                                  ) : (
                                    <Square className="size-3.5 text-zinc-500" />
                                  )}
                                </button>
                                <div className="min-w-0 flex-1">
                                  <div className="font-semibold truncate text-[11px]">
                                    {note.title}
                                  </div>
                                  {note.content && (
                                    <p className="text-[10px] text-zinc-400 truncate mt-0.5">
                                      {note.content}
                                    </p>
                                  )}
                                </div>
                              </div>

                              <button
                                type="button"
                                onClick={() => handleImportIntoForm(note)}
                                className="shrink-0 text-[10px] px-2 py-0.5 rounded bg-zinc-800 hover:bg-zinc-700 text-amber-300 border border-zinc-700 transition-colors cursor-pointer"
                                title="Load this note into the form"
                              >
                                Use in Form
                              </button>
                            </div>
                          );
                        })}
                      </div>

                      {/* Import Action Buttons */}
                      {selectedNoteIds.size > 0 && (
                        <div className="flex items-center justify-between pt-1 border-t border-amber-500/20 text-xs">
                          <span className="text-[11px] text-amber-300 font-mono">
                            {selectedNoteIds.size} note{selectedNoteIds.size === 1 ? "" : "s"}{" "}
                            selected
                          </span>
                          <Button
                            type="button"
                            size="xs"
                            onClick={handleImportSelectedAsRecords}
                            className="h-6 text-[11px] gap-1 bg-amber-500 hover:bg-amber-600 text-zinc-950 font-semibold cursor-pointer"
                          >
                            <Download className="size-3" />
                            <span>Import to This Chat</span>
                          </Button>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}

              {/* Form Buttons */}
              <div className="flex items-center justify-end gap-2 pt-2 border-t border-zinc-800/80">
                <Button
                  type="button"
                  size="xs"
                  variant="ghost"
                  onClick={() => {
                    setIsCreating(false);
                    setEditingId(null);
                  }}
                  className="h-7 text-xs text-zinc-400 hover:text-zinc-200 cursor-pointer"
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  size="xs"
                  disabled={!formTitle.trim()}
                  className="h-7 text-xs bg-purple-600 hover:bg-purple-700 text-white font-semibold cursor-pointer"
                >
                  {editingId ? "Update Memory" : "Save Memory"}
                </Button>
              </div>
            </form>
          )}

          {/* Memory Records List */}
          {filteredMemories.length === 0 ? (
            <div className="flex flex-col items-center justify-center p-12 text-center text-zinc-500">
              <Brain className="size-10 stroke-1 text-purple-400/50 mb-2" />
              <p className="text-xs font-semibold text-zinc-300">No memory saved for this chat</p>
              <p className="text-[11px] text-zinc-500 mt-1 max-w-xs">
                {searchQuery
                  ? "No memory matched your search."
                  : "This chat currently operates with standard AI capabilities. You can add custom permanent rules or import from Notes anytime."}
              </p>
              {!isCreating && (
                <Button
                  size="xs"
                  variant="outline"
                  onClick={handleStartCreate}
                  className="mt-4 text-xs gap-1 border-purple-500/40 text-purple-300 hover:bg-purple-500/10 cursor-pointer"
                >
                  <PlusIcon className="size-3.5" />
                  Add Memory for This Chat
                </Button>
              )}
            </div>
          ) : (
            <div className="space-y-3">
              {filteredMemories.map((record) => {
                const isImported = record.source === "imported_from_notes";

                return (
                  <div
                    key={record.id}
                    className="group relative flex flex-col rounded-xl border border-purple-500/25 bg-zinc-900/60 hover:bg-zinc-900/90 hover:border-purple-500/50 p-3.5 transition-all duration-150 shadow-xs"
                  >
                    {/* Header Row */}
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-start gap-2.5 min-w-0 flex-1">
                        <Brain className="size-4 text-purple-400 mt-0.5 shrink-0" />
                        <div className="min-w-0 flex-1">
                          <h4 className="text-xs font-semibold text-zinc-100 leading-snug break-words">
                            {record.title}
                          </h4>
                        </div>
                      </div>

                      {/* Action Icons */}
                      <div className="flex items-center gap-1 opacity-80 group-hover:opacity-100 transition-opacity shrink-0">
                        <button
                          type="button"
                          onClick={() =>
                            copyToClipboard(
                              `${record.title}\n\n${record.description}`.trim(),
                              record.id,
                            )
                          }
                          className="p-1 rounded text-zinc-500 hover:text-zinc-200 hover:bg-zinc-800/60 transition-colors"
                          title="Copy memory record"
                        >
                          {copiedId === record.id ? (
                            <CheckIcon className="size-3.5 text-emerald-400" />
                          ) : (
                            <CopyIcon className="size-3.5" />
                          )}
                        </button>

                        <button
                          type="button"
                          onClick={() => handleStartEdit(record)}
                          className="p-1 rounded text-zinc-500 hover:text-zinc-200 hover:bg-zinc-800/60 transition-colors"
                          title="Edit memory"
                        >
                          <Edit3Icon className="size-3.5" />
                        </button>

                        <button
                          type="button"
                          onClick={() => deleteMemory(record.id)}
                          className="p-1 rounded text-zinc-500 hover:text-rose-400 hover:bg-zinc-800/60 transition-colors"
                          title="Delete memory record"
                        >
                          <Trash2Icon className="size-3.5" />
                        </button>
                      </div>
                    </div>

                    {/* Description / Content */}
                    {record.description && (
                      <div className="mt-2.5 text-xs text-zinc-300 leading-relaxed whitespace-pre-wrap pl-6.5 font-mono bg-zinc-950/50 p-2.5 rounded-lg border border-zinc-800/60 select-all">
                        {record.description}
                      </div>
                    )}

                    {/* Bottom Timestamp & Source Attribution Badge */}
                    <div className="mt-2.5 pt-2 border-t border-zinc-800/40 flex items-center justify-between text-[10px] text-zinc-500 pl-6.5">
                      <span className="flex items-center gap-1 font-mono">
                        <CalendarIcon className="size-2.5 text-zinc-600" />
                        Updated {formatDate(record.updatedAt)}
                      </span>

                      {/* Source attribution icon & badge */}
                      {isImported ? (
                        <span
                          className="flex items-center gap-1 text-[10px] text-amber-400 font-mono bg-amber-500/10 px-2 py-0.5 rounded-full border border-amber-500/25"
                          title={`Imported from Notes: ${record.sourceNoteTitle || ""}`}
                        >
                          <StickyNote className="size-2.5 text-amber-400" />
                          <span>Imported from Notes</span>
                        </span>
                      ) : (
                        <span
                          className="flex items-center gap-1 text-[10px] text-purple-300 font-mono bg-purple-500/10 px-2 py-0.5 rounded-full border border-purple-500/25"
                          title="Custom written in this chat"
                        >
                          <PenTool className="size-2.5 text-purple-400" />
                          <span>Custom Written</span>
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
        <div className="border-t border-zinc-800/90 px-3.5 py-2.5 bg-zinc-900/90 backdrop-blur-md flex items-center justify-between text-[11px] text-zinc-400 gap-2 shrink-0">
          <div className="flex items-center gap-1.5 min-w-0">
            <span className="truncate">
              {memories.length} record{memories.length === 1 ? "" : "s"} saved for this chat session
            </span>
          </div>

          <button
            type="button"
            onClick={() => setIsOpen(false)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-zinc-800/90 hover:bg-zinc-700 active:scale-95 text-zinc-200 text-xs font-semibold border border-zinc-700/80 shadow-xs transition-all cursor-pointer shrink-0"
            title="Close Memory Vault"
          >
            <XIcon className="size-3.5 text-zinc-400" />
            <span>Close</span>
          </button>
        </div>
      </div>
    </div>
  );
}
