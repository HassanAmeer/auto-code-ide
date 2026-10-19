import { memo, useState, useRef, useEffect, useMemo } from "react";
import {
  Terminal,
  Search,
  Copy,
  Check,
  Trash2,
  X,
  ChevronDown,
  ChevronUp,
  AlertCircle,
  Network,
  FileCode,
  ArrowUpDown,
  Maximize2,
  Minimize2,
  Sparkles,
} from "lucide-react";
import { useBrowserLogsStore, type BrowserLogsFilter } from "~/browser/browserLogsStore";
import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import { Tooltip, TooltipPopup, TooltipTrigger } from "~/components/ui/tooltip";
import { toastManager } from "~/components/ui/toast";
import { cn } from "~/lib/utils";
import type {
  PreviewAutomationConsoleEntry,
  PreviewAutomationNetworkEntry,
  ScopedThreadRef,
} from "@t3tools/contracts";
import { useComposerDraftStore } from "~/composerDraftStore";

interface UnifiedLogItem {
  id: string;
  kind: "console" | "network";
  timestamp: string;
  isError: boolean;
  consoleEntry?: PreviewAutomationConsoleEntry;
  networkEntry?: PreviewAutomationNetworkEntry;
}

interface BrowserLogsSectionProps {
  tabId: string;
  threadRef?: ScopedThreadRef;
  onClose?: () => void;
  className?: string;
}

export const BrowserLogsSection = memo(function BrowserLogsSection({
  tabId,
  threadRef,
  onClose,
  className,
}: BrowserLogsSectionProps) {
  const store = useBrowserLogsStore();
  const tabLogs = store.logsByTab[tabId] || { consoleEntries: [], networkEntries: [] };
  const [filter, setFilter] = useState<BrowserLogsFilter>(store.activeFilter);
  const [search, setSearch] = useState(store.searchQuery);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [isCopiedAll, setIsCopiedAll] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);

  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const shouldAutoScrollRef = useRef(true);

  // Combine and sort logs chronologically
  const unifiedLogs = useMemo<UnifiedLogItem[]>(() => {
    const items: UnifiedLogItem[] = [];

    tabLogs.consoleEntries.forEach((c, idx) => {
      items.push({
        id: `c-${idx}-${c.timestamp}`,
        kind: "console",
        timestamp: c.timestamp,
        isError: c.level === "error",
        consoleEntry: c,
      });
    });

    tabLogs.networkEntries.forEach((n, idx) => {
      const isErr = n.failed || (n.status !== null && n.status >= 400);
      items.push({
        id: `n-${idx}-${n.timestamp}`,
        kind: "network",
        timestamp: n.timestamp,
        isError: isErr,
        networkEntry: n,
      });
    });

    items.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
    return items;
  }, [tabLogs]);

  // Counts
  const consoleCount = tabLogs.consoleEntries.length;
  const networkCount = tabLogs.networkEntries.length;
  const errorCount = useMemo(() => {
    const cErr = tabLogs.consoleEntries.filter((c) => c.level === "error").length;
    const nErr = tabLogs.networkEntries.filter(
      (n) => n.failed || (n.status !== null && n.status >= 400),
    ).length;
    return cErr + nErr;
  }, [tabLogs]);

  // Filtered logs
  const filteredLogs = useMemo(() => {
    return unifiedLogs.filter((item) => {
      // Category Filter
      if (filter === "console" && item.kind !== "console") return false;
      if (filter === "network" && item.kind !== "network") return false;
      if (filter === "errors" && !item.isError) return false;

      // Search Query Filter
      if (search.trim()) {
        const query = search.toLowerCase();
        if (item.kind === "console" && item.consoleEntry) {
          return (
            item.consoleEntry.text.toLowerCase().includes(query) ||
            item.consoleEntry.level.toLowerCase().includes(query) ||
            (item.consoleEntry.source && item.consoleEntry.source.toLowerCase().includes(query))
          );
        }
        if (item.kind === "network" && item.networkEntry) {
          return (
            item.networkEntry.url.toLowerCase().includes(query) ||
            item.networkEntry.method.toLowerCase().includes(query) ||
            String(item.networkEntry.status ?? "").includes(query) ||
            (item.networkEntry.errorText &&
              item.networkEntry.errorText.toLowerCase().includes(query))
          );
        }
      }

      return true;
    });
  }, [unifiedLogs, filter, search]);

  // Auto-scroll when new logs arrive if user hasn't scrolled up
  useEffect(() => {
    if (shouldAutoScrollRef.current && scrollContainerRef.current) {
      scrollContainerRef.current.scrollTop = scrollContainerRef.current.scrollHeight;
    }
  }, [filteredLogs.length]);

  const handleScroll = () => {
    if (!scrollContainerRef.current) return;
    const { scrollTop, scrollHeight, clientHeight } = scrollContainerRef.current;
    // User is near bottom within 40px
    shouldAutoScrollRef.current = scrollHeight - scrollTop - clientHeight < 40;
  };

  const handleCopyAll = async () => {
    if (filteredLogs.length === 0) return;
    const formatted = filteredLogs
      .map((item) => {
        const time = new Date(item.timestamp).toLocaleTimeString();
        if (item.kind === "console" && item.consoleEntry) {
          return `[${time}] [CONSOLE:${item.consoleEntry.level.toUpperCase()}] ${item.consoleEntry.text}`;
        }
        if (item.kind === "network" && item.networkEntry) {
          const status = item.networkEntry.failed
            ? `FAILED (${item.networkEntry.errorText || "Error"})`
            : (item.networkEntry.status ?? "PENDING");
          return `[${time}] [NETWORK:${item.networkEntry.method}] ${status} ${item.networkEntry.url}`;
        }
        return "";
      })
      .filter(Boolean)
      .join("\n");

    try {
      await navigator.clipboard.writeText(formatted);
      setIsCopiedAll(true);
      setTimeout(() => setIsCopiedAll(false), 2000);
      toastManager.add({
        type: "success",
        title: "Logs copied",
        description: `Copied ${filteredLogs.length} log entries to clipboard.`,
      });
    } catch {
      toastManager.add({
        type: "error",
        title: "Copy failed",
        description: "Failed to copy logs to clipboard.",
      });
    }
  };

  const handleCopySingle = async (item: UnifiedLogItem) => {
    let text = "";
    if (item.kind === "console" && item.consoleEntry) {
      text = item.consoleEntry.text;
    } else if (item.kind === "network" && item.networkEntry) {
      text = `${item.networkEntry.method} ${item.networkEntry.status ?? "FAILED"} ${item.networkEntry.url}`;
    }
    if (!text) return;

    try {
      await navigator.clipboard.writeText(text);
      setCopiedId(item.id);
      setTimeout(() => setCopiedId(null), 1500);
    } catch {}
  };

  const handleClear = () => {
    store.clearLogs(tabId);
    toastManager.add({
      type: "info",
      title: "Logs cleared",
      description: "Cleared all browser logs for this tab.",
    });
  };

  const handleFixWithAi = async () => {
    const errorDetails = store.getFormattedErrorsForAi(tabId);
    if (!errorDetails) {
      toastManager.add({
        type: "info",
        title: "No runtime errors found",
        description: "The debug console has not captured any errors yet.",
      });
      return;
    }

    const fixPrompt = `Fix the following runtime errors and issues found in the live preview debug console:\n\n${errorDetails}\n\nPlease diagnose the root cause and provide the complete working code to fix it.`;

    try {
      await navigator.clipboard.writeText(fixPrompt);
    } catch {}

    if (threadRef) {
      useComposerDraftStore.getState().setPrompt(threadRef, fixPrompt);
    }

    const rawErrors = store.getRawErrorsForSync(tabId);
    if (rawErrors.length > 0 && threadRef?.threadId) {
      fetch("/api/preview/sync-logs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          threadId: threadRef.threadId,
          errors: rawErrors,
        }),
      }).catch(() => {});
    }

    toastManager.add({
      type: "success",
      title: "Loaded into AI Prompt",
      description: "Debug console errors copied & populated into chat prompt.",
    });
  };

  const formatTime = (iso: string) => {
    try {
      const d = new Date(iso);
      return (
        d.toLocaleTimeString([], {
          hour12: false,
          hour: "2-digit",
          minute: "2-digit",
          second: "2-digit",
        }) +
        "." +
        String(d.getMilliseconds()).padStart(3, "0")
      );
    } catch {
      return iso;
    }
  };

  return (
    <div
      className={cn(
        "flex flex-col border-t border-border/80 bg-zinc-950 text-foreground transition-all duration-200 select-text z-20 shadow-lg",
        isExpanded ? "h-96" : "h-56",
        className,
      )}
    >
      {/* 1. Header Toolbar */}
      <div className="flex items-center justify-between gap-2 px-3 py-1.5 border-b border-zinc-800/80 bg-zinc-900/90 backdrop-blur-xs select-none">
        {/* Left: Title + Filter Badges */}
        <div className="flex items-center gap-2 overflow-x-auto [scrollbar-width:none]">
          <div className="flex items-center gap-1.5 text-xs font-semibold text-zinc-200 shrink-0 mr-1">
            <Terminal className="size-3.5 text-primary" />
            <span>Browser Logs</span>
          </div>

          <div className="flex items-center gap-1 bg-zinc-950/60 p-0.5 rounded-md border border-zinc-800/80 shrink-0">
            {/* All */}
            <button
              type="button"
              onClick={() => setFilter("all")}
              className={cn(
                "px-2 py-0.5 rounded-[4px] text-3xs font-medium transition-colors cursor-pointer",
                filter === "all"
                  ? "bg-zinc-800 text-zinc-100 font-semibold shadow-xs"
                  : "text-zinc-400 hover:text-zinc-200",
              )}
            >
              All ({unifiedLogs.length})
            </button>

            {/* Console */}
            <button
              type="button"
              onClick={() => setFilter("console")}
              className={cn(
                "flex items-center gap-1 px-2 py-0.5 rounded-[4px] text-3xs font-medium transition-colors cursor-pointer",
                filter === "console"
                  ? "bg-zinc-800 text-zinc-100 font-semibold shadow-xs"
                  : "text-zinc-400 hover:text-zinc-200",
              )}
            >
              <span>Console</span>
              <span className="text-4xs text-zinc-500 font-mono">({consoleCount})</span>
            </button>

            {/* Network */}
            <button
              type="button"
              onClick={() => setFilter("network")}
              className={cn(
                "flex items-center gap-1 px-2 py-0.5 rounded-[4px] text-3xs font-medium transition-colors cursor-pointer",
                filter === "network"
                  ? "bg-zinc-800 text-zinc-100 font-semibold shadow-xs"
                  : "text-zinc-400 hover:text-zinc-200",
              )}
            >
              <span>Network</span>
              <span className="text-4xs text-zinc-500 font-mono">({networkCount})</span>
            </button>

            {/* Errors */}
            <button
              type="button"
              onClick={() => setFilter("errors")}
              className={cn(
                "flex items-center gap-1 px-2 py-0.5 rounded-[4px] text-3xs font-medium transition-colors cursor-pointer",
                filter === "errors"
                  ? "bg-red-500/20 text-red-300 font-semibold border border-red-500/40 shadow-xs"
                  : errorCount > 0
                    ? "text-red-400 hover:bg-red-500/10"
                    : "text-zinc-400 hover:text-zinc-200",
              )}
            >
              <span>Errors</span>
              <span
                className={cn(
                  "px-1 py-0.2 rounded-full text-4xs font-mono font-bold",
                  errorCount > 0 ? "bg-red-500 text-white" : "bg-zinc-800 text-zinc-500",
                )}
              >
                {errorCount}
              </span>
            </button>
          </div>
        </div>

        {/* Right: Search, Copy, Clear, Expand, Close */}
        <div className="flex items-center gap-1.5 shrink-0">
          {/* Search Box */}
          <div className="relative flex items-center">
            <Search className="absolute left-2 size-3 text-zinc-500 pointer-events-none" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Filter logs..."
              className="h-6 w-28 sm:w-36 pl-6 pr-2 rounded-[5px] bg-zinc-950 border border-zinc-800 text-3xs text-zinc-200 placeholder:text-zinc-600 focus:outline-hidden focus:border-zinc-700 transition-colors"
            />
            {search && (
              <button
                type="button"
                onClick={() => setSearch("")}
                className="absolute right-1 text-zinc-500 hover:text-zinc-300 cursor-pointer p-0.5"
              >
                <X className="size-2.5" />
              </button>
            )}
          </div>

          {/* Fix with AI Button */}
          <Tooltip>
            <TooltipTrigger
              render={
                <Button
                  variant="outline"
                  size="xs"
                  onClick={handleFixWithAi}
                  aria-label="Fix with AI"
                  type="button"
                  className="h-6 px-2 gap-1 bg-amber-500/10 hover:bg-amber-500/20 text-amber-300 border-amber-500/30 text-3xs font-medium cursor-pointer shadow-xs"
                >
                  <Sparkles className="size-3 text-amber-400" />
                  <span>Fix with AI</span>
                </Button>
              }
            />
            <TooltipPopup>Load captured errors into AI chat prompt</TooltipPopup>
          </Tooltip>

          {/* Copy All Button */}
          <Tooltip>
            <TooltipTrigger
              render={
                <Button
                  variant="ghost"
                  size="icon-xs"
                  onClick={handleCopyAll}
                  aria-label="Copy logs"
                  type="button"
                  className="h-6 w-6 text-zinc-400 hover:text-zinc-100 cursor-pointer"
                />
              }
            >
              {isCopiedAll ? (
                <Check className="size-3 text-emerald-400" />
              ) : (
                <Copy className="size-3" />
              )}
            </TooltipTrigger>
            <TooltipPopup>Copy filtered logs to clipboard</TooltipPopup>
          </Tooltip>

          {/* Clear Button */}
          <Tooltip>
            <TooltipTrigger
              render={
                <Button
                  variant="ghost"
                  size="icon-xs"
                  onClick={handleClear}
                  aria-label="Clear logs"
                  type="button"
                  className="h-6 w-6 text-zinc-400 hover:text-destructive cursor-pointer"
                />
              }
            >
              <Trash2 className="size-3" />
            </TooltipTrigger>
            <TooltipPopup>Clear logs</TooltipPopup>
          </Tooltip>

          {/* Expand/Collapse Toggle */}
          <Tooltip>
            <TooltipTrigger
              render={
                <Button
                  variant="ghost"
                  size="icon-xs"
                  onClick={() => setIsExpanded((prev) => !prev)}
                  aria-label={isExpanded ? "Collapse panel" : "Expand panel"}
                  type="button"
                  className="h-6 w-6 text-zinc-400 hover:text-zinc-100 cursor-pointer"
                />
              }
            >
              {isExpanded ? <Minimize2 className="size-3" /> : <Maximize2 className="size-3" />}
            </TooltipTrigger>
            <TooltipPopup>{isExpanded ? "Collapse height" : "Expand height"}</TooltipPopup>
          </Tooltip>

          {/* Close Button */}
          {onClose && (
            <Tooltip>
              <TooltipTrigger
                render={
                  <Button
                    variant="ghost"
                    size="icon-xs"
                    onClick={onClose}
                    aria-label="Close logs panel"
                    type="button"
                    className="h-6 w-6 text-zinc-400 hover:text-zinc-100 cursor-pointer"
                  />
                }
              >
                <X className="size-3" />
              </TooltipTrigger>
              <TooltipPopup>Close logs</TooltipPopup>
            </Tooltip>
          )}
        </div>
      </div>

      {/* 2. Logs Content List */}
      <div
        ref={scrollContainerRef}
        onScroll={handleScroll}
        className="flex-1 overflow-y-auto font-mono text-3xs p-1 space-y-0.5 divide-y divide-zinc-900/60"
      >
        {filteredLogs.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-zinc-500 py-8 gap-1.5 select-none font-sans">
            <Terminal className="size-5 opacity-40" />
            <p className="text-xs">{search ? "No matching logs found" : "No logs captured yet"}</p>
            <p className="text-3xs text-zinc-600">
              Console messages, network requests, and JavaScript errors will appear here live.
            </p>
          </div>
        ) : (
          filteredLogs.map((item) => {
            const isCopied = copiedId === item.id;

            if (item.kind === "console" && item.consoleEntry) {
              const entry = item.consoleEntry;
              const isErr = entry.level === "error";
              const isWarn = entry.level === "warning" || entry.level === "warn";
              const isInfo = entry.level === "info";

              return (
                <div
                  key={item.id}
                  className={cn(
                    "flex items-start gap-2 px-2 py-1 rounded-[3px] transition-colors group relative hover:bg-zinc-900/60",
                    isErr && "bg-red-500/10 text-red-200 border-l-2 border-red-500",
                    isWarn && "bg-amber-500/10 text-amber-200 border-l-2 border-amber-500",
                    isInfo && "text-sky-200",
                    !isErr && !isWarn && !isInfo && "text-zinc-300",
                  )}
                >
                  {/* Timestamp */}
                  <span className="text-zinc-500 shrink-0 tabular-nums">
                    {formatTime(entry.timestamp)}
                  </span>

                  {/* Level Pill */}
                  <span
                    className={cn(
                      "px-1 py-0.2 rounded text-4xs font-bold uppercase shrink-0",
                      isErr && "bg-red-500/20 text-red-400 border border-red-500/30",
                      isWarn && "bg-amber-500/20 text-amber-400 border border-amber-500/30",
                      isInfo && "bg-sky-500/20 text-sky-400 border border-sky-500/30",
                      !isErr &&
                        !isWarn &&
                        !isInfo &&
                        "bg-zinc-800 text-zinc-400 border border-zinc-700/60",
                    )}
                  >
                    {entry.level}
                  </span>

                  {/* Log Message Text */}
                  <div className="flex-1 min-w-0 break-words whitespace-pre-wrap leading-relaxed select-text font-mono">
                    {entry.text}
                  </div>

                  {/* Quick Copy Button on Hover */}
                  <button
                    type="button"
                    onClick={() => handleCopySingle(item)}
                    title="Copy message"
                    className="opacity-0 group-hover:opacity-100 p-0.5 rounded hover:bg-zinc-800 text-zinc-400 hover:text-zinc-200 transition-opacity cursor-pointer shrink-0 ml-1"
                  >
                    {isCopied ? (
                      <Check className="size-2.5 text-emerald-400" />
                    ) : (
                      <Copy className="size-2.5" />
                    )}
                  </button>
                </div>
              );
            }

            if (item.kind === "network" && item.networkEntry) {
              const entry = item.networkEntry;
              const isErr = item.isError;
              const method = entry.method.toUpperCase();

              return (
                <div
                  key={item.id}
                  className={cn(
                    "flex items-center gap-2 px-2 py-1 rounded-[3px] transition-colors group relative hover:bg-zinc-900/60",
                    isErr && "bg-red-500/10 text-red-200 border-l-2 border-red-500",
                    !isErr && "text-zinc-300",
                  )}
                >
                  {/* Timestamp */}
                  <span className="text-zinc-500 shrink-0 tabular-nums">
                    {formatTime(entry.timestamp)}
                  </span>

                  {/* Method Badge */}
                  <span
                    className={cn(
                      "px-1.5 py-0.2 rounded text-4xs font-bold uppercase shrink-0",
                      method === "GET" &&
                        "bg-emerald-500/15 text-emerald-400 border border-emerald-500/30",
                      method === "POST" && "bg-sky-500/15 text-sky-400 border border-sky-500/30",
                      (method === "PUT" || method === "PATCH") &&
                        "bg-purple-500/15 text-purple-400 border border-purple-500/30",
                      method === "DELETE" && "bg-red-500/15 text-red-400 border border-red-500/30",
                      !["GET", "POST", "PUT", "PATCH", "DELETE"].includes(method) &&
                        "bg-zinc-800 text-zinc-400",
                    )}
                  >
                    {method}
                  </span>

                  {/* Status Badge */}
                  <span
                    className={cn(
                      "px-1 py-0.2 rounded text-4xs font-mono font-bold shrink-0",
                      entry.failed || (entry.status && entry.status >= 400)
                        ? "bg-red-500/25 text-red-300 border border-red-500/40"
                        : entry.status && entry.status >= 200 && entry.status < 300
                          ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/30"
                          : "bg-zinc-800 text-zinc-400",
                    )}
                  >
                    {entry.failed ? "FAILED" : entry.status !== null ? entry.status : "200 OK"}
                  </span>

                  {/* URL */}
                  <span className="flex-1 truncate font-mono text-zinc-300" title={entry.url}>
                    {entry.url}
                  </span>

                  {/* Error detail if failed */}
                  {entry.errorText && (
                    <span className="text-4xs text-red-400 italic truncate max-w-48 shrink-0">
                      ({entry.errorText})
                    </span>
                  )}

                  {/* Quick Copy Button on Hover */}
                  <button
                    type="button"
                    onClick={() => handleCopySingle(item)}
                    title="Copy URL"
                    className="opacity-0 group-hover:opacity-100 p-0.5 rounded hover:bg-zinc-800 text-zinc-400 hover:text-zinc-200 transition-opacity cursor-pointer shrink-0 ml-1"
                  >
                    {isCopied ? (
                      <Check className="size-2.5 text-emerald-400" />
                    ) : (
                      <Copy className="size-2.5" />
                    )}
                  </button>
                </div>
              );
            }

            return null;
          })
        )}
      </div>
    </div>
  );
});
