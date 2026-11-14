import { useNavigate } from "@tanstack/react-router";
import { scopeThreadRef } from "@t3tools/client-runtime/environment";
import type { EnvironmentId, ThreadId } from "@t3tools/contracts";
import { SquareIcon } from "lucide-react";

import { buildThreadRouteParams } from "../../threadRoutes";
import { useBackgroundSubagents } from "./BackgroundSubagentsProvider";

interface ThreadSubagentsSectionProps {
  readonly environmentId: EnvironmentId;
  readonly threadId: ThreadId;
}

function statusEmoji(status: string | undefined): string {
  switch (status) {
    case "completed":
      return "✅";
    case "failed":
    case "error":
      return "❌";
    case "cancelled":
      return "⏹️";
    default:
      return "⏳";
  }
}

/** Compact view of the same live subagent state and stop action used by Background Services. */
export function ThreadSubagentsSection({ environmentId, threadId }: ThreadSubagentsSectionProps) {
  const navigate = useNavigate();
  const { subagents, workersError, stoppingSubagentId, stopSubagent } = useBackgroundSubagents();

  return (
    <div className="flex flex-col gap-0.5 py-0.5" data-thread-subagents-section>
      <div className="flex min-h-7 items-center justify-between gap-2 px-2">
        <span className="flex min-w-0 items-center gap-1.5 text-xs font-medium text-foreground/85">
          <span aria-hidden="true">🤖</span>
          <span className="truncate">Subagents</span>
        </span>
        <span className="rounded-full bg-muted/60 px-1.5 py-0.5 font-mono text-[11px] leading-none text-muted-foreground">
          {subagents.length}
        </span>
      </div>
      {workersError ? (
        <div role="status" className="px-2 py-0.5 text-[10px] text-amber-500/90">
          {workersError}
        </div>
      ) : null}
      {subagents.length === 0 ? (
        <div className="px-2 py-1 font-mono text-[11px] text-muted-foreground">
          No active subagents
        </div>
      ) : (
        <div className="flex flex-col gap-0.5">
          {subagents.map((agent) => {
            const childThreadId = agent.childThreadId;
            const title = agent.title;
            const status = agent.status ?? "running";
            const isRunning = status === "running";
            const row = (
              <div className="flex min-h-7 items-center gap-2 rounded-md px-2 py-0.5 text-xs text-foreground/85 transition-colors hover:bg-white/[0.04]">
                <span aria-hidden="true">{statusEmoji(status)}</span>
                <span className="min-w-0 flex-1 truncate" title={title}>
                  {title}
                </span>
                {isRunning ? (
                  <button
                    type="button"
                    onClick={(event) => {
                      event.stopPropagation();
                      void stopSubagent(agent);
                    }}
                    disabled={stoppingSubagentId === agent.id}
                    className="rounded p-1 text-muted-foreground transition-colors hover:bg-rose-500/10 hover:text-rose-400 disabled:cursor-default disabled:opacity-40"
                    title="Stop Subagent"
                    aria-label={`Stop ${agent.title}`}
                  >
                    <SquareIcon className="size-3 fill-current" />
                  </button>
                ) : (
                  <span className="font-mono text-[10px] text-muted-foreground">{status}</span>
                )}
              </div>
            );

            if (!childThreadId) return <div key={agent.id}>{row}</div>;

            return (
              <button
                key={agent.id}
                type="button"
                className="w-full text-left"
                onClick={() =>
                  void navigate({
                    to: "/$environmentId/$threadId",
                    params: buildThreadRouteParams(scopeThreadRef(environmentId, childThreadId)),
                  })
                }
              >
                {row}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
