import { useState, useCallback, useMemo } from "react";
import {
  FileText,
  X,
  Copy,
  Check,
  Download,
  Edit3,
  Eye,
  CheckSquare,
  Square,
  Sparkles,
  Save,
  FolderOpen,
} from "lucide-react";
import ChatMarkdown from "~/components/ChatMarkdown";
import { cn } from "~/lib/utils";
import type { SpacePage } from "~/lib/spacesStore";
import { upsertSpacePage } from "~/lib/spacesStore";

export interface LivingDocumentCanvasProps {
  page: SpacePage | null;
  onClose: () => void;
  onPageUpdate?: (updated: SpacePage) => void;
}

export function LivingDocumentCanvas({ page, onClose, onPageUpdate }: LivingDocumentCanvasProps) {
  if (!page) return null;

  const [isEditing, setIsEditing] = useState(false);
  const [content, setContent] = useState(page.content);
  const [title, setTitle] = useState(page.title);
  const [isCopied, setIsCopied] = useState(false);
  const [isSaved, setIsSaved] = useState(false);

  // Sync state if incoming page changes
  const currentPageId = page.id;

  const handleSave = useCallback(() => {
    const updated: SpacePage = {
      ...page,
      title: title.trim() || page.title,
      content,
      updatedAt: Date.now(),
    };
    upsertSpacePage(updated);
    onPageUpdate?.(updated);
    setIsSaved(true);
    setTimeout(() => setIsSaved(false), 2000);
  }, [page, title, content, onPageUpdate]);

  const handleCopy = useCallback(() => {
    void navigator.clipboard.writeText(content).then(() => {
      setIsCopied(true);
      setTimeout(() => setIsCopied(false), 2000);
    });
  }, [content]);

  const handleDownload = useCallback(() => {
    const blob = new Blob([content], { type: "text/markdown;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${title.toLowerCase().replace(/[^a-z0-9]+/g, "-") || "document"}.md`;
    a.click();
    URL.revokeObjectURL(url);
  }, [content, title]);

  // Handle interactive checkbox clicking in Markdown
  const handleToggleCheckbox = useCallback(
    (lineIndex: number, originalLine: string) => {
      const lines = content.split("\n");
      if (lines[lineIndex] !== undefined) {
        if (lines[lineIndex].includes("[ ]")) {
          lines[lineIndex] = lines[lineIndex].replace("[ ]", "[x]");
        } else if (lines[lineIndex].includes("[x]")) {
          lines[lineIndex] = lines[lineIndex].replace("[x]", "[ ]");
        }
        const newContent = lines.join("\n");
        setContent(newContent);
        const updated: SpacePage = {
          ...page,
          content: newContent,
          updatedAt: Date.now(),
        };
        upsertSpacePage(updated);
        onPageUpdate?.(updated);
      }
    },
    [content, page, onPageUpdate],
  );

  return (
    <aside className="w-full h-full bg-zinc-950 border-l border-zinc-800 flex flex-col shadow-2xl relative z-30 select-text">
      {/* Top Header / Breadcrumb Bar */}
      <div className="h-14 px-4 sm:px-5 border-b border-zinc-800/80 bg-zinc-900/60 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-2 min-w-0">
          <div className="size-8 rounded-lg bg-cyan-500/10 border border-cyan-500/20 text-cyan-400 flex items-center justify-center shrink-0">
            <FileText className="size-4" />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-1.5 text-[10px] text-zinc-500 font-mono">
              <span className="flex items-center gap-1">
                <FolderOpen className="size-3" /> Spaces
              </span>
              <span>/</span>
              <span className="text-zinc-300 font-semibold">{page.spaceName || "Main"}</span>
            </div>
            <h3 className="text-xs sm:text-sm font-semibold text-zinc-100 truncate">{title}</h3>
          </div>
        </div>

        {/* Action Toolbar */}
        <div className="flex items-center gap-1.5 shrink-0">
          <button
            type="button"
            onClick={() => setIsEditing(!isEditing)}
            className={cn(
              "flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium border transition-all cursor-pointer",
              isEditing
                ? "bg-cyan-500/20 border-cyan-500/40 text-cyan-300"
                : "bg-zinc-800/80 hover:bg-zinc-700 border-zinc-700/60 text-zinc-300",
            )}
            title={isEditing ? "Switch to View Mode" : "Edit Markdown"}
          >
            {isEditing ? <Eye className="size-3.5" /> : <Edit3 className="size-3.5" />}
            <span className="hidden sm:inline">{isEditing ? "View" : "Edit"}</span>
          </button>

          {isEditing && (
            <button
              type="button"
              onClick={handleSave}
              className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-semibold bg-emerald-500 text-emerald-950 hover:bg-emerald-400 transition-all cursor-pointer"
              title="Save Changes"
            >
              {isSaved ? <Check className="size-3.5" /> : <Save className="size-3.5" />}
              <span>{isSaved ? "Saved" : "Save"}</span>
            </button>
          )}

          <button
            type="button"
            onClick={handleCopy}
            className="p-1.5 rounded-lg text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 transition-colors cursor-pointer"
            title="Copy Document Markdown"
          >
            {isCopied ? <Check className="size-4 text-emerald-400" /> : <Copy className="size-4" />}
          </button>

          <button
            type="button"
            onClick={handleDownload}
            className="p-1.5 rounded-lg text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 transition-colors cursor-pointer"
            title="Download Markdown File"
          >
            <Download className="size-4" />
          </button>

          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 transition-colors cursor-pointer ml-1"
            title="Close Living Canvas"
          >
            <X className="size-4" />
          </button>
        </div>
      </div>

      {/* Document Sub-Bar: Tags & Status */}
      <div className="px-5 py-2 border-b border-zinc-800/60 bg-zinc-900/30 flex items-center justify-between text-xs text-zinc-400">
        <div className="flex items-center gap-2">
          <span className="text-[10px] font-mono uppercase px-2 py-0.5 rounded-full bg-zinc-800 text-zinc-300 border border-zinc-700/60">
            {page.category}
          </span>
          <span className="text-[11px] text-zinc-500">
            Updated{" "}
            {new Date(page.updatedAt).toLocaleTimeString([], {
              hour: "2-digit",
              minute: "2-digit",
            })}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[11px] text-zinc-500 font-mono">
            {content.split(/\s+/).filter(Boolean).length} words
          </span>
          <span className="size-1 rounded-full bg-zinc-600" />
          <span className="text-[11px] text-cyan-400/90 font-medium">Living Document</span>
        </div>
      </div>

      {/* Main Document Body */}
      <div className="flex-1 overflow-y-auto p-5 sm:p-7 space-y-4">
        {isEditing ? (
          <div className="h-full flex flex-col space-y-3">
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Document Title..."
              className="w-full text-lg font-bold bg-zinc-900/80 border border-zinc-800 rounded-xl px-3.5 py-2 text-zinc-100 placeholder:text-zinc-600 focus:outline-hidden focus:border-cyan-500/50"
            />
            <textarea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder="Write or edit living document in Markdown..."
              className="w-full flex-1 min-h-[400px] p-4 bg-zinc-900/40 border border-zinc-800/80 rounded-xl font-mono text-xs sm:text-sm text-zinc-200 placeholder:text-zinc-600 focus:outline-hidden focus:border-cyan-500/50 resize-none leading-relaxed"
            />
          </div>
        ) : (
          <div className="prose prose-invert max-w-none text-zinc-200 leading-relaxed">
            <h1 className="text-xl sm:text-2xl font-bold text-zinc-100 tracking-tight pb-2 border-b border-zinc-800 mb-4">
              {title}
            </h1>
            <ChatMarkdown text={content} lineBreaks />
          </div>
        )}
      </div>
    </aside>
  );
}
