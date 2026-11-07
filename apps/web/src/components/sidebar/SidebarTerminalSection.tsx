import { useState, useCallback, useMemo, useRef } from "react";
import { useRouter, useParams } from "@tanstack/react-router";
import {
  Terminal,
  ChevronDown,
  ChevronRight,
  MoreVertical,
  Plus,
  Trash2,
  Pencil,
  CircleDashed,
} from "lucide-react";
import { cn } from "~/lib/utils";
import { useTerminalStore, terminalStore } from "~/components/chat/terminal/terminalStore";
import {
  useTerminalThreadIds,
  addTerminalThreadId,
  removeTerminalThreadId,
  getTerminalThreadProject,
  setTerminalThreadProject,
} from "~/components/chat/terminal/terminalThreadRegistry";
import { Button } from "~/components/ui/button";
import { Tooltip, TooltipTrigger, TooltipPopup } from "~/components/ui/tooltip";
import { Menu, MenuTrigger, MenuPopup, MenuItem, MenuSeparator } from "~/components/ui/menu";
import { useThreadShells, useProjects } from "~/state/entities";
import { useScratchProject } from "~/hooks/useScratchProject";
import { usePrimaryEnvironmentId } from "~/state/environments";
import { toastManager } from "~/components/ui/toast";
import { useNewThreadHandler } from "~/hooks/useHandleNewThread";
import { useThreadActions } from "~/hooks/useThreadActions";
import { useOrchestrationCommand } from "~/state/use-orchestration-command";
import { scopeThreadRef, scopeProjectRef } from "@t3tools/client-runtime/environment";
import type { EnvironmentThreadShell } from "@t3tools/client-runtime/state/shell";
import { threadEnvironment } from "~/state/threads";
import { buildThreadRouteParams, resolveThreadRouteTarget } from "~/threadRoutes";
import { useComposerDraftStore } from "~/composerDraftStore";
import { isSidebarThreadWorking } from "~/components/Sidebar.logic";
import { isLatestRunSettled } from "~/session-logic";

export function SidebarTerminalSection() {
  const router = useRouter();
  const store = useTerminalStore();
  const sidebarThreads = useThreadShells();
  const projects = useProjects();
  const { scratchEnvironmentId, openScratchProject } = useScratchProject();
  const primaryEnvironmentId = usePrimaryEnvironmentId();
  const handleNewThread = useNewThreadHandler();
  const { deleteThread } = useThreadActions();
  const updateThreadMetadata = useOrchestrationCommand(threadEnvironment.updateMetadata, {
    reportFailure: false,
  });

  const terminalThreadIds = useTerminalThreadIds();
  const terminalIdsSet = useMemo(() => new Set(terminalThreadIds), [terminalThreadIds]);

  const routeTarget = useParams({
    strict: false,
    select: (params) => resolveThreadRouteTarget(params),
  });
  const activeRouteThreadId =
    routeTarget?.kind === "server"
      ? routeTarget.threadRef.threadId
      : routeTarget?.kind === "draft"
        ? routeTarget.draftId
        : null;

  const [editingThreadId, setEditingThreadId] = useState<string | null>(null);
  const [editingTitle, setEditingTitle] = useState("");
  const [locallyDeletedIds, setLocallyDeletedIds] = useState<Set<string>>(new Set());

  const [isExpanded, setIsExpanded] = useState(() => {
    try {
      const saved = localStorage.getItem("sidebar_terminal_section_expanded");
      return saved !== null ? saved === "true" : true;
    } catch {
      return true;
    }
  });

  const toggleExpanded = useCallback(() => {
    setIsExpanded((prev) => {
      const next = !prev;
      try {
        localStorage.setItem("sidebar_terminal_section_expanded", String(next));
      } catch {}
      return next;
    });
  }, []);

  const isCreatingRef = useRef(false);

  // Filter, deduplicate by thread id, and sort terminal threads chronologically
  const terminalThreads = useMemo(() => {
    const seen = new Set<string>();
    return sidebarThreads
      .filter((t) => {
        if (!terminalIdsSet.has(t.id)) return false;
        if (locallyDeletedIds.has(t.id)) return false;
        if (t.archivedAt !== null || t.deletedAt !== null) return false;
        if (seen.has(t.id)) return false;
        seen.add(t.id);
        return true;
      })
      .sort((a, b) => {
        const timeA =
          typeof a.updatedAt === "number" ? a.updatedAt : Date.parse(String(a.updatedAt || 0));
        const timeB =
          typeof b.updatedAt === "number" ? b.updatedAt : Date.parse(String(b.updatedAt || 0));
        return timeB - timeA;
      });
  }, [sidebarThreads, terminalIdsSet, locallyDeletedIds]);

  const isThreadWorking = useCallback((thread: EnvironmentThreadShell): boolean => {
    if (isSidebarThreadWorking(thread)) return true;
    const status = thread.runtime?.status;
    if (
      status === "running" ||
      status === "waiting" ||
      status === "preparing" ||
      status === "starting" ||
      status === "queued"
    ) {
      return true;
    }
    if (thread.latestRun && !isLatestRunSettled(thread.latestRun, thread.runtime)) {
      return true;
    }
    return false;
  }, []);

  const hasAnyWorking = useMemo(() => {
    if (store.isAnyTerminalRunning) return true;
    return terminalThreads.some(isThreadWorking);
  }, [isThreadWorking, store.isAnyTerminalRunning, terminalThreads]);

  const handleSelectThread = useCallback(
    (thread: EnvironmentThreadShell) => {
      terminalStore.setQuickBarOpen(true);
      terminalStore.setMobileActiveTab("terminal");
      terminalStore.setActiveChatId(thread.id);

      // Sync active terminal project/scope with the thread's selection (defaults to root)
      const threadProjId = getTerminalThreadProject(thread.id);
      if (threadProjId) {
        const proj = projects.find((p) => p.id === threadProjId);
        if (proj) {
          terminalStore.setSelectedProject(proj.id, proj.title, proj.workspaceRoot);
          if (proj.workspaceRoot) terminalStore.setActiveCwd(proj.workspaceRoot);
        }
      } else {
        terminalStore.setSelectedProject(null, null, "/");
        terminalStore.setActiveCwd("/");
      }

      void router.navigate({
        to: "/$environmentId/$threadId",
        params: buildThreadRouteParams(scopeThreadRef(thread.environmentId, thread.id)),
      });
    },
    [projects, router],
  );

  const handleCreateNewChat = useCallback(
    async (e?: React.MouseEvent) => {
      e?.stopPropagation();
      e?.preventDefault();

      if (isCreatingRef.current) return;
      isCreatingRef.current = true;

      try {
        terminalStore.setQuickBarOpen(true);
        terminalStore.setMobileActiveTab("terminal");

        const targetProj =
          projects.find((p) => p.id === store.selectedProjectId) ||
          projects.find((p) => p.title?.toLowerCase().includes("temp")) ||
          projects[0];

        // With no projects at all, fall back to the scratch project (same as the
        // "Start without a project" flow) so the terminal button never dead-ends.
        let effectiveProject = targetProj ?? null;
        if (!effectiveProject) {
          const envId = scratchEnvironmentId(primaryEnvironmentId) ?? scratchEnvironmentId(null);
          if (envId) {
            effectiveProject = await openScratchProject(envId, "Could not open AI Terminal");
          }
        }
        if (!effectiveProject) {
          toastManager.add({
            type: "info",
            title: "Add a project first",
            description:
              "AI Terminal chats need a workspace. Use Add project or Start without a project.",
          });
          return;
        }

        const projectRef = scopeProjectRef(effectiveProject.environmentId, effectiveProject.id);
        const res = await handleNewThread(projectRef);
        // handleNewThread can bail out late (route raced) without surfacing the
        // threadId it reserved for the draft it just registered — fall back to
        // the draft session it wrote so the terminal chat still registers.
        const threadId =
          res?.threadId ??
          useComposerDraftStore.getState().getDraftSessionByProjectRef(projectRef)?.threadId ??
          null;
        if (threadId) {
          addTerminalThreadId(threadId);
          // Default to root unless the user specifically had a project selected
          if (store.selectedProjectId) {
            setTerminalThreadProject(threadId, store.selectedProjectId);
          } else {
            setTerminalThreadProject(threadId, null);
            terminalStore.setSelectedProject(null, null, "/");
            terminalStore.setActiveCwd("/");
          }
          terminalStore.setActiveChatId(threadId);
        }
      } finally {
        setTimeout(() => {
          isCreatingRef.current = false;
        }, 500);
      }
    },
    [
      handleNewThread,
      openScratchProject,
      projects,
      scratchEnvironmentId,
      primaryEnvironmentId,
      store.selectedProjectId,
    ],
  );

  const handleDeleteThread = useCallback(
    async (e: React.MouseEvent, thread: EnvironmentThreadShell) => {
      e.stopPropagation();

      // Optimistically hide the thread immediately
      setLocallyDeletedIds((prev) => {
        const next = new Set(prev);
        next.add(thread.id);
        return next;
      });

      // Remove from terminal registry
      removeTerminalThreadId(thread.id);

      // Find the next available non-deleted terminal thread
      const nextThread = terminalThreads.find(
        (t) => t.id !== thread.id && !locallyDeletedIds.has(t.id),
      );

      // Update terminalStore activeChatId if this was active
      if (terminalStore.getState().activeChatId === thread.id) {
        terminalStore.setActiveChatId(nextThread ? nextThread.id : null);
      }

      // If this was the active chat route, navigate to next thread or clean view
      if (activeRouteThreadId === thread.id) {
        if (nextThread) {
          void router.navigate({
            to: "/$environmentId/$threadId",
            params: buildThreadRouteParams(scopeThreadRef(nextThread.environmentId, nextThread.id)),
          });
        } else {
          void router.navigate({ to: "/" });
        }
      }

      // Delete the thread via backend/orchestration
      try {
        await deleteThread(scopeThreadRef(thread.environmentId, thread.id));
      } catch (err) {
        console.error("Failed to delete terminal thread:", err);
      }
    },
    [activeRouteThreadId, deleteThread, locallyDeletedIds, router, terminalThreads],
  );

  const handleCommitRename = useCallback(
    async (thread: EnvironmentThreadShell) => {
      const trimmed = editingTitle.trim();
      setEditingThreadId(null);
      if (!trimmed || trimmed === thread.title) return;
      await updateThreadMetadata({
        environmentId: thread.environmentId,
        input: { threadId: thread.id, title: trimmed },
      });
    },
    [editingTitle, updateThreadMetadata],
  );

  const handleClearAll = useCallback(async () => {
    if (terminalThreads.length === 0) return;
    if (window.confirm("Are you sure you want to clear all terminal chats?")) {
      const threadsToDelete = [...terminalThreads];

      // Optimistically hide all terminal threads immediately
      setLocallyDeletedIds((prev) => {
        const next = new Set(prev);
        for (const t of threadsToDelete) {
          next.add(t.id);
        }
        return next;
      });

      // Clear terminal store active chat ID
      terminalStore.setActiveChatId(null);

      // If any of the deleted threads was active in route, navigate to clean view
      if (threadsToDelete.some((t) => t.id === activeRouteThreadId)) {
        void router.navigate({ to: "/" });
      }

      for (const thread of threadsToDelete) {
        removeTerminalThreadId(thread.id);
        void (async () => {
          try {
            await deleteThread(scopeThreadRef(thread.environmentId, thread.id));
          } catch (err) {
            console.error("Failed to delete thread during clear all:", err);
          }
        })();
      }
    }
  }, [activeRouteThreadId, deleteThread, router, terminalThreads]);

  const handleOpenTerminal = useCallback(() => {
    terminalStore.setQuickBarOpen(true);
    terminalStore.setMobileActiveTab("terminal");
  }, []);

  return (
    <div className="border-b border-sidebar-border/30 dark:border-zinc-700/30">
      {/* Terminal Section Header */}
      <div className="flex items-center justify-between px-3 py-1.5 select-none hover:bg-sidebar-accent/30 transition-colors">
        <button
          type="button"
          onClick={toggleExpanded}
          className="flex items-center gap-1.5 cursor-pointer text-left text-xs font-semibold tracking-wide uppercase text-sidebar-muted-foreground/80 hover:text-foreground transition-colors group"
        >
          {isExpanded ? (
            <ChevronDown className="size-3 text-muted-foreground group-hover:text-foreground transition-transform" />
          ) : (
            <ChevronRight className="size-3 text-muted-foreground group-hover:text-foreground transition-transform" />
          )}
          <Terminal className="size-3.5 text-emerald-500" />
          <span>Terminal</span>
          {hasAnyWorking && (
            <CircleDashed className="size-3 text-emerald-400 animate-spin shrink-0" />
          )}
          {terminalThreads.length > 0 && (
            <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-emerald-500/10 text-emerald-400 font-medium normal-case font-mono">
              {terminalThreads.length}
            </span>
          )}
        </button>

        <div className="flex items-center gap-1">
          {/* More Actions Menu (•••) */}
          <Menu>
            <MenuTrigger
              render={
                <Button
                  size="icon-xs"
                  variant="ghost-muted"
                  aria-label="Terminal options"
                  className="cursor-pointer text-muted-foreground hover:text-foreground"
                >
                  <MoreVertical className="size-3.5" />
                </Button>
              }
            />
            <MenuPopup side="bottom" align="end" className="w-48">
              <MenuItem
                onClick={handleCreateNewChat}
                className="flex items-center gap-2 cursor-pointer"
              >
                <Plus className="size-3.5 text-emerald-500" />
                <span>New Terminal Chat</span>
              </MenuItem>
              <MenuItem
                onClick={handleOpenTerminal}
                className="flex items-center gap-2 cursor-pointer"
              >
                <Terminal className="size-3.5 text-emerald-400" />
                <span>Open Terminal</span>
              </MenuItem>
              {terminalThreads.length > 0 && (
                <>
                  <MenuSeparator />
                  <MenuItem
                    onClick={handleClearAll}
                    className="flex items-center gap-2 text-destructive focus:text-destructive cursor-pointer"
                  >
                    <Trash2 className="size-3.5" />
                    <span>Clear All Chats</span>
                  </MenuItem>
                </>
              )}
            </MenuPopup>
          </Menu>

          {/* Plus (+) Icon: Creates new terminal chat */}
          <Tooltip>
            <TooltipTrigger
              render={
                <Button
                  size="icon-xs"
                  variant="ghost-muted"
                  aria-label="New terminal chat"
                  data-testid="sidebar-new-terminal-chat-trigger"
                  onClick={handleCreateNewChat}
                  className="cursor-pointer text-muted-foreground hover:text-foreground"
                />
              }
            >
              <Plus className="size-3.5" />
            </TooltipTrigger>
            <TooltipPopup side="right">New terminal chat</TooltipPopup>
          </Tooltip>
        </div>
      </div>

      {/* Collapsible Terminal Chats List */}
      {isExpanded && (
        <div className="py-1 px-1.5 space-y-0.5">
          {terminalThreads.map((thread) => {
            const isActive = activeRouteThreadId === thread.id;
            const isWorking = isThreadWorking(thread);
            return (
              <div
                key={thread.id}
                onClick={() => handleSelectThread(thread)}
                className={cn(
                  "group relative flex items-center justify-between px-2.5 py-1.5 rounded-md text-xs cursor-pointer transition-colors",
                  isActive
                    ? "bg-emerald-500/10 text-emerald-400 font-medium border border-emerald-500/20 shadow-2xs"
                    : "text-muted-foreground hover:bg-sidebar-accent/50 hover:text-foreground border border-transparent",
                )}
              >
                <div className="flex items-center gap-1.5 min-w-0 flex-1 pr-1">
                  <Terminal
                    className={cn("size-3 shrink-0", isActive ? "text-emerald-400" : "opacity-60")}
                  />
                  <div className="min-w-0 flex-1">
                    {editingThreadId === thread.id ? (
                      <input
                        type="text"
                        autoFocus
                        value={editingTitle}
                        onClick={(e) => e.stopPropagation()}
                        onChange={(e) => setEditingTitle(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            e.preventDefault();
                            e.stopPropagation();
                            void handleCommitRename(thread);
                          } else if (e.key === "Escape") {
                            e.stopPropagation();
                            setEditingThreadId(null);
                          }
                        }}
                        onBlur={() => {
                          void handleCommitRename(thread);
                        }}
                        className="text-xs bg-background border border-emerald-500/50 rounded px-1 py-0.5 outline-hidden text-foreground w-full"
                      />
                    ) : (
                      <>
                        <div className="flex items-center gap-1.5 min-w-0">
                          <p className="truncate leading-tight text-xs flex-1">{thread.title}</p>
                          {isWorking && (
                            <span className="inline-flex items-center gap-1 text-[10px] text-emerald-400 font-medium shrink-0 animate-pulse">
                              <CircleDashed className="size-2.5 animate-spin text-emerald-400" />
                              <span>Working</span>
                            </span>
                          )}
                        </div>
                        <span className="text-[10px] opacity-60 block truncate">
                          {isWorking ? (
                            <span className="text-emerald-400/90 font-medium">Executing...</span>
                          ) : (
                            new Date(thread.createdAt).toLocaleDateString([], {
                              month: "short",
                              day: "numeric",
                              hour: "2-digit",
                              minute: "2-digit",
                            })
                          )}
                        </span>
                      </>
                    )}
                  </div>
                </div>

                {/* Compact Action Buttons: Edit (Pencil) & Delete (Trash) */}
                <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setEditingThreadId(thread.id);
                      setEditingTitle(thread.title);
                    }}
                    className="p-0.5 rounded bg-transparent hover:text-emerald-400 text-muted-foreground/80 drop-shadow-xs transition-colors cursor-pointer"
                    title="Edit Title"
                  >
                    <Pencil className="size-2.5" />
                  </button>
                  <button
                    type="button"
                    onClick={(e) => void handleDeleteThread(e, thread)}
                    className="p-0.5 rounded bg-transparent hover:text-destructive text-muted-foreground/80 drop-shadow-xs transition-colors cursor-pointer"
                    title="Delete Chat"
                  >
                    <Trash2 className="size-2.5" />
                  </button>
                </div>
              </div>
            );
          })}

          {terminalThreads.length === 0 && (
            <div
              onClick={handleCreateNewChat}
              className="px-3 py-2 text-center text-secondary-label text-xs hover:text-foreground cursor-pointer rounded-md transition-colors"
            >
              No terminal chats yet. Click <span className="font-semibold text-emerald-400">+</span>{" "}
              to start.
            </div>
          )}
        </div>
      )}
    </div>
  );
}
