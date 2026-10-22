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

  const iconColorClass = isPending
    ? "text-amber-400 animate-pulse drop-shadow-[0_0_6px_rgba(251,191,36,0.7)]"
    : hasRecentError
      ? "text-rose-400 animate-pulse drop-shadow-[0_0_6px_rgba(244,63,94,0.7)]"
      : logs.length > 0
        ? "text-emerald-400 drop-shadow-[0_0_4px_rgba(52,211,153,0.5)]"
        : "text-zinc-400 group-hover:text-emerald-400";

  const borderClass = hasRecentError
    ? "border-rose-500/50 bg-rose-950/20"
    : isPending
      ? "border-amber-500/50 bg-amber-950/20"
      : "border-zinc-700/60 bg-zinc-900/90";

  return (
    <>
      <button
        type="button"
        onClick={() => setIsOpen(true)}
        className={`fixed bottom-[1.5px] right-[1.5px] z-[90] flex scale-[0.66] origin-bottom-right items-center gap-1.5 rounded-full border ${borderClass} px-2 py-1 text-xs font-medium text-zinc-200 shadow-lg backdrop-blur-md transition-all duration-150 hover:scale-[1] hover:bg-zinc-800 hover:border-zinc-500 hover:text-white active:scale-[0.62] cursor-pointer group`}
        title={`Open Network & Runtime Logs (${logs.length} captured)`}
      >
        <ActivityIcon className={`size-3.5 transition-all shrink-0 ${iconColorClass}`} />

        <span className="text-[10px] font-mono font-bold text-zinc-300 group-hover:text-white leading-none">
          {logs.length}
        </span>
      </button>

      <RequestLogsSheet isOpen={isOpen} onClose={() => setIsOpen(false)} />
    </>
  );
}
