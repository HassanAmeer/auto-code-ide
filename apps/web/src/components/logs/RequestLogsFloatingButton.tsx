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
        className="fixed bottom-1.5 right-1.5 sm:bottom-2.5 sm:right-2.5 z-[90] flex items-center gap-1.5 rounded-full border border-zinc-700/60 bg-zinc-900/90 px-2 py-1 text-xs font-medium text-zinc-200 shadow-lg backdrop-blur-md transition-all duration-150 hover:scale-105 hover:bg-zinc-800 hover:border-zinc-500 hover:text-white active:scale-95 cursor-pointer group"
        title={`Open Network & Runtime Logs (${logs.length} captured)`}
      >
        <span className="relative flex size-1.5 shrink-0">
          {isPending ? (
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-amber-400 opacity-75" />
          ) : hasRecentError ? (
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-rose-400 opacity-75" />
          ) : (
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
          )}
          <span
            className={`relative inline-flex size-1.5 rounded-full ${
              isPending ? "bg-amber-400" : hasRecentError ? "bg-rose-400" : "bg-emerald-400"
            }`}
          />
        </span>

        <ActivityIcon className="size-3.5 text-zinc-400 group-hover:text-emerald-400 transition-colors shrink-0" />

        <span className="text-[10px] font-mono font-bold text-zinc-300 group-hover:text-white leading-none">
          {logs.length}
        </span>
      </button>

      <RequestLogsSheet isOpen={isOpen} onClose={() => setIsOpen(false)} />
    </>
  );
}
