import { useState, useCallback, useMemo } from "react";
import { useNavigate, useLocation } from "@tanstack/react-router";
import {
  Bot,
  ChevronDown,
  ChevronRight,
  MoreHorizontal,
  Plus,
  Trash2,
  MessageSquare,
  Sparkles,
} from "lucide-react";
import { cn } from "~/lib/utils";
import {
  useCallSessions,
  createNewCallSession,
  deleteCallSession,
  clearAllCallSessions,
  type CallAssistantSession,
} from "~/lib/callAssistantStore";
import { Button } from "~/components/ui/button";
import { Tooltip, TooltipTrigger, TooltipPopup } from "~/components/ui/tooltip";
import { Menu, MenuTrigger, MenuPopup, MenuItem, MenuSeparator } from "~/components/ui/menu";

export function SidebarBotSection() {
  const navigate = useNavigate();
  const location = useLocation();
  const { sessions, activeSessionId, setActiveSessionId } = useCallSessions();

  const [isExpanded, setIsExpanded] = useState(() => {
    try {
      const saved = localStorage.getItem("sidebar_bot_section_expanded");
      return saved !== null ? saved === "true" : true;
    } catch {
      return true;
    }
  });

  const toggleExpanded = useCallback(() => {
    setIsExpanded((prev) => {
      const next = !prev;
      try {
        localStorage.setItem("sidebar_bot_section_expanded", String(next));
      } catch {}
      return next;
    });
  }, []);

  const handleCreateNewChat = useCallback(
    (e?: React.MouseEvent) => {
      e?.stopPropagation();
      const newSession = createNewCallSession();
      setActiveSessionId(newSession.id);
      void navigate({ to: "/call-assistant" });
    },
    [navigate, setActiveSessionId],
  );

  const handleOpenSession = useCallback(
    (sessionId: string) => {
      setActiveSessionId(sessionId);
      void navigate({ to: "/call-assistant" });
    },
    [navigate, setActiveSessionId],
  );

  const handleDeleteSession = useCallback((e: React.MouseEvent, sessionId: string) => {
    e.stopPropagation();
    deleteCallSession(sessionId);
  }, []);

  const handleClearAll = useCallback(() => {
    if (window.confirm("Are you sure you want to clear all bot chats?")) {
      clearAllCallSessions();
    }
  }, []);

  const isCallAssistantRoute = location.pathname.startsWith("/call-assistant");

  return (
    <div className="border-b border-sidebar-border/30 dark:border-zinc-700/30">
      {/* Bot Section Header */}
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
          <Bot className="size-3.5 text-primary" />
          <span>Bot</span>
          {sessions.length > 0 && (
            <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-primary/10 text-primary font-medium normal-case">
              {sessions.length}
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
                  aria-label="Bot options"
                  className="cursor-pointer text-muted-foreground hover:text-foreground"
                >
                  <MoreHorizontal className="size-3.5" />
                </Button>
              }
            />
            <MenuPopup side="bottom" align="end" className="w-48">
              <MenuItem
                onClick={handleCreateNewChat}
                className="flex items-center gap-2 cursor-pointer"
              >
                <Plus className="size-3.5 text-primary" />
                <span>New Bot Chat</span>
              </MenuItem>
              <MenuItem
                onClick={() => void navigate({ to: "/call-assistant" })}
                className="flex items-center gap-2 cursor-pointer"
              >
                <Sparkles className="size-3.5 text-amber-400" />
                <span>Open Assistant</span>
              </MenuItem>
              {sessions.length > 0 && (
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

          {/* Plus (+) Icon: Creates new chat specifically for the Bot */}
          <Tooltip>
            <TooltipTrigger
              render={
                <Button
                  size="icon-xs"
                  variant="ghost-muted"
                  aria-label="New bot chat"
                  data-testid="sidebar-new-bot-chat-trigger"
                  onClick={handleCreateNewChat}
                  className="cursor-pointer text-muted-foreground hover:text-foreground"
                />
              }
            >
              <Plus className="size-3.5" />
            </TooltipTrigger>
            <TooltipPopup side="right">New bot chat</TooltipPopup>
          </Tooltip>
        </div>
      </div>

      {/* Collapsible Bot Chats List */}
      {isExpanded && (
        <div className="py-1 px-1.5 space-y-0.5">
          {sessions.map((session) => {
            const isActive = isCallAssistantRoute && activeSessionId === session.id;
            return (
              <div
                key={session.id}
                onClick={() => handleOpenSession(session.id)}
                className={cn(
                  "group relative flex items-center justify-between px-2.5 py-1.5 rounded-md text-xs cursor-pointer transition-colors",
                  isActive
                    ? "bg-primary/10 text-primary font-medium border border-primary/20 shadow-2xs"
                    : "text-muted-foreground hover:bg-sidebar-accent/50 hover:text-foreground border border-transparent",
                )}
              >
                <div className="flex items-center gap-2 min-w-0 flex-1 pr-1">
                  <MessageSquare
                    className={cn("size-3.5 shrink-0", isActive ? "text-primary" : "opacity-60")}
                  />
                  <div className="min-w-0 flex-1">
                    <p className="truncate leading-tight text-xs">{session.title}</p>
                    <span className="text-[10px] opacity-60 block truncate">
                      {new Date(session.updatedAt || session.createdAt).toLocaleDateString([], {
                        month: "short",
                        day: "numeric",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </span>
                  </div>
                </div>

                {/* Delete button on hover */}
                <button
                  type="button"
                  onClick={(e) => handleDeleteSession(e, session.id)}
                  className="opacity-0 group-hover:opacity-100 p-1 rounded hover:text-destructive hover:bg-destructive/10 transition-opacity cursor-pointer shrink-0"
                  title="Delete chat"
                >
                  <Trash2 className="size-3" />
                </button>
              </div>
            );
          })}

          {sessions.length === 0 && (
            <div
              onClick={handleCreateNewChat}
              className="px-3 py-2 text-center text-secondary-label text-xs hover:text-foreground cursor-pointer rounded-md transition-colors"
            >
              No bot chats yet. Click <span className="font-semibold text-primary">+</span> to
              start.
            </div>
          )}
        </div>
      )}
    </div>
  );
}
