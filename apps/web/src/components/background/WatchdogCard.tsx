import { memo, useCallback, useEffect, useMemo, useState } from "react";
import { AlertCircle, CheckCircle2, ChevronDownIcon, InfoIcon, SquareIcon } from "lucide-react";

import { cn } from "../../lib/utils";
import { Tooltip, TooltipPopup, TooltipTrigger } from "../ui/tooltip";
import { SleekSpinnerRing } from "./sleekSpinner";

export type WatchdogStatus =
  | "watching"
  | "reviewing"
  | "building"
  | "testing"
  | "completed"
  | "failed";

export interface WatchdogWorkerRow {
  readonly id: string;
  readonly role: string;
  readonly goal: string;
  readonly status: "running" | "completed" | "failed";
  readonly filesChanged: number;
  readonly reviewNotes: ReadonlyArray<string>;
  readonly buildRan: boolean;
  readonly buildPassed: boolean | undefined;
  readonly testRan: boolean;
  readonly testPassed: boolean | undefined;
}

export interface WatchdogItem {
  readonly id: string;
  readonly status: WatchdogStatus;
  readonly projectId: string;
  readonly projectName: string;
  readonly taskTitle: string;
  readonly lastAction: string;
  readonly workers: ReadonlyArray<WatchdogWorkerRow>;
  readonly issues: ReadonlyArray<string>;
  readonly startedAt: number;
  readonly updatedAt: number;
  readonly completedAt: number | undefined;
  readonly verdict: string;
  /** How many times the watchdog repaired itself (model retry / repair agent). */
  readonly recoveries?: number | undefined;
}

export interface WatchdogCardProps {
  readonly projectName?: string | undefined;
  readonly className?: string;
  readonly initiallyExpanded?: boolean;
}

function statusIcon(status: WatchdogStatus) {
  switch (status) {
    case "completed":
      return <CheckCircle2 className="size-3.5 text-emerald-400 shrink-0" />;
    case "failed":
      return <AlertCircle className="size-3.5 text-rose-400 shrink-0" />;
    case "reviewing":
      return <SleekSpinnerRing className="size-3.5 text-violet-400 shrink-0 animate-spin" />;
    case "building":
      return <SleekSpinnerRing className="size-3.5 text-amber-400 shrink-0 animate-spin" />;
    case "testing":
      return <SleekSpinnerRing className="size-3.5 text-sky-400 shrink-0 animate-spin" />;
    default:
      return <SleekSpinnerRing className="size-3.5 text-cyan-400 shrink-0 animate-spin" />;
  }
}

function buildBadge(worker: WatchdogWorkerRow) {
  if (!worker.buildRan) {
    return (
      <span className="rounded bg-muted/60 px-1 py-0.5 text-[9px] font-mono text-muted-foreground">
        build skipped
      </span>
    );
  }
  return (
    <span
      className={cn(
        "rounded px-1 py-0.5 text-[9px] font-mono",
        worker.buildPassed ? "bg-emerald-500/15 text-emerald-400" : "bg-rose-500/15 text-rose-400",
      )}
    >
      build {worker.buildPassed ? "✓" : "✗"}
    </span>
  );
}

function testBadge(worker: WatchdogWorkerRow) {
  if (!worker.testRan) {
    return (
      <span className="rounded bg-muted/60 px-1 py-0.5 text-[9px] font-mono text-muted-foreground">
        no tests
      </span>
    );
  }
  return (
    <span
      className={cn(
        "rounded px-1 py-0.5 text-[9px] font-mono",
        worker.testPassed ? "bg-sky-500/15 text-sky-400" : "bg-rose-500/15 text-rose-400",
      )}
    >
      test {worker.testPassed ? "✓" : "✗"}
    </span>
  );
}

/**
 * Watchdog card — watches every sub-agent, shows what the watchdog is doing
 * right now (watching / reviewing / building / testing) and the verdict it
 * hands back to the Manager.
 */
export const WatchdogCard = memo(function WatchdogCard({
  projectName,
  className,
  initiallyExpanded = true,
}: WatchdogCardProps) {
  const [items, setItems] = useState<WatchdogItem[]>([]);
  const [expanded, setExpanded] = useState(initiallyExpanded);
  const [error, setError] = useState<string | null>(null);
  const [stoppingId, setStoppingId] = useState<string | null>(null);
  const [flowMode, setFlowMode] = useState<"watchdog" | "direct">("watchdog");

  const load = useCallback(
    async (signal?: AbortSignal) => {
      try {
        const params = new URLSearchParams();
        if (projectName) params.set("projectName", projectName);
        const query = params.size > 0 ? `?${params.toString()}` : "";
        const res = await fetch(`/api/super-agent/watchdog${query}`, { signal });
        if (!res.ok) throw new Error(`Watchdog API returned ${res.status}`);
        const data = await res.json();
        const list: WatchdogItem[] = Array.isArray(data?.watchdogs) ? data.watchdogs : [];
        setItems(list);
        if (data?.flowMode === "direct" || data?.flowMode === "watchdog") {
          setFlowMode(data.flowMode);
        }
        setError(null);
      } catch (err) {
        if ((err as any)?.name === "AbortError") return;
        setError("Watchdog API unreachable");
      }
    },
    [projectName],
  );

  useEffect(() => {
    const controller = new AbortController();
    void load(controller.signal);
    const interval = window.setInterval(() => {
      void load(controller.signal);
    }, 5000);
    return () => {
      controller.abort();
      window.clearInterval(interval);
    };
  }, [load]);

  const handleFlowModeChange = useCallback(async () => {
    const next = flowMode === "watchdog" ? "direct" : "watchdog";
    setFlowMode(next);
    try {
      await fetch("/api/app-settings/save", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key: "super_agent_flow_mode", value: next }),
      });
    } finally {
      void load();
    }
  }, [flowMode, load]);

  const handleStop = useCallback(
    async (watchdogId: string) => {
      setStoppingId(watchdogId);
      try {
        await fetch("/api/super-agent/watchdog/stop", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ watchdogId }),
        });
      } finally {
        setStoppingId(null);
        void load();
      }
    },
    [load],
  );

  const activeCount = useMemo(
    () => items.filter((w) => w.status !== "completed" && w.status !== "failed").length,
    [items],
  );

  return (
    <div className={cn("flex flex-col", className)}>
      <div
        role="button"
        tabIndex={0}
        onClick={() => setExpanded((v) => !v)}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            setExpanded((v) => !v);
          }
        }}
        className="flex h-7 items-center justify-between px-2 rounded-lg hover:bg-black/[0.035] dark:hover:bg-white/[0.08] transition-colors cursor-pointer group/header"
        aria-expanded={expanded}
      >
        <div className="flex items-center gap-2">
          <span className="text-xs font-medium text-foreground/85 group-hover/header:text-foreground transition-colors">
            Watchdog
          </span>
          <span className="rounded-full bg-muted/60 px-1.5 py-0.5 text-[11px] font-mono text-muted-foreground leading-none">
            {items.length}
          </span>
          {activeCount > 0 ? (
            <span className="rounded-full bg-cyan-500/15 px-1.5 py-0.5 text-[11px] font-mono text-cyan-400 leading-none">
              {activeCount} active
            </span>
          ) : null}
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              void handleFlowModeChange();
            }}
            className="rounded-full bg-violet-500/15 px-1.5 py-0.5 text-[10px] font-mono text-violet-400 leading-none hover:bg-violet-500/25 transition-colors cursor-pointer"
            title={
              flowMode === "watchdog"
                ? "Manager task flow: WATCHDOG (every task runs under the Watchdog). Click to switch to direct."
                : "Manager task flow: DIRECT (tasks run on the plain model path). Click to switch to watchdog."
            }
          >
            flow: {flowMode}
          </button>
        </div>
        <ChevronDownIcon
          className={cn(
            "size-3.5 text-muted-foreground transition-transform duration-200",
            !expanded && "-rotate-90",
          )}
        />
      </div>

      {expanded ? (
        <div className="flex flex-col gap-0.5 pt-0.5 pl-1">
          {error ? (
            <div
              role="status"
              className="py-0.5 px-2 text-[10px] text-amber-500/90 flex items-center gap-1"
            >
              <AlertCircle className="size-3 shrink-0" /> {error}
            </div>
          ) : null}
          {items.length === 0 ? (
            <div className="py-1 px-2 text-[11px] text-muted-foreground font-mono">
              No active watchdog
            </div>
          ) : (
            items.map((item) => {
              const isActive = item.status !== "completed" && item.status !== "failed";
              return (
                <div
                  key={item.id}
                  className="flex flex-col gap-1 px-2 py-1 rounded-md hover:bg-black/[0.025] dark:hover:bg-white/[0.05] transition-colors"
                >
                  <div className="flex items-center gap-2 min-w-0">
                    {statusIcon(item.status)}
                    <span className="text-xs text-foreground/85 truncate">{item.taskTitle}</span>
                    {isActive ? (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          void handleStop(item.id);
                        }}
                        disabled={stoppingId === item.id}
                        className="ml-auto p-1 rounded text-muted-foreground hover:text-rose-400 hover:bg-rose-500/10 transition-colors cursor-pointer disabled:opacity-40"
                        title="Stop Watchdog"
                        aria-label={`Stop watchdog for ${item.taskTitle}`}
                      >
                        <SquareIcon className="size-3 fill-current" />
                      </button>
                    ) : null}
                  </div>

                  <div className="text-[10px] text-muted-foreground/85 font-mono truncate pl-5.5">
                    {item.lastAction}
                  </div>

                  {item.workers.map((worker) => (
                    <div key={worker.id} className="flex flex-col gap-0.5 pl-5.5">
                      <div className="flex items-center gap-1.5 min-w-0">
                        {worker.status === "completed" ? (
                          <CheckCircle2 className="size-3 text-emerald-400 shrink-0" />
                        ) : worker.status === "failed" ? (
                          <AlertCircle className="size-3 text-rose-400 shrink-0" />
                        ) : (
                          <SleekSpinnerRing className="size-3 text-cyan-400 shrink-0 animate-spin" />
                        )}
                        <span className="text-[10px] text-foreground/75 truncate">
                          {worker.role}
                        </span>
                        <span className="text-[10px] text-muted-foreground/70 font-mono shrink-0">
                          {worker.filesChanged} file{worker.filesChanged === 1 ? "" : "s"}
                        </span>
                        <span className="ml-auto flex items-center gap-1 shrink-0">
                          {buildBadge(worker)}
                          {testBadge(worker)}
                        </span>
                      </div>
                      {worker.reviewNotes.length > 0 ? (
                        <div className="flex items-center gap-1 pl-4.5">
                          <Tooltip>
                            <TooltipTrigger
                              render={
                                <button
                                  type="button"
                                  className="rounded p-0.5 text-amber-400/90 hover:text-amber-300 transition-colors cursor-pointer"
                                  aria-label={`Review notes for ${worker.role}`}
                                >
                                  <InfoIcon className="size-3" />
                                </button>
                              }
                            />
                            <TooltipPopup side="left" className="max-w-80 text-left">
                              {worker.reviewNotes.join("\n")}
                            </TooltipPopup>
                          </Tooltip>
                          <span className="text-[10px] text-amber-400/90 truncate">
                            {worker.reviewNotes[0]}
                          </span>
                        </div>
                      ) : null}
                    </div>
                  ))}

                  {item.verdict ? (
                    <div className="text-[10px] text-muted-foreground/80 pl-5.5">
                      {item.verdict}
                    </div>
                  ) : null}
                  {item.recoveries && item.recoveries > 0 ? (
                    <div className="pl-5.5">
                      <span className="rounded bg-violet-500/15 px-1 py-0.5 text-[9px] font-mono text-violet-400">
                        🛠 {item.recoveries} self-heal{item.recoveries === 1 ? "" : "s"}
                      </span>
                    </div>
                  ) : null}
                </div>
              );
            })
          )}
        </div>
      ) : null}
    </div>
  );
});
