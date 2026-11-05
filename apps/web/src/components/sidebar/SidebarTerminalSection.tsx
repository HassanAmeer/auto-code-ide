import { useState, useCallback } from "react";
import { useNavigate, useLocation } from "@tanstack/react-router";
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
import { Button } from "~/components/ui/button";
import { Tooltip, TooltipTrigger, TooltipPopup } from "~/components/ui/tooltip";
import { Menu, MenuTrigger, MenuPopup, MenuItem, MenuSeparator } from "~/components/ui/menu";

export function SidebarTerminalSection() {
  const navigate = useNavigate();
  const location = useLocation();
  const store = useTerminalStore();

  const [editingChatId, setEditingChatId] = useState<string | null>(null);
  const [editingTitle, setEditingTitle] = useState("");

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

  const handleCreateNewChat = useCallback(
    (e?: React.MouseEvent) => {
      e?.stopPropagation();
      const projName = store.selectedProjectTitle || "Workspace Shell";
      const activeSshKey = store.selectedKeyId
        ? store.accessKeys.find((k) => k.id === store.selectedKeyId)
        : store.accessKeys.find((k) => (k.type === "ssh" || k.host) && k.enabled);
      const keyName = activeSshKey?.name || "Local";

      const newChat = terminalStore.createTerminalChat({
        title: `${projName} (${keyName})`,
        projectId: store.selectedProjectId,
        projectName: store.selectedProjectTitle || undefined,
        sshKeyId: activeSshKey?.id,
        sshKeyName: keyName,
      });

      terminalStore.setActiveChatId(newChat.id);
      terminalStore.setQuickBarOpen(true);
      terminalStore.setMobileActiveTab("terminal");

      if (location.pathname.startsWith("/bot") || location.pathname.startsWith("/settings")) {
        void navigate({ to: "/" });
      }
    },
    [
      location.pathname,
      navigate,
      store.accessKeys,
      store.selectedKeyId,
      store.selectedProjectId,
      store.selectedProjectTitle,
    ],
  );

  const handleSelectChat = useCallback(
    (chatId: string) => {
      terminalStore.setActiveChatId(chatId);
      terminalStore.setQuickBarOpen(true);
      terminalStore.setMobileActiveTab("terminal");

      if (location.pathname.startsWith("/bot") || location.pathname.startsWith("/settings")) {
        void navigate({ to: "/" });
      }
    },
    [location.pathname, navigate],
  );

  const handleDeleteChat = useCallback((e: React.MouseEvent, chatId: string) => {
    e.stopPropagation();
    terminalStore.deleteTerminalChat(chatId);
  }, []);

  const handleClearAll = useCallback(() => {
    if (window.confirm("Are you sure you want to clear all terminal chats?")) {
      for (const chat of [...store.terminalChats]) {
        terminalStore.deleteTerminalChat(chat.id);
      }
    }
  }, [store.terminalChats]);

  const handleOpenTerminal = useCallback(() => {
    terminalStore.setQuickBarOpen(true);
    terminalStore.setMobileActiveTab("terminal");
    if (location.pathname.startsWith("/bot") || location.pathname.startsWith("/settings")) {
      void navigate({ to: "/" });
    }
  }, [location.pathname, navigate]);

  return (
    <div className="border-t border-sidebar-border/30 dark:border-zinc-700/30">
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
          {store.isAnyTerminalRunning && (
            <CircleDashed className="size-3 text-emerald-400 animate-spin shrink-0" />
          )}
          {store.terminalChats.length > 0 && (
            <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-emerald-500/10 text-emerald-400 font-medium normal-case font-mono">
              {store.terminalChats.length}
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
              {store.terminalChats.length > 0 && (
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
          {store.terminalChats.map((chat) => {
            const isActive = store.isQuickBarOpen && store.activeChatId === chat.id;
            const isRunning = Boolean(store.runningChatIds?.[chat.id]);
            return (
              <div
                key={chat.id}
                onClick={() => handleSelectChat(chat.id)}
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
                    {editingChatId === chat.id ? (
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
                            if (editingTitle.trim()) {
                              terminalStore.updateTerminalChatTitle(chat.id, editingTitle.trim());
                            }
                            setEditingChatId(null);
                          } else if (e.key === "Escape") {
                            e.stopPropagation();
                            setEditingChatId(null);
                          }
                        }}
                        onBlur={() => {
                          if (editingTitle.trim()) {
                            terminalStore.updateTerminalChatTitle(chat.id, editingTitle.trim());
                          }
                          setEditingChatId(null);
                        }}
                        className="text-xs bg-background border border-emerald-500/50 rounded px-1 py-0.5 outline-hidden text-foreground w-full"
                      />
                    ) : (
                      <>
                        <div className="flex items-center gap-1.5 min-w-0">
                          <p className="truncate leading-tight text-xs flex-1">{chat.title}</p>
                          {isRunning && (
                            <span className="inline-flex items-center gap-1 text-[10px] text-emerald-400 font-medium shrink-0 animate-pulse">
                              <CircleDashed className="size-2.5 animate-spin text-emerald-400" />
                              <span>Working</span>
                            </span>
                          )}
                        </div>
                        <span className="text-[10px] opacity-60 block truncate">
                          {isRunning ? (
                            <span className="text-emerald-400/90 font-medium">Executing...</span>
                          ) : (
                            <>
                              {new Date(chat.createdAt).toLocaleDateString([], {
                                month: "short",
                                day: "numeric",
                                hour: "2-digit",
                                minute: "2-digit",
                              })}
                              {chat.projectName ? ` • ${chat.projectName}` : ""}
                            </>
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
                      setEditingChatId(chat.id);
                      setEditingTitle(chat.title);
                    }}
                    className="p-0.5 rounded bg-transparent hover:text-emerald-400 text-muted-foreground/80 drop-shadow-xs transition-colors cursor-pointer"
                    title="Edit Title"
                  >
                    <Pencil className="size-2.5" />
                  </button>
                  <button
                    type="button"
                    onClick={(e) => handleDeleteChat(e, chat.id)}
                    className="p-0.5 rounded bg-transparent hover:text-destructive text-muted-foreground/80 drop-shadow-xs transition-colors cursor-pointer"
                    title="Delete Chat"
                  >
                    <Trash2 className="size-2.5" />
                  </button>
                </div>
              </div>
            );
          })}

          {store.terminalChats.length === 0 && (
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
