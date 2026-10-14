import { memo, useState, useEffect } from "react";
import { resolvePrimaryEnvironmentHttpUrl } from "../../environments/primary";
import { cn } from "../../lib/utils";

interface ResourceStats {
  cpuPercent: number;
  memPercent: number;
  memUsedGb: string;
  memTotalGb: string;
  diskPercent: number;
  diskFreeGb: string;
  diskTotalGb: string;
  uptimeStr?: string;
}

export const SidebarResourceStats = memo(function SidebarResourceStats() {
  const [stats, setStats] = useState<ResourceStats | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let isMounted = true;

    async function fetchStats() {
      try {
        const res = await fetch(resolvePrimaryEnvironmentHttpUrl("/api/terminal/quick-stats"));
        if (!res.ok) return;
        const data = await res.json();
        if (data && data.ok && isMounted) {
          setStats({
            cpuPercent: typeof data.cpuPercent === "number" ? data.cpuPercent : 0,
            memPercent: typeof data.memPercent === "number" ? data.memPercent : 0,
            memUsedGb: data.memUsedGb || "0",
            memTotalGb: data.memTotalGb || "0",
            diskPercent: typeof data.diskPercent === "number" ? data.diskPercent : 0,
            diskFreeGb: data.diskFreeGb || "0",
            diskTotalGb: data.diskTotalGb || "0",
            uptimeStr: data.uptimeStr,
          });
          setIsLoading(false);
        }
      } catch {
        if (isMounted) setIsLoading(false);
      }
    }

    // Non-blocking lazy initial fetch so sidebar renders instantly
    const initTimer = setTimeout(() => {
      void fetchStats();
    }, 60);

    // Subtle background refresh every 15 seconds
    const interval = setInterval(() => {
      void fetchStats();
    }, 15000);

    return () => {
      isMounted = false;
      clearTimeout(initTimer);
      clearInterval(interval);
    };
  }, []);

  return (
    <div className="w-full px-2 py-1 select-none">
      <div
        className={cn(
          "flex items-center gap-2 overflow-x-auto [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden",
          "py-1 px-2.5 rounded-lg bg-zinc-900/60 dark:bg-zinc-950/60 border border-zinc-800/60 shadow-2xs backdrop-blur-xs",
        )}
      >
        {isLoading && !stats ? (
          // Cupertino shimmer skeleton loader
          <div className="flex items-center gap-2 animate-pulse min-w-max">
            <div className="h-2.5 w-12 rounded-sm bg-zinc-700/50" />
            <div className="w-px h-2.5 bg-zinc-700/50 shrink-0" />
            <div className="h-2.5 w-12 rounded-sm bg-zinc-700/50" />
            <div className="w-px h-2.5 bg-zinc-700/50 shrink-0" />
            <div className="h-2.5 w-12 rounded-sm bg-zinc-700/50" />
          </div>
        ) : stats ? (
          // Cupertino iOS style live metrics with separators
          <div className="flex items-center gap-2 font-mono text-[10px] min-w-max leading-none text-zinc-400">
            {/* CPU */}
            <div
              className="flex items-center gap-1 shrink-0"
              title={`CPU Usage: ${stats.cpuPercent}%`}
            >
              <span className="text-zinc-500 font-semibold tracking-wider">CPU:</span>
              <span
                className={cn(
                  "font-bold transition-colors",
                  stats.cpuPercent > 80
                    ? "text-rose-400"
                    : stats.cpuPercent > 50
                      ? "text-amber-400"
                      : "text-emerald-400",
                )}
              >
                {stats.cpuPercent}%
              </span>
            </div>

            {/* Separator line */}
            <div className="w-px h-2.5 bg-zinc-700/60 shrink-0" />

            {/* RAM */}
            <div
              className="flex items-center gap-1 shrink-0"
              title={`RAM: ${stats.memUsedGb} GB / ${stats.memTotalGb} GB (${stats.memPercent}%)`}
            >
              <span className="text-zinc-500 font-semibold tracking-wider">RAM:</span>
              <span
                className={cn(
                  "font-bold transition-colors",
                  stats.memPercent > 85
                    ? "text-rose-400"
                    : stats.memPercent > 65
                      ? "text-amber-400"
                      : "text-sky-400",
                )}
              >
                {stats.memPercent}%
              </span>
            </div>

            {/* Separator line */}
            <div className="w-px h-2.5 bg-zinc-700/60 shrink-0" />

            {/* ROM / Storage */}
            <div
              className="flex items-center gap-1 shrink-0"
              title={`ROM / Disk: ${stats.diskFreeGb} GB free of ${stats.diskTotalGb} GB (${stats.diskPercent}% used)`}
            >
              <span className="text-zinc-500 font-semibold tracking-wider">ROM:</span>
              <span
                className={cn(
                  "font-bold transition-colors",
                  stats.diskPercent > 90
                    ? "text-rose-400"
                    : stats.diskPercent > 75
                      ? "text-amber-400"
                      : "text-purple-400",
                )}
              >
                {stats.diskPercent}%
              </span>
            </div>

            {/* Optional extra: Uptime */}
            {stats.uptimeStr && (
              <>
                <div className="w-px h-2.5 bg-zinc-700/60 shrink-0" />
                <div className="flex items-center gap-1 shrink-0 text-zinc-500 text-[9px]">
                  <span>Up:</span>
                  <span className="text-zinc-400">{stats.uptimeStr}</span>
                </div>
              </>
            )}
          </div>
        ) : null}
      </div>
    </div>
  );
});
