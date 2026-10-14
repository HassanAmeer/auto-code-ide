import React, { useState } from "react";
import { ActivityIcon } from "lucide-react";
import { useNetworkLogs } from "./useNetworkLogs";
import { RequestLogsSheet } from "./RequestLogsSheet";
import { useShowLogFloatingButton } from "../../lib/floatingLogButtonSettings";

export function RequestLogsFloatingButton() {
  const [showButton] = useShowLogFloatingButton();
  const [isOpen, setIsOpen] = useState(false);
  const logs = useNetworkLogs();

  if (!showButton) {
    return null;
  }

  const hasRecentError =
    logs.length > 0 && (logs[0]?.state === "error" || (logs[0]?.status && logs[0].status >= 400));
  const isPending = logs.length > 0 && logs[0]?.state === "pending";

  return (
    <>
      <button
        type="button"
        onClick={() => setIsOpen(true)}
        className="fixed bottom-4 right-4 z-[90] flex items-center gap-2 rounded-full border border-zinc-700/60 bg-zinc-900/90 px-3.5 py-1.5 text-xs font-medium text-zinc-200 shadow-xl backdrop-blur-md transition-all duration-150 hover:scale-105 hover:bg-zinc-850 hover:border-zinc-600 hover:text-white active:scale-95 cursor-pointer group"
        title="Open Network & Runtime Request Inspector"
      >
        <span className="relative flex size-2">
          {isPending ? (
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-amber-400 opacity-75" />
          ) : hasRecentError ? (
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-rose-400 opacity-75" />
          ) : (
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
          )}
          <span
            className={`relative inline-flex size-2 rounded-full ${
              isPending ? "bg-amber-400" : hasRecentError ? "bg-rose-400" : "bg-emerald-400"
            }`}
          />
        </span>

        <ActivityIcon className="size-3.5 text-zinc-400 group-hover:text-emerald-400 transition-colors" />
        <span className="font-semibold tracking-tight">Logs</span>

        <span className="rounded-full bg-zinc-800 px-1.5 py-0.2 text-[10px] font-mono text-zinc-400 group-hover:text-zinc-200">
          {logs.length}
        </span>
      </button>

      <RequestLogsSheet isOpen={isOpen} onClose={() => setIsOpen(false)} />
    </>
  );
}
