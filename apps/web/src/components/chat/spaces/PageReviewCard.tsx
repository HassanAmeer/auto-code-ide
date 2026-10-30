import { useState, useCallback } from "react";
import {
  FileText,
  CheckCircle2,
  XCircle,
  Clock,
  Sparkles,
  ExternalLink,
  ChevronDown,
  ChevronUp,
  BookOpen,
} from "lucide-react";
import { cn } from "~/lib/utils";
import type { SpacePage } from "~/lib/spacesStore";
import { approveSpacePage, rejectSpacePage } from "~/lib/spacesStore";

export interface PageReviewCardProps {
  page: SpacePage;
  onOpenCanvas?: (page: SpacePage) => void;
  onChipClick?: (chipText: string) => void;
  onStatusChange?: (updatedPage: SpacePage) => void;
}

export function PageReviewCard({
  page: initialPage,
  onOpenCanvas,
  onChipClick,
  onStatusChange,
}: PageReviewCardProps) {
  const [page, setPage] = useState<SpacePage>(initialPage);
  const [isExpanded, setIsExpanded] = useState(false);
  const [isBusy, setIsBusy] = useState(false);

  const isPending = page.status === "review_pending" || page.status === "draft";
  const isApproved = page.status === "approved";
  const isRejected = page.status === "rejected";

  const handleApprove = useCallback(() => {
    setIsBusy(true);
    try {
      const updated = approveSpacePage(page.projectName, page.id);
      if (updated) {
        setPage(updated);
        onStatusChange?.(updated);
      }
    } finally {
      setIsBusy(false);
    }
  }, [page.id, page.projectName, onStatusChange]);

  const handleReject = useCallback(() => {
    setIsBusy(true);
    try {
      const updated = rejectSpacePage(page.projectName, page.id);
      if (updated) {
        setPage(updated);
        onStatusChange?.(updated);
      }
    } finally {
      setIsBusy(false);
    }
  }, [page.id, page.projectName, onStatusChange]);

  // Format Category
  const categoryLabel =
    page.category === "spec"
      ? "Project Specification"
      : page.category === "architecture"
        ? "System Architecture"
        : page.category === "schema"
          ? "Database Schema"
          : page.category === "backlog"
            ? "Feature Backlog"
            : "Living Document";

  return (
    <div className="w-full max-w-xl my-3 select-none">
      {/* Outer Card with subtle glow border */}
      <div
        className={cn(
          "rounded-2xl border transition-all duration-300 shadow-xl overflow-hidden backdrop-blur-md",
          isApproved
            ? "border-emerald-500/40 bg-zinc-900/90 shadow-emerald-950/20"
            : isRejected
              ? "border-rose-500/30 bg-zinc-900/90 shadow-rose-950/20"
              : "border-cyan-500/30 bg-zinc-900/95 shadow-cyan-950/20 hover:border-cyan-500/50",
        )}
      >
        {/* Card Header */}
        <div className="p-4 sm:p-4.5 border-b border-zinc-800/80 bg-zinc-950/40 flex items-start justify-between gap-3">
          <div className="flex items-start gap-3 min-w-0">
            {/* Document Icon with gradient background */}
            <div
              className={cn(
                "size-10 rounded-xl flex items-center justify-center shrink-0 border transition-all",
                isApproved
                  ? "bg-emerald-500/15 border-emerald-500/30 text-emerald-400"
                  : isRejected
                    ? "bg-rose-500/15 border-rose-500/30 text-rose-400"
                    : "bg-cyan-500/15 border-cyan-500/30 text-cyan-400 shadow-sm shadow-cyan-500/20",
              )}
            >
              <FileText className="size-5" />
            </div>

            {/* Title & Category */}
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-[10px] font-mono uppercase tracking-wider px-2 py-0.5 rounded-full bg-zinc-800 text-zinc-400 border border-zinc-700/60 font-semibold">
                  {categoryLabel}
                </span>
                <span className="text-[10px] text-zinc-500 font-mono">
                  Space: <span className="text-zinc-300">{page.spaceName || "Main"}</span>
                </span>
              </div>
              <h4 className="text-sm sm:text-base font-semibold text-zinc-100 truncate mt-1">
                {page.title}
              </h4>
            </div>
          </div>

          {/* Status Badge */}
          <div className="shrink-0">
            {isApproved && (
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
                <CheckCircle2 className="size-3.5" />
                <span>Approved</span>
              </span>
            )}
            {isRejected && (
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-rose-500/15 text-rose-400 border border-rose-500/30">
                <XCircle className="size-3.5" />
                <span>Rejected</span>
              </span>
            )}
            {isPending && (
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-amber-500/15 text-amber-400 border border-amber-500/30 animate-pulse">
                <Clock className="size-3.5" />
                <span>Review Pending</span>
              </span>
            )}
          </div>
        </div>

        {/* Card Body: Summary Bullet Points */}
        {page.summaryItems && page.summaryItems.length > 0 && (
          <div className="p-4 sm:p-4.5 space-y-2 bg-zinc-900/60">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-zinc-400 flex items-center gap-1.5">
              <Sparkles className="size-3 text-cyan-400" />
              <span>Key Proposed Items:</span>
            </span>
            <ul className="space-y-1.5 pl-1">
              {page.summaryItems.map((item, idx) => (
                <li
                  key={idx}
                  className="text-xs sm:text-[13px] text-zinc-300 flex items-start gap-2 leading-relaxed"
                >
                  <span className="size-1.5 rounded-full bg-cyan-400/80 shrink-0 mt-1.5" />
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Collapsible Document Content Preview */}
        {page.content && (
          <div className="border-t border-zinc-800/60 bg-zinc-950/30 px-4 py-2.5">
            <button
              type="button"
              onClick={() => setIsExpanded(!isExpanded)}
              className="w-full flex items-center justify-between text-xs text-zinc-400 hover:text-zinc-200 transition-colors py-1 cursor-pointer"
            >
              <span className="flex items-center gap-1.5 font-medium">
                <BookOpen className="size-3.5 text-zinc-400" />
                <span>{isExpanded ? "Hide Full Document" : "Preview Document Content"}</span>
              </span>
              {isExpanded ? <ChevronUp className="size-4" /> : <ChevronDown className="size-4" />}
            </button>

            {isExpanded && (
              <div className="mt-2.5 p-3 rounded-xl bg-zinc-950 border border-zinc-800 text-xs font-mono text-zinc-300 max-h-48 overflow-y-auto whitespace-pre-wrap leading-relaxed select-text">
                {page.content}
              </div>
            )}
          </div>
        )}

        {/* Action Buttons Footer */}
        <div className="p-3.5 sm:p-4 border-t border-zinc-800/80 bg-zinc-950/60 flex items-center justify-between gap-2.5 flex-wrap">
          <button
            type="button"
            onClick={() => onOpenCanvas?.(page)}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-medium text-zinc-300 bg-zinc-800 hover:bg-zinc-700/80 border border-zinc-700/60 transition-all cursor-pointer active:scale-95"
            title="Open Document in Side Canvas"
          >
            <ExternalLink className="size-3.5 text-cyan-400" />
            <span>Open Living Canvas</span>
          </button>

          <div className="flex items-center gap-2">
            {isPending && (
              <>
                <button
                  type="button"
                  disabled={isBusy}
                  onClick={handleReject}
                  className="flex items-center gap-1 px-3 py-2 rounded-xl text-xs font-medium text-rose-300 bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/30 transition-all cursor-pointer active:scale-95 disabled:opacity-50"
                >
                  <XCircle className="size-3.5" />
                  <span>Reject</span>
                </button>

                <button
                  type="button"
                  disabled={isBusy}
                  onClick={handleApprove}
                  className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-semibold text-emerald-950 bg-emerald-400 hover:bg-emerald-300 shadow-md shadow-emerald-500/20 transition-all cursor-pointer active:scale-95 disabled:opacity-50"
                >
                  <CheckCircle2 className="size-3.5 text-emerald-950" />
                  <span>Approve & Save to Space</span>
                </button>
              </>
            )}

            {isApproved && (
              <span className="text-xs font-medium text-emerald-400 flex items-center gap-1 font-mono">
                <CheckCircle2 className="size-3.5" /> Saved to Spaces
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Quick Reply Chips (OpenDuet-style 1-tap responses) */}
      {page.replyChips && page.replyChips.length > 0 && (
        <div className="flex items-center gap-2 flex-wrap mt-2.5 pl-1">
          <span className="text-[11px] text-zinc-500 font-medium">Quick actions:</span>
          {page.replyChips.map((chip, idx) => (
            <button
              key={idx}
              type="button"
              onClick={() => onChipClick?.(chip)}
              className="px-3 py-1.5 rounded-full text-xs font-medium text-zinc-300 bg-zinc-800/80 hover:bg-zinc-700 hover:text-white border border-zinc-700/70 hover:border-cyan-500/50 shadow-xs transition-all cursor-pointer active:scale-95 flex items-center gap-1.5"
            >
              <span>{chip}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
