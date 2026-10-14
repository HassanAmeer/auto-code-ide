import React, { useState, useMemo } from "react";
import {
  XIcon,
  Trash2Icon,
  SearchIcon,
  CopyIcon,
  CheckIcon,
  ArrowRightIcon,
  TerminalIcon,
  CodeIcon,
  GlobeIcon,
  ClockIcon,
  FileTextIcon,
} from "lucide-react";
import { networkLogger, formatCurlCommand, type RequestLogEntry } from "../../lib/networkLogger";
import { useNetworkLogs } from "./useNetworkLogs";
import { Button } from "../ui/button";

interface RequestLogsSheetProps {
  isOpen: boolean;
  onClose: () => void;
}

export function RequestLogsSheet({ isOpen, onClose }: RequestLogsSheetProps) {
  const logs = useNetworkLogs();
  const [filterType, setFilterType] = useState<"all" | "http" | "ws" | "error">("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedLogId, setSelectedLogId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<
    "overview" | "headers" | "payload" | "response" | "curl"
  >("overview");
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  const copyToClipboard = (text: string, key: string) => {
    navigator.clipboard.writeText(text);
    setCopiedKey(key);
    setTimeout(() => {
      setCopiedKey(null);
    }, 1800);
  };

  const filteredLogs = useMemo(() => {
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

  return (
    <div className="fixed inset-0 z-[120] flex justify-end">
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/50 backdrop-blur-xs transition-opacity"
        onClick={onClose}
      />

      {/* Slide-over panel */}
      <div className="relative z-[121] flex h-full w-full max-w-3xl flex-col bg-zinc-950 text-zinc-100 border-l border-zinc-800/80 shadow-2xl animate-in slide-in-from-right duration-200">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-zinc-800/80 px-4 py-3 bg-zinc-900/60">
          <div className="flex items-center gap-2.5">
            <div className="size-2 rounded-full bg-emerald-400 animate-ping" />
            <h2 className="text-sm font-semibold tracking-wide text-zinc-100 flex items-center gap-2">
              Runtime Request Logs
              <span className="rounded-full bg-zinc-800 px-2 py-0.5 text-xs font-mono font-normal text-zinc-400">
                {logs.length}
              </span>
            </h2>
          </div>

          <div className="flex items-center gap-1.5">
            <Button
              size="xs"
              variant="outline"
              onClick={() => networkLogger.clear()}
              title="Clear all recorded logs"
              className="h-7 text-xs gap-1 border-zinc-800 hover:bg-zinc-900 hover:text-rose-400 text-zinc-400"
            >
              <Trash2Icon className="size-3.5" />
              Clear
            </Button>
            <button
              type="button"
              onClick={onClose}
              className="rounded-md p-1.5 text-zinc-400 hover:bg-zinc-800 hover:text-zinc-100 transition-colors cursor-pointer"
            >
              <XIcon className="size-4" />
            </button>
          </div>
        </div>

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

        {/* Content View: Split or List */}
        <div className="flex flex-1 min-h-0 divide-x divide-zinc-800/80">
          {/* List panel */}
          <div
            className={`flex flex-col overflow-y-auto ${selectedLog ? "w-1/2 hidden md:flex" : "w-full"}`}
          >
            {filteredLogs.length === 0 ? (
              <div className="flex flex-col items-center justify-center p-12 text-center text-zinc-500">
                <GlobeIcon className="size-8 stroke-1 text-zinc-600 mb-2" />
                <p className="text-xs font-medium">No requests recorded</p>
                <p className="text-3xs text-zinc-600 mt-1">
                  Actions and network activity will appear here in real-time.
                </p>
              </div>
            ) : (
              <div className="divide-y divide-zinc-900">
                {filteredLogs.map((log) => {
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
                        <span className="text-xs font-mono text-zinc-300 truncate" title={log.url}>
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
              {/* Detail Header */}
              <div className="flex items-center justify-between border-b border-zinc-800 px-4 py-2 bg-zinc-900/50">
                <div className="flex items-center gap-2 min-w-0">
                  <button
                    type="button"
                    onClick={() => setSelectedLogId(null)}
                    className="md:hidden text-zinc-400 hover:text-zinc-100 p-1 mr-1"
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
                          <span className="text-zinc-300">{selectedLog.durationMs ?? 0} ms</span>
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
                        <p className="text-zinc-500 text-[11px]">No response headers captured</p>
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
                          onClick={() => copyToClipboard(selectedLog.requestBody || "", "reqBody")}
                          className="text-zinc-400 hover:text-zinc-200 flex items-center gap-1 text-[11px]"
                        >
                          {copiedKey === "reqBody" ? (
                            <CheckIcon className="size-3 text-emerald-400" />
                          ) : (
                            <CopyIcon className="size-3" />
                          )}
                          Copy Body
                        </button>
                      )}
                    </div>
                    {selectedLog.requestBody ? (
                      <pre className="rounded-md border border-zinc-800 bg-zinc-900/70 p-3 text-[11px] text-zinc-200 whitespace-pre-wrap overflow-x-auto max-h-[500px]">
                        {selectedLog.requestBody}
                      </pre>
                    ) : (
                      <p className="text-zinc-500 text-[11px]">No request body</p>
                    )}
                  </div>
                )}

                {activeTab === "response" && (
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <h4 className="text-[11px] font-sans font-semibold uppercase tracking-wider text-zinc-400">
                        Response Body
                      </h4>
                      {selectedLog.responseBody && (
                        <button
                          type="button"
                          onClick={() => copyToClipboard(selectedLog.responseBody || "", "resBody")}
                          className="text-zinc-400 hover:text-zinc-200 flex items-center gap-1 text-[11px]"
                        >
                          {copiedKey === "resBody" ? (
                            <CheckIcon className="size-3 text-emerald-400" />
                          ) : (
                            <CopyIcon className="size-3" />
                          )}
                          Copy Response
                        </button>
                      )}
                    </div>
                    {selectedLog.responseBody ? (
                      <pre className="rounded-md border border-zinc-800 bg-zinc-900/70 p-3 text-[11px] text-zinc-200 whitespace-pre-wrap overflow-x-auto max-h-[500px]">
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
                        onClick={() => copyToClipboard(formatCurlCommand(selectedLog), "curlText")}
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
              Select any request from the list to view headers, payload, response, and cURL details.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
