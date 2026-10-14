import React, { useState, useMemo, useEffect } from "react";
import {
  XIcon,
  Trash2Icon,
  SearchIcon,
  CopyIcon,
  CheckIcon,
  TerminalIcon,
  GlobeIcon,
  BotIcon,
  RefreshCwIcon,
  AlertTriangleIcon,
  CheckCircle2Icon,
  CpuIcon,
  ClockIcon,
  ShieldCheckIcon,
  ExternalLinkIcon,
} from "lucide-react";
import {
  networkLogger,
  formatCurlCommand,
  formatAiCurlCommand,
  type RequestLogEntry,
  type AiModelLogEntry,
} from "../../lib/networkLogger";
import { useNetworkLogs, useAiModelLogs } from "./useNetworkLogs";
import { Button } from "../ui/button";

interface RequestLogsSheetProps {
  isOpen: boolean;
  onClose: () => void;
}

export function RequestLogsSheet({ isOpen, onClose }: RequestLogsSheetProps) {
  const [mainTab, setMainTab] = useState<"ai" | "network">("ai");

  // AI Logs State
  const aiLogs = useAiModelLogs();
  const [aiFilter, setAiFilter] = useState<"all" | "ok" | "error" | "streaming">("all");
  const [aiSearchQuery, setAiSearchQuery] = useState("");
  const [selectedAiLogId, setSelectedAiLogId] = useState<string | null>(null);
  const [aiActiveTab, setAiActiveTab] = useState<
    "overview" | "prompt" | "response" | "error" | "curl"
  >("overview");
  const [isRefreshingAi, setIsRefreshingAi] = useState(false);

  // Network Logs State
  const logs = useNetworkLogs();
  const [filterType, setFilterType] = useState<"all" | "http" | "ws" | "error">("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedLogId, setSelectedLogId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<
    "overview" | "headers" | "payload" | "response" | "curl"
  >("overview");

  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  // Auto-fetch AI Model Logs periodically while sheet is open
  useEffect(() => {
    if (!isOpen) return;
    networkLogger.fetchAiModelLogs();
    const interval = setInterval(() => {
      networkLogger.fetchAiModelLogs();
    }, 2500);
    return () => clearInterval(interval);
  }, [isOpen]);

  const handleRefreshAi = async () => {
    setIsRefreshingAi(true);
    await networkLogger.fetchAiModelLogs();
    setTimeout(() => setIsRefreshingAi(false), 500);
  };

  const copyToClipboard = (text: string, key: string) => {
    navigator.clipboard.writeText(text);
    setCopiedKey(key);
    setTimeout(() => {
      setCopiedKey(null);
    }, 1800);
  };

  // Filtered AI Logs
  const filteredAiLogs = useMemo(() => {
    return aiLogs.filter((log) => {
      if (aiFilter === "ok" && (log.state === "error" || (log.status && log.status >= 400))) {
        return false;
      }
      if (aiFilter === "error" && log.state !== "error" && (!log.status || log.status < 400)) {
        return false;
      }
      if (aiFilter === "streaming" && log.state !== "streaming") {
        return false;
      }

      if (aiSearchQuery.trim()) {
        const query = aiSearchQuery.toLowerCase();
        const matchesModel = log.model.toLowerCase().includes(query);
        const matchesProvider = log.provider.toLowerCase().includes(query);
        const matchesEndpoint = log.endpoint.toLowerCase().includes(query);
        const matchesPrompt = log.userPrompt.toLowerCase().includes(query);
        const matchesError = log.error ? log.error.toLowerCase().includes(query) : false;
        const matchesStatus = log.status ? String(log.status).includes(query) : false;
        return (
          matchesModel ||
          matchesProvider ||
          matchesEndpoint ||
          matchesPrompt ||
          matchesError ||
          matchesStatus
        );
      }
      return true;
    });
  }, [aiLogs, aiFilter, aiSearchQuery]);

  const selectedAiLog = useMemo(() => {
    if (!selectedAiLogId) return null;
    return aiLogs.find((l) => l.id === selectedAiLogId) ?? null;
  }, [aiLogs, selectedAiLogId]);

  // Filtered Network Logs
  const filteredNetworkLogs = useMemo(() => {
    return logs.filter((log) => {
      if (filterType === "http" && log.type === "ws") return false;
      if (filterType === "ws" && log.type !== "ws") return false;
      if (filterType === "error" && log.state !== "error" && (!log.status || log.status < 400))
        return false;

      if (searchQuery.trim()) {
        const query = searchQuery.toLowerCase();
        const matchesUrl = log.url.toLowerCase().includes(query);
        const matchesMethod = log.method.toLowerCase().includes(query);
        const matchesStatus = log.status ? String(log.status).includes(query) : false;
        const matchesBody =
          (log.requestBody && log.requestBody.toLowerCase().includes(query)) ||
          (log.responseBody && log.responseBody.toLowerCase().includes(query));
        return matchesUrl || matchesMethod || matchesStatus || matchesBody;
      }
      return true;
    });
  }, [logs, filterType, searchQuery]);

  const selectedLog = useMemo(() => {
    if (!selectedLogId) return null;
    return logs.find((l) => l.id === selectedLogId) ?? null;
  }, [logs, selectedLogId]);

  if (!isOpen) return null;

  const getMethodBadgeClass = (method: string) => {
    if (method.includes("GET")) return "bg-blue-500/15 text-blue-400 border-blue-500/30";
    if (method.includes("POST")) return "bg-emerald-500/15 text-emerald-400 border-emerald-500/30";
    if (method.includes("PUT") || method.includes("PATCH"))
      return "bg-amber-500/15 text-amber-400 border-amber-500/30";
    if (method.includes("DELETE")) return "bg-rose-500/15 text-rose-400 border-rose-500/30";
    if (method.includes("WS ↗")) return "bg-purple-500/15 text-purple-400 border-purple-500/30";
    if (
      method.includes("WS ↘ ERROR") ||
      method.includes("ERROR") ||
      method.includes("REJECTION") ||
      method.includes("CLOSE")
    )
      return "bg-rose-500/20 text-rose-300 border-rose-500/40";
    if (method.includes("WS ↘")) return "bg-cyan-500/15 text-cyan-400 border-cyan-500/30";
    return "bg-zinc-700/30 text-zinc-300 border-zinc-600/30";
  };

  const getStatusBadgeClass = (status?: number, state?: string) => {
    if (state === "pending")
      return "bg-amber-500/20 text-amber-300 border-amber-500/40 animate-pulse";
    if (!status && state === "error") return "bg-rose-500/20 text-rose-300 border-rose-500/40";
    if (!status) return "bg-zinc-800 text-zinc-400 border-zinc-700";
    if (status >= 200 && status < 300)
      return "bg-emerald-500/15 text-emerald-300 border-emerald-500/30";
    if (status === 101) return "bg-indigo-500/15 text-indigo-300 border-indigo-500/30";
    if (status >= 400 && status < 500) return "bg-amber-500/20 text-amber-300 border-amber-500/40";
    if (status >= 500) return "bg-rose-500/20 text-rose-300 border-rose-500/40";
    return "bg-zinc-800 text-zinc-300 border-zinc-700";
  };

  const getAiStatusBadge = (log: AiModelLogEntry) => {
    if (log.state === "streaming") {
      return (
        <span className="rounded px-2 py-0.5 text-[10px] font-mono font-semibold bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 animate-pulse flex items-center gap-1">
          <span className="size-1.5 rounded-full bg-cyan-400 animate-ping" />
          STREAMING
        </span>
      );
    }
    if (log.state === "pending") {
      return (
        <span className="rounded px-2 py-0.5 text-[10px] font-mono font-semibold bg-amber-500/20 text-amber-300 border border-amber-500/40 animate-pulse">
          PENDING
        </span>
      );
    }
    if (log.state === "error" || (log.status && log.status >= 400)) {
      return (
        <span className="rounded px-2 py-0.5 text-[10px] font-mono font-semibold bg-rose-500/20 text-rose-300 border border-rose-500/40 flex items-center gap-1">
          <AlertTriangleIcon className="size-3 text-rose-400" />
          {log.status ? `HTTP ${log.status}` : "FAILED"}
        </span>
      );
    }
    return (
      <span className="rounded px-2 py-0.5 text-[10px] font-mono font-semibold bg-emerald-500/15 text-emerald-300 border border-emerald-500/30 flex items-center gap-1">
        <CheckCircle2Icon className="size-3 text-emerald-400" />
        {log.status ? `${log.status} OK` : "OK"}
      </span>
    );
  };

  return (
    <div className="fixed inset-0 z-[120] flex justify-end">
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/60 backdrop-blur-xs transition-opacity"
        onClick={onClose}
      />

      {/* Slide-over panel */}
      <div className="relative z-[121] flex h-full w-full max-w-full sm:max-w-2xl md:max-w-4xl flex-col bg-zinc-950 text-zinc-100 border-l border-zinc-800/80 shadow-2xl animate-in slide-in-from-right duration-200 overflow-hidden">
        {/* Top App Header with Cupertino iOS Segmented Tabs */}
        <div className="flex items-center justify-between border-b border-zinc-800/80 px-2.5 py-2 sm:px-4 sm:py-2.5 bg-zinc-900/90 backdrop-blur-md shrink-0 gap-2 min-w-0">
          <div className="flex items-center gap-2 min-w-0 flex-1">
            {/* Cupertino Segmented Tab Switcher */}
            <div className="inline-flex items-center bg-zinc-950/90 p-0.5 sm:p-1 rounded-full border border-zinc-800/80 shrink-0">
              <button
                type="button"
                onClick={() => setMainTab("ai")}
                className={`flex items-center gap-1.5 px-2.5 py-1 sm:px-3 sm:py-1.5 rounded-full text-2xs sm:text-xs font-semibold transition-all cursor-pointer ${
                  mainTab === "ai"
                    ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 shadow-xs"
                    : "text-zinc-400 hover:text-zinc-200 hover:bg-zinc-900/60"
                }`}
              >
                <BotIcon className="size-3.5 text-emerald-400 shrink-0" />
                <span className="hidden sm:inline">Track AI Models Logs</span>
                <span className="inline sm:hidden">AI Logs</span>
                <span
                  className={`rounded-full px-1.5 py-0.2 text-[10px] font-mono ${
                    mainTab === "ai"
                      ? "bg-emerald-500/30 text-emerald-200 font-bold"
                      : "bg-zinc-800 text-zinc-400"
                  }`}
                >
                  {aiLogs.length}
                </span>
              </button>

              <button
                type="button"
                onClick={() => setMainTab("network")}
                className={`flex items-center gap-1.5 px-2.5 py-1 sm:px-3 sm:py-1.5 rounded-full text-2xs sm:text-xs font-semibold transition-all cursor-pointer ${
                  mainTab === "network"
                    ? "bg-zinc-800 text-zinc-100 border border-zinc-700 shadow-xs"
                    : "text-zinc-400 hover:text-zinc-200 hover:bg-zinc-900/60"
                }`}
              >
                <GlobeIcon className="size-3.5 text-cyan-400 shrink-0" />
                <span className="hidden sm:inline">Network Traffic</span>
                <span className="inline sm:hidden">Network</span>
                <span className="rounded-full bg-zinc-800 px-1.5 py-0.2 text-[10px] font-mono text-zinc-400">
                  {logs.length}
                </span>
              </button>
            </div>
          </div>

          <div className="flex items-center gap-1 sm:gap-1.5 shrink-0">
            {mainTab === "ai" ? (
              <>
                <Button
                  size="xs"
                  variant="outline"
                  onClick={handleRefreshAi}
                  title="Refresh AI logs from server"
                  className="h-7 text-xs gap-1 border-zinc-800/80 rounded-full hover:bg-zinc-900 hover:text-emerald-400 text-zinc-400 px-2 sm:px-2.5"
                >
                  <RefreshCwIcon
                    className={`size-3.5 ${isRefreshingAi ? "animate-spin text-emerald-400" : ""}`}
                  />
                  <span className="hidden sm:inline">Refresh</span>
                </Button>
                <Button
                  size="xs"
                  variant="outline"
                  onClick={() => networkLogger.clearAiModelLogs()}
                  title="Clear all recorded AI logs"
                  className="h-7 text-xs gap-1 border-zinc-800/80 rounded-full hover:bg-zinc-900 hover:text-rose-400 text-zinc-400 px-2 sm:px-2.5"
                >
                  <Trash2Icon className="size-3.5" />
                  <span className="hidden sm:inline">Clear AI Logs</span>
                </Button>
              </>
            ) : (
              <Button
                size="xs"
                variant="outline"
                onClick={() => networkLogger.clear()}
                title="Clear all network logs"
                className="h-7 text-xs gap-1 border-zinc-800/80 rounded-full hover:bg-zinc-900 hover:text-rose-400 text-zinc-400 px-2 sm:px-2.5"
              >
                <Trash2Icon className="size-3.5" />
                <span className="hidden sm:inline">Clear</span>
              </Button>
            )}

            {/* Prominent Top Close Button */}
            <button
              type="button"
              onClick={onClose}
              title="Close Logs Sheet"
              className="flex items-center justify-center size-7 sm:size-8 rounded-full bg-zinc-800/90 hover:bg-zinc-700 text-zinc-300 hover:text-white border border-zinc-700/60 transition-all cursor-pointer shrink-0 shadow-xs active:scale-95 ml-1"
            >
              <XIcon className="size-4" />
            </button>
          </div>
        </div>

        {/* ========================================================================= */}
        {/* VIEW 1: TRACK AI MODELS LOGS (A to Z Details) */}
        {/* ========================================================================= */}
        {mainTab === "ai" && (
          <div className="flex flex-col flex-1 min-h-0">
            {/* Filter & Search Toolbar */}
            <div className="flex flex-col gap-2 border-b border-zinc-800/80 bg-zinc-900/30 p-3">
              <div className="flex items-center gap-2">
                <div className="relative flex-1">
                  <SearchIcon className="absolute left-2.5 top-1/2 -translate-y-1/2 size-3.5 text-zinc-500" />
                  <input
                    type="text"
                    placeholder="Search AI Model, Provider, Error, User Prompt, Endpoint..."
                    value={aiSearchQuery}
                    onChange={(e) => setAiSearchQuery(e.target.value)}
                    className="w-full rounded-md border border-zinc-800 bg-zinc-900/80 pl-8 pr-8 py-1.5 text-xs text-zinc-200 placeholder-zinc-500 focus:border-emerald-500 focus:outline-none"
                  />
                  {aiSearchQuery && (
                    <button
                      type="button"
                      onClick={() => setAiSearchQuery("")}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-zinc-300"
                    >
                      <XIcon className="size-3" />
                    </button>
                  )}
                </div>
              </div>

              <div className="flex items-center justify-between text-xs">
                <div className="flex items-center gap-1.5 overflow-x-auto">
                  {(
                    [
                      { id: "all", label: "All Runs" },
                      { id: "ok", label: "Success (200 OK)" },
                      { id: "error", label: "Errors & Failures" },
                      { id: "streaming", label: "Streaming" },
                    ] as const
                  ).map((tab) => (
                    <button
                      key={tab.id}
                      type="button"
                      onClick={() => setAiFilter(tab.id)}
                      className={`rounded-full px-2.5 py-0.5 font-medium transition-colors cursor-pointer capitalize ${
                        aiFilter === tab.id
                          ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 font-semibold"
                          : "bg-zinc-800/80 text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200"
                      }`}
                    >
                      {tab.label}
                    </button>
                  ))}
                </div>

                <div className="text-[11px] font-mono text-zinc-500">
                  Showing {filteredAiLogs.length} of {aiLogs.length} AI runs
                </div>
              </div>
            </div>

            {/* Split Content: List + Inspector */}
            <div className="flex flex-1 min-h-0 divide-x divide-zinc-800/80">
              {/* Left Panel: AI Runs List */}
              <div
                className={`flex flex-col overflow-y-auto ${
                  selectedAiLog ? "w-2/5 hidden md:flex" : "w-full"
                }`}
              >
                {filteredAiLogs.length === 0 ? (
                  <div className="flex flex-col items-center justify-center p-12 text-center text-zinc-500">
                    <BotIcon className="size-10 stroke-1 text-zinc-600 mb-2" />
                    <p className="text-xs font-semibold text-zinc-400">
                      No AI model activity recorded yet
                    </p>
                    <p className="text-[11px] text-zinc-600 mt-1 max-w-xs">
                      Send a prompt or direct an agent. The outgoing request, headers, model info,
                      and incoming response will appear here in real-time.
                    </p>
                  </div>
                ) : (
                  <div className="divide-y divide-zinc-900">
                    {filteredAiLogs.map((log) => {
                      const isSelected = selectedAiLogId === log.id;
                      return (
                        <div
                          key={log.id}
                          onClick={() => setSelectedAiLogId(log.id)}
                          className={`flex flex-col gap-1.5 p-3 transition-colors cursor-pointer hover:bg-zinc-900/60 ${
                            isSelected
                              ? "bg-zinc-900 border-l-2 border-emerald-500"
                              : log.state === "error"
                                ? "bg-rose-950/10 hover:bg-rose-950/20"
                                : ""
                          }`}
                        >
                          <div className="flex items-center justify-between gap-2">
                            <div className="flex items-center gap-1.5 min-w-0 flex-wrap">
                              {/* Model Badge */}
                              <span className="rounded px-2 py-0.5 text-[11px] font-mono font-bold bg-indigo-500/15 text-indigo-300 border border-indigo-500/30 truncate max-w-[200px]">
                                {log.model}
                              </span>

                              {/* Status Badge */}
                              {getAiStatusBadge(log)}
                            </div>

                            <span className="text-[11px] font-mono text-zinc-400 shrink-0">
                              {log.durationMs !== undefined && log.durationMs > 0
                                ? `${log.durationMs}ms`
                                : ""}
                            </span>
                          </div>

                          <div className="flex items-center justify-between gap-2 text-[11px]">
                            <span className="text-zinc-400 font-sans truncate">
                              <span className="text-zinc-500">Provider:</span>{" "}
                              <span className="text-zinc-200 font-medium">{log.provider}</span>
                            </span>
                            <span className="font-mono text-zinc-500 shrink-0">
                              {log.timeFormatted.split(".")[0]}
                            </span>
                          </div>

                          {/* User Prompt Snippet */}
                          <div className="text-[11px] text-zinc-400 line-clamp-2 bg-zinc-950/50 p-1.5 rounded border border-zinc-900 font-sans">
                            <span className="text-zinc-500 font-mono text-[10px]">User: </span>
                            {log.userPrompt}
                          </div>

                          {/* Error Callout Snippet if failed */}
                          {log.error && (
                            <div className="text-[10px] text-rose-300 bg-rose-500/10 border border-rose-500/30 p-1 rounded font-mono truncate">
                              ⚠️ {log.error}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Right Panel: Selected AI Log Deep Details */}
              {selectedAiLog ? (
                <div className="flex flex-1 flex-col overflow-hidden bg-zinc-950">
                  {/* Inspector Header */}
                  <div className="flex items-center justify-between border-b border-zinc-800 px-4 py-2.5 bg-zinc-900/50">
                    <div className="flex items-center gap-2 min-w-0">
                      <button
                        type="button"
                        onClick={() => setSelectedAiLogId(null)}
                        className="md:hidden flex items-center gap-1 px-2.5 py-1 rounded-full bg-zinc-800/90 text-zinc-300 hover:text-white border border-zinc-700/60 text-xs font-semibold mr-1 cursor-pointer shrink-0 active:scale-95"
                      >
                        ← Back
                      </button>
                      <div className="flex flex-col">
                        <span className="text-xs font-mono font-bold text-indigo-300 flex items-center gap-1.5">
                          <CpuIcon className="size-3.5 text-indigo-400" />
                          {selectedAiLog.model}
                        </span>
                        <span className="text-[10px] text-zinc-400">
                          {selectedAiLog.provider} ({selectedAiLog.providerInstanceId})
                        </span>
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      {getAiStatusBadge(selectedAiLog)}

                      <Button
                        size="xs"
                        variant="ghost"
                        onClick={() =>
                          copyToClipboard(formatAiCurlCommand(selectedAiLog), "aiCurlTop")
                        }
                        className="h-6 text-[11px] gap-1 text-zinc-400 hover:text-emerald-300 border border-zinc-800"
                        title="Copy curl command to test this model in terminal"
                      >
                        {copiedKey === "aiCurlTop" ? (
                          <CheckIcon className="size-3 text-emerald-400" />
                        ) : (
                          <TerminalIcon className="size-3" />
                        )}
                        cURL
                      </Button>
                    </div>
                  </div>

                  {/* Inspector Sub-Tabs */}
                  <div className="flex items-center border-b border-zinc-800 bg-zinc-900/20 px-3 text-xs overflow-x-auto">
                    {(
                      [
                        { id: "overview", label: "Model & Request" },
                        { id: "prompt", label: "Prompt & Messages" },
                        { id: "response", label: "Response & Output" },
                        {
                          id: "error",
                          label: selectedAiLog.error ? "⚠️ Error Issue" : "Status & Health",
                        },
                        { id: "curl", label: "cURL Command" },
                      ] as const
                    ).map((tab) => (
                      <button
                        key={tab.id}
                        type="button"
                        onClick={() => setAiActiveTab(tab.id)}
                        className={`border-b-2 px-3 py-2 font-medium transition-colors cursor-pointer shrink-0 ${
                          aiActiveTab === tab.id
                            ? "border-emerald-500 text-zinc-100 font-semibold"
                            : "border-transparent text-zinc-400 hover:text-zinc-200"
                        } ${tab.id === "error" && selectedAiLog.error ? "text-rose-400 font-bold" : ""}`}
                      >
                        {tab.label}
                      </button>
                    ))}
                  </div>

                  {/* Tab Body */}
                  <div className="flex-1 overflow-y-auto p-4 text-xs font-mono space-y-4">
                    {/* 1. OVERVIEW & REQUEST */}
                    {aiActiveTab === "overview" && (
                      <div className="space-y-4 font-sans">
                        {/* Main Info Card */}
                        <div className="rounded-lg border border-zinc-800/80 bg-zinc-900/40 p-3.5 space-y-3">
                          <h4 className="text-xs font-bold uppercase tracking-wider text-emerald-400 flex items-center gap-1.5">
                            <BotIcon className="size-4" />
                            AI Model & Provider Execution
                          </h4>

                          <div className="grid grid-cols-2 gap-3 text-[11px] font-mono">
                            <div>
                              <span className="text-zinc-500 block font-sans">Selected Model</span>
                              <span className="text-zinc-100 font-bold">{selectedAiLog.model}</span>
                            </div>
                            <div>
                              <span className="text-zinc-500 block font-sans">Provider Name</span>
                              <span className="text-zinc-100 font-bold">
                                {selectedAiLog.provider}
                              </span>
                            </div>
                            <div>
                              <span className="text-zinc-500 block font-sans">Provider ID</span>
                              <span className="text-zinc-300">
                                {selectedAiLog.providerInstanceId}
                              </span>
                            </div>
                            <div>
                              <span className="text-zinc-500 block font-sans">
                                Response Latency
                              </span>
                              <span className="text-emerald-300 font-bold">
                                {selectedAiLog.durationMs !== undefined
                                  ? `${selectedAiLog.durationMs} ms`
                                  : "In progress"}
                              </span>
                            </div>
                            <div>
                              <span className="text-zinc-500 block font-sans">Timestamp</span>
                              <span className="text-zinc-300">{selectedAiLog.timeFormatted}</span>
                            </div>
                            <div>
                              <span className="text-zinc-500 block font-sans">Status Code</span>
                              <span className="text-zinc-100">
                                {selectedAiLog.status
                                  ? `${selectedAiLog.status} ${selectedAiLog.statusText || ""}`
                                  : selectedAiLog.state}
                              </span>
                            </div>
                          </div>
                        </div>

                        {/* Endpoint & URL Card */}
                        <div className="rounded-lg border border-zinc-800/80 bg-zinc-900/40 p-3.5 space-y-2">
                          <span className="text-[11px] uppercase tracking-wider text-zinc-500 font-semibold block">
                            Target Endpoint & Base URL
                          </span>
                          <div className="flex items-center justify-between gap-2 break-all text-zinc-200 bg-zinc-950 p-2 rounded border border-zinc-800/60 font-mono text-[11px]">
                            <span>{selectedAiLog.endpoint}</span>
                            <button
                              type="button"
                              onClick={() => copyToClipboard(selectedAiLog.endpoint, "endpoint")}
                              className="shrink-0 text-zinc-400 hover:text-zinc-200 p-1"
                            >
                              {copiedKey === "endpoint" ? (
                                <CheckIcon className="size-3.5 text-emerald-400" />
                              ) : (
                                <CopyIcon className="size-3.5" />
                              )}
                            </button>
                          </div>

                          <div className="pt-1 flex items-center justify-between text-[11px] text-zinc-400">
                            <span>Base URL:</span>
                            <span className="font-mono text-zinc-300">{selectedAiLog.baseUrl}</span>
                          </div>

                          <div className="flex items-center justify-between text-[11px] text-zinc-400">
                            <span>API Key (Active):</span>
                            <span className="font-mono text-zinc-300 bg-zinc-950 px-2 py-0.5 rounded border border-zinc-800">
                              {selectedAiLog.apiKeyMasked}
                            </span>
                          </div>
                        </div>

                        {/* Request Headers Table */}
                        <div className="rounded-lg border border-zinc-800/80 bg-zinc-900/40 p-3.5 space-y-2">
                          <div className="flex items-center justify-between">
                            <span className="text-[11px] uppercase tracking-wider text-zinc-500 font-semibold">
                              Outgoing Request Headers
                            </span>
                            <button
                              type="button"
                              onClick={() =>
                                copyToClipboard(
                                  JSON.stringify(selectedAiLog.requestHeaders, null, 2),
                                  "headers",
                                )
                              }
                              className="text-zinc-400 hover:text-zinc-200 flex items-center gap-1 text-[11px]"
                            >
                              {copiedKey === "headers" ? (
                                <CheckIcon className="size-3 text-emerald-400" />
                              ) : (
                                <CopyIcon className="size-3" />
                              )}
                              Copy Headers
                            </button>
                          </div>

                          <div className="rounded-md border border-zinc-800 bg-zinc-950 divide-y divide-zinc-900 overflow-hidden font-mono text-[11px]">
                            {Object.entries(selectedAiLog.requestHeaders).map(([key, val]) => (
                              <div key={key} className="flex p-2 items-center">
                                <span className="w-1/3 text-zinc-400 font-semibold break-all">
                                  {key}
                                </span>
                                <span className="w-2/3 text-zinc-200 break-all">{val}</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      </div>
                    )}

                    {/* 2. PROMPT & MESSAGES */}
                    {aiActiveTab === "prompt" && (
                      <div className="space-y-4 font-sans">
                        {/* Direct User Prompt */}
                        <div className="rounded-lg border border-zinc-800/80 bg-zinc-900/40 p-3.5 space-y-2">
                          <div className="flex items-center justify-between">
                            <span className="text-xs font-bold uppercase tracking-wider text-zinc-300">
                              User Prompt
                            </span>
                            <button
                              type="button"
                              onClick={() =>
                                copyToClipboard(selectedAiLog.userPrompt, "userPrompt")
                              }
                              className="text-zinc-400 hover:text-zinc-200 flex items-center gap-1 text-[11px]"
                            >
                              {copiedKey === "userPrompt" ? (
                                <CheckIcon className="size-3 text-emerald-400" />
                              ) : (
                                <CopyIcon className="size-3" />
                              )}
                              Copy Prompt
                            </button>
                          </div>
                          <div className="rounded-md border border-zinc-800 bg-zinc-950 p-3 text-zinc-100 whitespace-pre-wrap leading-relaxed">
                            {selectedAiLog.userPrompt}
                          </div>
                        </div>

                        {/* Full Conversation Payload */}
                        <div className="rounded-lg border border-zinc-800/80 bg-zinc-900/40 p-3.5 space-y-2">
                          <div className="flex items-center justify-between">
                            <span className="text-xs font-bold uppercase tracking-wider text-zinc-300">
                              Full Messages Payload ({selectedAiLog.messages.length} messages)
                            </span>
                            <button
                              type="button"
                              onClick={() =>
                                copyToClipboard(
                                  JSON.stringify(selectedAiLog.messages, null, 2),
                                  "messagesPayload",
                                )
                              }
                              className="text-zinc-400 hover:text-zinc-200 flex items-center gap-1 text-[11px]"
                            >
                              {copiedKey === "messagesPayload" ? (
                                <CheckIcon className="size-3 text-emerald-400" />
                              ) : (
                                <CopyIcon className="size-3" />
                              )}
                              Copy JSON
                            </button>
                          </div>
                          <pre className="rounded-md border border-zinc-800 bg-zinc-950 p-3 font-mono text-[11px] text-zinc-300 whitespace-pre-wrap max-h-96 overflow-y-auto">
                            {JSON.stringify(selectedAiLog.messages, null, 2)}
                          </pre>
                        </div>
                      </div>
                    )}

                    {/* 3. RESPONSE & OUTPUT */}
                    {aiActiveTab === "response" && (
                      <div className="space-y-3 font-sans">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-bold uppercase tracking-wider text-zinc-300">
                              Model Output & Streamed Response
                            </span>
                            {selectedAiLog.state === "streaming" && (
                              <span className="text-[10px] text-cyan-400 font-mono animate-pulse">
                                ● receiving chunks...
                              </span>
                            )}
                          </div>
                          {selectedAiLog.responseBody && (
                            <button
                              type="button"
                              onClick={() =>
                                copyToClipboard(selectedAiLog.responseBody || "", "responseBody")
                              }
                              className="text-zinc-400 hover:text-zinc-200 flex items-center gap-1 text-[11px]"
                            >
                              {copiedKey === "responseBody" ? (
                                <CheckIcon className="size-3 text-emerald-400" />
                              ) : (
                                <CopyIcon className="size-3" />
                              )}
                              Copy Output
                            </button>
                          )}
                        </div>

                        {selectedAiLog.responseBody ? (
                          <div className="rounded-lg border border-zinc-800 bg-zinc-950 p-4 font-mono text-[11px] text-zinc-200 whitespace-pre-wrap leading-relaxed max-h-[500px] overflow-y-auto">
                            {selectedAiLog.responseBody}
                          </div>
                        ) : (
                          <div className="rounded-lg border border-zinc-800 bg-zinc-900/30 p-8 text-center text-zinc-500 text-xs">
                            No response body returned yet.
                          </div>
                        )}
                      </div>
                    )}

                    {/* 4. ERROR & ISSUE DIAGNOSIS */}
                    {aiActiveTab === "error" && (
                      <div className="space-y-4 font-sans">
                        {selectedAiLog.error ? (
                          <div className="rounded-lg border border-rose-500/40 bg-rose-500/10 p-4 space-y-3">
                            <div className="flex items-center gap-2 text-rose-300 font-bold text-sm">
                              <AlertTriangleIcon className="size-5 text-rose-400" />
                              Actual Issue on Model: {selectedAiLog.model}
                            </div>

                            <div className="space-y-1">
                              <span className="text-[11px] uppercase tracking-wider text-rose-400/80 font-semibold">
                                Error Type / Code:
                              </span>
                              <div className="font-mono text-xs text-rose-200 bg-rose-950/60 p-2 rounded border border-rose-800/40">
                                {selectedAiLog.errorType || "Error"} (HTTP {selectedAiLog.status})
                              </div>
                            </div>

                            <div className="space-y-1">
                              <span className="text-[11px] uppercase tracking-wider text-rose-400/80 font-semibold">
                                Provider Error Message:
                              </span>
                              <div className="font-mono text-xs text-rose-100 bg-zinc-950 p-3 rounded border border-rose-900/60 whitespace-pre-wrap">
                                {selectedAiLog.error}
                              </div>
                            </div>

                            {/* Actionable Solution Guide */}
                            <div className="pt-2 border-t border-rose-500/20 text-xs text-rose-200/90 space-y-1">
                              <span className="font-bold text-rose-300">
                                Recommended Resolution:
                              </span>
                              {selectedAiLog.status === 401 ? (
                                <p>
                                  OpenRouter rejected your API key (`User not found`). Go to{" "}
                                  <a
                                    href="https://openrouter.ai/settings/keys"
                                    target="_blank"
                                    rel="noreferrer"
                                    className="underline text-rose-300 hover:text-white"
                                  >
                                    openrouter.ai/settings/keys
                                  </a>
                                  , generate a fresh key, and update it in T3 Code Provider
                                  Settings.
                                </p>
                              ) : selectedAiLog.status === 429 ? (
                                <p>
                                  Rate limit exceeded or out of credits. Switch to another model or
                                  add credits to OpenRouter.
                                </p>
                              ) : (
                                <p>
                                  Verify your endpoint URL, model slug, and ensure the selected
                                  model is available in your provider account.
                                </p>
                              )}
                            </div>
                          </div>
                        ) : (
                          <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-6 text-center space-y-2">
                            <CheckCircle2Icon className="size-8 text-emerald-400 mx-auto" />
                            <h4 className="text-sm font-bold text-emerald-300">
                              No Errors Detected
                            </h4>
                            <p className="text-xs text-emerald-200/70 max-w-sm mx-auto">
                              This model execution completed successfully with HTTP 200 OK.
                            </p>
                          </div>
                        )}
                      </div>
                    )}

                    {/* 5. CURL COMMAND */}
                    {aiActiveTab === "curl" && (
                      <div className="space-y-3 font-sans">
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-bold uppercase tracking-wider text-zinc-300">
                            Direct cURL Command (Reproduce in Terminal)
                          </span>
                          <button
                            type="button"
                            onClick={() =>
                              copyToClipboard(formatAiCurlCommand(selectedAiLog), "aiCurlFull")
                            }
                            className="text-zinc-400 hover:text-zinc-200 flex items-center gap-1 text-[11px]"
                          >
                            {copiedKey === "aiCurlFull" ? (
                              <CheckIcon className="size-3 text-emerald-400" />
                            ) : (
                              <CopyIcon className="size-3" />
                            )}
                            Copy Command
                          </button>
                        </div>
                        <pre className="rounded-lg border border-zinc-800 bg-zinc-950 p-3.5 font-mono text-[11px] text-zinc-200 whitespace-pre-wrap leading-relaxed overflow-x-auto">
                          {formatAiCurlCommand(selectedAiLog)}
                        </pre>
                      </div>
                    )}
                  </div>
                </div>
              ) : (
                <div className="hidden md:flex flex-1 items-center justify-center p-8 text-center text-zinc-600 text-xs">
                  Select any AI model run from the left list to inspect outgoing headers, prompt,
                  latency, streaming output, and exact error diagnosis.
                </div>
              )}
            </div>
          </div>
        )}

        {/* ========================================================================= */}
        {/* VIEW 2: ALL NETWORK / WEBSOCKET / HTTP LOGS */}
        {/* ========================================================================= */}
        {mainTab === "network" && (
          <div className="flex flex-col flex-1 min-h-0">
            {/* Filter Toolbar */}
            <div className="flex flex-col gap-2 border-b border-zinc-800/80 bg-zinc-900/30 p-3">
              <div className="flex items-center gap-2">
                <div className="relative flex-1">
                  <SearchIcon className="absolute left-2.5 top-1/2 -translate-y-1/2 size-3.5 text-zinc-500" />
                  <input
                    type="text"
                    placeholder="Filter by URL, method, status, payload..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-full rounded-md border border-zinc-800 bg-zinc-900/80 pl-8 pr-3 py-1.5 text-xs text-zinc-200 placeholder-zinc-500 focus:border-zinc-600 focus:outline-none"
                  />
                  {searchQuery && (
                    <button
                      type="button"
                      onClick={() => setSearchQuery("")}
                      className="absolute right-2 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-zinc-300"
                    >
                      <XIcon className="size-3" />
                    </button>
                  )}
                </div>
              </div>

              <div className="flex items-center gap-1.5 overflow-x-auto text-xs">
                {(["all", "http", "ws", "error"] as const).map((type) => (
                  <button
                    key={type}
                    type="button"
                    onClick={() => setFilterType(type)}
                    className={`rounded-full px-2.5 py-0.5 font-medium transition-colors cursor-pointer capitalize ${
                      filterType === type
                        ? "bg-zinc-100 text-zinc-950 font-semibold"
                        : "bg-zinc-800/80 text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200"
                    }`}
                  >
                    {type === "all"
                      ? "All Requests"
                      : type === "http"
                        ? "HTTP / Fetch"
                        : type === "ws"
                          ? "WebSocket"
                          : "Errors"}
                  </button>
                ))}
              </div>
            </div>

            {/* Split Content */}
            <div className="flex flex-1 min-h-0 divide-x divide-zinc-800/80">
              {/* List panel */}
              <div
                className={`flex flex-col overflow-y-auto ${
                  selectedLog ? "w-1/2 hidden md:flex" : "w-full"
                }`}
              >
                {filteredNetworkLogs.length === 0 ? (
                  <div className="flex flex-col items-center justify-center p-12 text-center text-zinc-500">
                    <GlobeIcon className="size-8 stroke-1 text-zinc-600 mb-2" />
                    <p className="text-xs font-medium">No requests recorded</p>
                    <p className="text-[11px] text-zinc-600 mt-1">
                      Actions and network activity will appear here in real-time.
                    </p>
                  </div>
                ) : (
                  <div className="divide-y divide-zinc-900">
                    {filteredNetworkLogs.map((log) => {
                      const isSelected = selectedLogId === log.id;
                      return (
                        <div
                          key={log.id}
                          onClick={() => setSelectedLogId(log.id)}
                          className={`flex flex-col gap-1 p-2.5 transition-colors cursor-pointer hover:bg-zinc-900/60 ${
                            isSelected ? "bg-zinc-900 border-l-2 border-emerald-500" : ""
                          }`}
                        >
                          <div className="flex items-center justify-between gap-2">
                            <div className="flex items-center gap-1.5 min-w-0">
                              <span
                                className={`rounded px-1.5 py-0.5 text-[10px] font-mono font-semibold border ${getMethodBadgeClass(
                                  log.method,
                                )}`}
                              >
                                {log.method}
                              </span>

                              <span
                                className={`rounded px-1.5 py-0.5 text-[10px] font-mono border ${getStatusBadgeClass(
                                  log.status,
                                  log.state,
                                )}`}
                              >
                                {log.state === "pending"
                                  ? "PENDING"
                                  : log.status
                                    ? `${log.status} ${log.statusText || ""}`.trim()
                                    : log.error
                                      ? "ERROR"
                                      : "OK"}
                              </span>
                            </div>

                            <span className="text-[10px] font-mono text-zinc-500 shrink-0">
                              {log.durationMs !== undefined && log.durationMs > 0
                                ? `${log.durationMs}ms`
                                : ""}
                            </span>
                          </div>

                          <div className="flex items-center justify-between gap-2 mt-0.5">
                            <span
                              className="text-xs font-mono text-zinc-300 truncate"
                              title={log.url}
                            >
                              {log.url}
                            </span>
                            <span className="text-[10px] font-mono text-zinc-500 shrink-0">
                              {log.timeFormatted.split(".")[0]}
                            </span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Details panel */}
              {selectedLog ? (
                <div className="flex flex-1 flex-col overflow-hidden bg-zinc-950">
                  <div className="flex items-center justify-between border-b border-zinc-800 px-4 py-2 bg-zinc-900/50">
                    <div className="flex items-center gap-2 min-w-0">
                      <button
                        type="button"
                        onClick={() => setSelectedLogId(null)}
                        className="md:hidden flex items-center gap-1 px-2.5 py-1 rounded-full bg-zinc-800/90 text-zinc-300 hover:text-white border border-zinc-700/60 text-xs font-semibold mr-1 cursor-pointer shrink-0 active:scale-95"
                      >
                        ← Back
                      </button>
                      <span
                        className={`rounded px-2 py-0.5 text-xs font-mono font-semibold border ${getMethodBadgeClass(
                          selectedLog.method,
                        )}`}
                      >
                        {selectedLog.method}
                      </span>
                      <span
                        className={`rounded px-2 py-0.5 text-xs font-mono border ${getStatusBadgeClass(
                          selectedLog.status,
                          selectedLog.state,
                        )}`}
                      >
                        {selectedLog.status ?? selectedLog.state}
                      </span>
                    </div>

                    <div className="flex items-center gap-1">
                      <Button
                        size="xs"
                        variant="ghost"
                        onClick={() => copyToClipboard(formatCurlCommand(selectedLog), "curl")}
                        className="h-6 text-[11px] gap-1 text-zinc-400 hover:text-zinc-200"
                        title="Copy as cURL command"
                      >
                        {copiedKey === "curl" ? (
                          <CheckIcon className="size-3 text-emerald-400" />
                        ) : (
                          <TerminalIcon className="size-3" />
                        )}
                        cURL
                      </Button>
                    </div>
                  </div>

                  {/* Tabs */}
                  <div className="flex items-center border-b border-zinc-800 bg-zinc-900/20 px-3 text-xs">
                    {(
                      [
                        { id: "overview", label: "Overview" },
                        { id: "headers", label: "Headers" },
                        { id: "payload", label: "Request Body" },
                        { id: "response", label: "Response Body" },
                        { id: "curl", label: "cURL" },
                      ] as const
                    ).map((tab) => (
                      <button
                        key={tab.id}
                        type="button"
                        onClick={() => setActiveTab(tab.id)}
                        className={`border-b-2 px-3 py-2 font-medium transition-colors cursor-pointer ${
                          activeTab === tab.id
                            ? "border-emerald-500 text-zinc-100"
                            : "border-transparent text-zinc-400 hover:text-zinc-200"
                        }`}
                      >
                        {tab.label}
                      </button>
                    ))}
                  </div>

                  {/* Tab Contents */}
                  <div className="flex-1 overflow-y-auto p-4 text-xs font-mono">
                    {activeTab === "overview" && (
                      <div className="space-y-3">
                        <div className="rounded-lg border border-zinc-800/80 bg-zinc-900/40 p-3 space-y-2">
                          <div className="flex flex-col gap-1">
                            <span className="text-[11px] uppercase tracking-wider text-zinc-500 font-sans font-semibold">
                              Request URL
                            </span>
                            <div className="flex items-center justify-between gap-2 break-all text-zinc-200 bg-zinc-950 p-2 rounded border border-zinc-800/60">
                              <span>{selectedLog.url}</span>
                              <button
                                type="button"
                                onClick={() => copyToClipboard(selectedLog.url, "url")}
                                className="shrink-0 text-zinc-400 hover:text-zinc-200 p-1"
                              >
                                {copiedKey === "url" ? (
                                  <CheckIcon className="size-3 text-emerald-400" />
                                ) : (
                                  <CopyIcon className="size-3" />
                                )}
                              </button>
                            </div>
                          </div>

                          <div className="grid grid-cols-2 gap-2 pt-2 text-[11px]">
                            <div>
                              <span className="text-zinc-500 block font-sans">Timestamp</span>
                              <span className="text-zinc-300">{selectedLog.timeFormatted}</span>
                            </div>
                            <div>
                              <span className="text-zinc-500 block font-sans">Duration</span>
                              <span className="text-zinc-300">
                                {selectedLog.durationMs ?? 0} ms
                              </span>
                            </div>
                            <div>
                              <span className="text-zinc-500 block font-sans">Status</span>
                              <span className="text-zinc-300">
                                {selectedLog.status
                                  ? `${selectedLog.status} ${selectedLog.statusText || ""}`
                                  : selectedLog.state}
                              </span>
                            </div>
                            <div>
                              <span className="text-zinc-500 block font-sans">Protocol / Type</span>
                              <span className="text-zinc-300 uppercase">{selectedLog.type}</span>
                            </div>
                          </div>

                          {selectedLog.error && (
                            <div className="mt-2 rounded border border-rose-500/30 bg-rose-500/10 p-2 text-rose-300">
                              <span className="font-semibold block font-sans">Error:</span>
                              {selectedLog.error}
                            </div>
                          )}
                        </div>
                      </div>
                    )}

                    {activeTab === "headers" && (
                      <div className="space-y-4">
                        <div>
                          <h4 className="text-[11px] font-sans font-semibold uppercase tracking-wider text-zinc-400 mb-2">
                            Request Headers
                          </h4>
                          {selectedLog.requestHeaders &&
                          Object.keys(selectedLog.requestHeaders).length > 0 ? (
                            <div className="rounded-md border border-zinc-800 bg-zinc-900/40 divide-y divide-zinc-800/60">
                              {Object.entries(selectedLog.requestHeaders).map(([k, v]) => (
                                <div key={k} className="flex p-2 text-[11px]">
                                  <span className="w-1/3 text-zinc-400 font-semibold break-all">
                                    {k}
                                  </span>
                                  <span className="w-2/3 text-zinc-200 break-all">{v}</span>
                                </div>
                              ))}
                            </div>
                          ) : (
                            <p className="text-zinc-500 text-[11px]">No request headers captured</p>
                          )}
                        </div>

                        <div>
                          <h4 className="text-[11px] font-sans font-semibold uppercase tracking-wider text-zinc-400 mb-2">
                            Response Headers
                          </h4>
                          {selectedLog.responseHeaders &&
                          Object.keys(selectedLog.responseHeaders).length > 0 ? (
                            <div className="rounded-md border border-zinc-800 bg-zinc-900/40 divide-y divide-zinc-800/60">
                              {Object.entries(selectedLog.responseHeaders).map(([k, v]) => (
                                <div key={k} className="flex p-2 text-[11px]">
                                  <span className="w-1/3 text-zinc-400 font-semibold break-all">
                                    {k}
                                  </span>
                                  <span className="w-2/3 text-zinc-200 break-all">{v}</span>
                                </div>
                              ))}
                            </div>
                          ) : (
                            <p className="text-zinc-500 text-[11px]">
                              No response headers captured
                            </p>
                          )}
                        </div>
                      </div>
                    )}

                    {activeTab === "payload" && (
                      <div>
                        <div className="flex items-center justify-between mb-2">
                          <h4 className="text-[11px] font-sans font-semibold uppercase tracking-wider text-zinc-400">
                            Request Payload
                          </h4>
                          {selectedLog.requestBody && (
                            <button
                              type="button"
                              onClick={() =>
                                copyToClipboard(selectedLog.requestBody || "", "reqBody")
                              }
                              className="text-zinc-400 hover:text-zinc-200 flex items-center gap-1 text-[11px]"
                            >
                              {copiedKey === "reqBody" ? (
                                <CheckIcon className="size-3 text-emerald-400" />
                              ) : (
                                <CopyIcon className="size-3" />
                              )}
                              Copy
                            </button>
                          )}
                        </div>
                        {selectedLog.requestBody ? (
                          <pre className="rounded-md border border-zinc-800 bg-zinc-900/70 p-3 text-[11px] text-zinc-200 whitespace-pre-wrap overflow-x-auto">
                            {selectedLog.requestBody}
                          </pre>
                        ) : (
                          <p className="text-zinc-500 text-[11px]">No request body payload</p>
                        )}
                      </div>
                    )}

                    {activeTab === "response" && (
                      <div>
                        <div className="flex items-center justify-between mb-2">
                          <h4 className="text-[11px] font-sans font-semibold uppercase tracking-wider text-zinc-400">
                            Response Payload
                          </h4>
                          {selectedLog.responseBody && (
                            <button
                              type="button"
                              onClick={() =>
                                copyToClipboard(selectedLog.responseBody || "", "resBody")
                              }
                              className="text-zinc-400 hover:text-zinc-200 flex items-center gap-1 text-[11px]"
                            >
                              {copiedKey === "resBody" ? (
                                <CheckIcon className="size-3 text-emerald-400" />
                              ) : (
                                <CopyIcon className="size-3" />
                              )}
                              Copy
                            </button>
                          )}
                        </div>
                        {selectedLog.responseBody ? (
                          <pre className="rounded-md border border-zinc-800 bg-zinc-900/70 p-3 text-[11px] text-zinc-200 whitespace-pre-wrap overflow-x-auto">
                            {selectedLog.responseBody}
                          </pre>
                        ) : (
                          <p className="text-zinc-500 text-[11px]">No response body available</p>
                        )}
                      </div>
                    )}

                    {activeTab === "curl" && (
                      <div>
                        <div className="flex items-center justify-between mb-2">
                          <h4 className="text-[11px] font-sans font-semibold uppercase tracking-wider text-zinc-400">
                            cURL Equivalent
                          </h4>
                          <button
                            type="button"
                            onClick={() =>
                              copyToClipboard(formatCurlCommand(selectedLog), "curlText")
                            }
                            className="text-zinc-400 hover:text-zinc-200 flex items-center gap-1 text-[11px]"
                          >
                            {copiedKey === "curlText" ? (
                              <CheckIcon className="size-3 text-emerald-400" />
                            ) : (
                              <CopyIcon className="size-3" />
                            )}
                            Copy cURL
                          </button>
                        </div>
                        <pre className="rounded-md border border-zinc-800 bg-zinc-900/70 p-3 text-[11px] text-zinc-200 whitespace-pre-wrap overflow-x-auto">
                          {formatCurlCommand(selectedLog)}
                        </pre>
                      </div>
                    )}
                  </div>
                </div>
              ) : (
                <div className="hidden md:flex flex-1 items-center justify-center p-8 text-center text-zinc-600 text-xs">
                  Select any request from the list to view headers, payload, response, and cURL
                  details.
                </div>
              )}
            </div>
          </div>
        )}

        {/* Bottom Cupertino iOS Toolbar with Bottom-Left Close Button */}
        <div className="shrink-0 flex items-center justify-between px-3 py-2 sm:px-4 sm:py-2.5 bg-zinc-900/95 border-t border-zinc-800/80 backdrop-blur-md text-xs select-none">
          {/* Bottom-Left Close Button */}
          <button
            type="button"
            onClick={onClose}
            className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-full bg-zinc-800/90 hover:bg-zinc-700 text-zinc-200 hover:text-white border border-zinc-700/70 font-medium text-xs transition-all cursor-pointer shadow-xs active:scale-95"
            title="Close Sheet"
          >
            <XIcon className="size-3.5 text-zinc-300" />
            <span>Close</span>
          </button>

          <div className="flex items-center gap-2 text-3xs font-mono text-zinc-400">
            <span className="size-1.5 rounded-full bg-emerald-400 animate-pulse" />
            <span className="hidden sm:inline">Live Inspector &bull;</span>
            <span>{aiLogs.length + logs.length} Records</span>
          </div>
        </div>
      </div>
    </div>
  );
}
