import { terminalStore } from "./terminal/terminalStore";
import type { EnvironmentId, ProjectId, ThreadId } from "@t3tools/contracts";
import { useNavigate } from "@tanstack/react-router";
import { PlusIcon } from "lucide-react";
import { useEffect, useMemo, useRef } from "react";

import { useThreadShells } from "~/state/entities";
import { cn } from "~/lib/utils";

interface ActiveProjectLike {
  readonly id: ProjectId;
  readonly environmentId: EnvironmentId;
  readonly title: string;
}

interface MobileProjectThreadTabsProps {
  readonly activeProject: ActiveProjectLike | null;
  readonly activeThreadId: ThreadId | null;
  readonly onNewThread?: () => void;
}

/** Formats title to 1-2 words with trailing ellipsis if longer */
function formatTabTitle(title: string | null | undefined): string {
  const clean = title?.trim() || "";
  if (!clean) return "Chat";
  const words = clean.split(/\s+/);
  if (words.length <= 2) {
    return clean.length > 15 ? `${clean.slice(0, 13)}…` : clean;
  }
  const twoWords = words.slice(0, 2).join(" ");
  return twoWords.length > 15 ? `${twoWords.slice(0, 13)}…` : `${twoWords}…`;
}

export function MobileProjectThreadTabs({
  activeProject,
  activeThreadId,
  onNewThread,
}: MobileProjectThreadTabsProps) {
  const navigate = useNavigate();
  const allThreads = useThreadShells();
  const activeTabRef = useRef<HTMLButtonElement | null>(null);

  const projectThreads = useMemo(() => {
    if (!activeProject) return [];
    return allThreads
      .filter(
        (thread) =>
          thread.deletedAt == null &&
          thread.archivedAt == null &&
          thread.environmentId === activeProject.environmentId &&
          thread.projectId === activeProject.id,
      )
      .sort((a, b) => {
        const aTime = a.createdAt ? new Date(a.createdAt).getTime() : 0;
        const bTime = b.createdAt ? new Date(b.createdAt).getTime() : 0;
        return aTime - bTime;
      });
  }, [activeProject, allThreads]);

  // Smoothly scroll active tab into view when active thread changes
  useEffect(() => {
    if (activeTabRef.current) {
      activeTabRef.current.scrollIntoView({
        behavior: "smooth",
        inline: "nearest",
        block: "nearest",
      });
    }
  }, [activeThreadId]);

  if (!activeProject || projectThreads.length === 0) {
    return null;
  }

  return (
    <div
      aria-label="Project chats"
      className="pointer-events-auto relative z-0 w-full overflow-hidden pt-1 md:hidden"
    >
      <div
        className="flex items-center gap-1.5 overflow-x-auto px-1 py-1 scroll-smooth"
        style={{ scrollbarWidth: "none" }}
      >
        {projectThreads.map((thread, index) => {
          const isActive = thread.id === activeThreadId;
          const displayTitle = formatTabTitle(thread.title);

          return (
            <button
              key={thread.id}
              ref={isActive ? activeTabRef : null}
              type="button"
              onClick={() => {
                terminalStore.setQuickBarOpen(false);
                void navigate({
                  to: "/$environmentId/$threadId",
                  params: {
                    environmentId: thread.environmentId,
                    threadId: thread.id,
                  },
                });
              }}
              className={cn(
                "group flex shrink-0 items-center gap-1.5 rounded-lg border px-2 py-1 text-xs transition-colors",
                isActive
                  ? "border-zinc-500 bg-zinc-800/90 text-white shadow-sm ring-1 ring-zinc-500/40"
                  : "border-zinc-700/70 bg-zinc-900/80 text-zinc-300 hover:border-zinc-500 hover:text-white",
              )}
              title={thread.title || `Chat ${index + 1}`}
            >
              <span
                className={cn(
                  "flex size-4 shrink-0 items-center justify-center rounded text-[10px] font-bold leading-none",
                  isActive ? "bg-zinc-700 text-white" : "bg-zinc-800 text-zinc-400",
                )}
              >
                {index + 1}
              </span>
              <span className="max-w-[90px] truncate font-medium">{displayTitle}</span>
            </button>
          );
        })}

        {onNewThread ? (
          <button
            type="button"
            onClick={() => {
              terminalStore.setQuickBarOpen(false);
              onNewThread();
            }}
            className="flex size-7 shrink-0 items-center justify-center rounded-lg border border-zinc-700/70 bg-zinc-900/80 text-zinc-400 transition-colors hover:border-zinc-500 hover:text-white"
            title="Start new chat in this project"
            aria-label="Start new chat in this project"
          >
            <PlusIcon className="size-3.5" />
          </button>
        ) : null}
      </div>
    </div>
  );
}
