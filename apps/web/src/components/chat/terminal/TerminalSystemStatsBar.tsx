import { useState, useEffect, useCallback } from "react";
import { Cpu, HardDrive, Activity, RotateCw, Server } from "lucide-react";
import { resolvePrimaryEnvironmentHttpUrl } from "../../../environments/primary";
import { terminalStore } from "./terminalStore";

export interface QuickStatsResponse {
  ok: boolean;
  memPercent: number;
  memUsedGb: string;
  memTotalGb: string;
  diskFreeGb: string;
  diskTotalGb: string;
  diskPercent: number;
  uptimeStr: string;
  cpuCount: number;
  loadAvg: string;
}

export function TerminalSystemStatsBar() {
  const [stats, setStats] = useState<QuickStatsResponse | null>(null);
  const [loading, setLoading] = useState(false);

  const fetchStats = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(resolvePrimaryEnvironmentHttpUrl("/api/terminal/quick-stats"));
      if (res.ok) {
        const data = (await res.json()) as QuickStatsResponse;
        if (data.ok) {
          setStats(data);
        }
      }
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchStats();
    // Auto refresh every 30s
    const interval = setInterval(() => {
      void fetchStats();
    }, 30_000);
    return () => clearInterval(interval);
  }, [fetchStats]);

  if (!stats) return null;

  return (
    <div className="flex items-center gap-2 overflow-x-auto py-1 px-2.5 rounded-lg bg-[#0e141e]/90 border border-zinc-800/80 text-3xs font-mono select-none">
      <span className="flex items-center gap-1 text-zinc-500 font-sans font-semibold shrink-0">
        <Server className="size-3 text-sky-400" />
        <span>VPS Live:</span>
      </span>

      {/* RAM */}
      <button
        type="button"
        onClick={() => void terminalStore.runCommand("free -h", undefined, "bash")}
        className="flex items-center gap-1 px-2 py-0.5 rounded bg-zinc-900 hover:bg-sky-500/10 border border-zinc-800 hover:border-sky-500/40 text-zinc-300 transition-colors shrink-0 group"
        title="RAM Memory usage. Click to run 'free -h'"
      >
        <Activity
          className={`size-2.5 ${stats.memPercent > 80 ? "text-rose-400" : "text-sky-400"}`}
        />
        <span>
          RAM:{" "}
          <strong
            className={
              stats.memPercent > 80 ? "text-rose-300 font-bold" : "text-zinc-100 font-medium"
            }
          >
            {stats.memPercent}%
          </strong>{" "}
          <span className="text-zinc-500 text-4xs">
            ({stats.memUsedGb}/{stats.memTotalGb}GB)
          </span>
        </span>
      </button>

      {/* Disk */}
      <button
        type="button"
        onClick={() => void terminalStore.runCommand("df -h /", undefined, "bash")}
        className="flex items-center gap-1 px-2 py-0.5 rounded bg-zinc-900 hover:bg-amber-500/10 border border-zinc-800 hover:border-amber-500/40 text-zinc-300 transition-colors shrink-0 group"
        title="Disk storage space. Click to run 'df -h /'"
      >
        <HardDrive
          className={`size-2.5 ${stats.diskPercent > 85 ? "text-rose-400" : "text-amber-400"}`}
        />
        <span>
          Disk:{" "}
          <strong
            className={
              stats.diskPercent > 85 ? "text-rose-300 font-bold" : "text-zinc-100 font-medium"
            }
          >
            {stats.diskPercent}%
          </strong>{" "}
          <span className="text-zinc-500 text-4xs">({stats.diskFreeGb}GB free)</span>
        </span>
      </button>

      {/* CPU Cores & Uptime */}
      <button
        type="button"
        onClick={() => void terminalStore.runCommand("uptime", undefined, "bash")}
        className="flex items-center gap-1 px-2 py-0.5 rounded bg-zinc-900 hover:bg-emerald-500/10 border border-zinc-800 hover:border-emerald-500/40 text-zinc-300 transition-colors shrink-0 group"
        title="CPU & Uptime. Click to run 'uptime'"
      >
        <Cpu className="size-2.5 text-emerald-400" />
        <span>
          CPU: <span className="text-zinc-100">{stats.cpuCount}C</span> · Up:{" "}
          <span className="text-zinc-100">{stats.uptimeStr}</span>
        </span>
      </button>

      {/* Manual Refresh */}
      <button
        type="button"
        onClick={() => void fetchStats()}
        disabled={loading}
        className="p-1 rounded text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800 transition-colors shrink-0"
        title="Refresh stats"
      >
        <RotateCw className={`size-2.5 ${loading ? "animate-spin text-sky-400" : ""}`} />
      </button>
    </div>
  );
}
