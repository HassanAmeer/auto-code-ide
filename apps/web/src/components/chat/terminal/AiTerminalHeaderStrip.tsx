import { memo, useRef, useState, useEffect, useMemo } from "react";
import {
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  Folder,
  Server,
  Key,
  Plus,
  Trash2,
  Check,
  Terminal,
  Clock,
  Sparkles,
  Pencil,
} from "lucide-react";
import { cn } from "../../../lib/utils";
import { useTerminalStore, terminalStore } from "./terminalStore";
import { useProjects } from "../../../state/entities";
import { SshKeysSheet } from "./SshKeysSheet";
import { TerminalChatsSheet } from "./TerminalChatsSheet";
import type { EnvironmentProject } from "@t3tools/client-runtime/state/shell";

export interface AiTerminalHeaderStripProps {
  activeProject?: EnvironmentProject | null;
  onNewTerminalThread?: () => void;
  className?: string;
}

export const AiTerminalHeaderStrip = memo(function AiTerminalHeaderStrip({
  activeProject,
  onNewTerminalThread,
  className = "",
}: AiTerminalHeaderStripProps) {
  const store = useTerminalStore();
  const projects = useProjects();
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  // Deduplicate projects by root path or title or id so no duplicates (e.g. t3 t3, te te) appear
  const uniqueProjects = useMemo(() => {
    const seen = new Set<string>();
    return projects.filter((p) => {
      const root = p.workspaceRoot?.trim().toLowerCase();
      const title = p.title?.trim().toLowerCase();
      const key = root || title || p.id;
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }, [projects]);

  // Selected project count and toggle handler
  const selectedProjectCount = store.selectedProjectId ? 1 : 0;
  const handleToggleProject = (project: EnvironmentProject) => {
    if (store.selectedProjectId === project.id) {
      terminalStore.setSelectedProject(null, null, undefined);
    } else {
      terminalStore.setSelectedProject(project.id, project.title, project.workspaceRoot);
    }
  };

  // Selected SSH Server count
  const selectedSshCount = store.selectedKeyId ? 1 : 0;

  // Scroll controls
  const scrollLeft = () => {
    if (scrollContainerRef.current) {
      scrollContainerRef.current.scrollBy({ left: -240, behavior: "smooth" });
    }
  };

  const scrollRight = () => {
    if (scrollContainerRef.current) {
      scrollContainerRef.current.scrollBy({ left: 240, behavior: "smooth" });
    }
  };

  // Find active chat session
  const activeChat = store.terminalChats.find((c) => c.id === store.activeChatId);

  // Active SSH Key
  const activeSshKey = store.selectedKeyId
    ? store.accessKeys.find((k) => k.id === store.selectedKeyId)
    : store.accessKeys.find((k) => (k.type === "ssh" || k.host) && k.enabled);

  // Create new terminal chat
  const handleCreateNewChat = () => {
    const projName = activeProject?.title || store.selectedProjectTitle || "Auto Deploy";
    const keyName = activeSshKey?.name || "Server";
    const newChat = terminalStore.createTerminalChat({
      title: `${projName} (${keyName})`,
      projectId: activeProject?.id || store.selectedProjectId,
      projectName: projName,
      sshKeyId: activeSshKey?.id,
      sshKeyName: keyName,
    });
    terminalStore.setActiveChatId(newChat.id);

    // Call external handler if provided to create a fresh thread
    if (onNewTerminalThread) {
      onNewTerminalThread();
    }
  };

  // Switch chat
  const handleSelectChat = (chatId: string) => {
    terminalStore.setActiveChatId(chatId);
  };

  // Delete chat
  const handleDeleteChat = (e: React.MouseEvent, chatId: string) => {
    e.stopPropagation();
    terminalStore.deleteTerminalChat(chatId);
  };

  return (
    <>
      <div
        className={cn(
          "w-full bg-[#121214]/90 border-b border-white/[0.06] backdrop-blur-xl px-2 py-0.5 select-none flex items-center gap-1 transition-all text-2xs z-20 font-sans",
          className,
        )}
      >
        {/* Left Scroll Arrow */}
        <button
          type="button"
          onClick={scrollLeft}
          title="Scroll Left"
          className="shrink-0 p-1 rounded-[5px] text-zinc-400 hover:text-zinc-100 hover:bg-white/[0.06] transition-colors cursor-pointer"
        >
          <ChevronLeft className="size-3" />
        </button>

        {/* Scrollable Patti Container */}
        <div
          ref={scrollContainerRef}
          onWheel={(e) => {
            if (e.deltaY !== 0 && scrollContainerRef.current) {
              scrollContainerRef.current.scrollLeft += e.deltaY;
            }
          }}
          className="flex-1 flex items-center gap-1.5 overflow-x-auto py-0.5 px-0.5 scroll-smooth [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden"
        >
          {/* 1. New Terminal Chat Button */}
          <button
            type="button"
            onClick={handleCreateNewChat}
            className="flex items-center gap-1 px-2 py-0.5 rounded-[5px] bg-emerald-500/15 hover:bg-emerald-500/25 text-emerald-400 border border-emerald-500/30 text-3xs font-medium shrink-0 cursor-pointer shadow-xs transition-all active:scale-[0.98]"
            title="Start a Fresh Clean Terminal Chat"
          >
            <Plus className="size-2.5" />
            <span className="font-semibold text-4xs">New Chat</span>
          </button>

          {/* 2. Terminal Chats History Button */}
          <button
            type="button"
            onClick={() => terminalStore.toggleChatsSheet()}
            className={cn(
              "flex items-center gap-1 px-2 py-0.5 rounded-[5px] text-3xs font-medium border transition-all cursor-pointer shadow-xs shrink-0 active:scale-[0.98]",
              store.isChatsSheetOpen
                ? "bg-[#252528] text-zinc-100 border-white/[0.15]"
                : "bg-[#18181b]/80 hover:bg-[#222225] text-zinc-300 border-white/[0.08]",
            )}
            title="Open Terminal History & Sessions Sheet"
          >
            <Clock className="size-2.5 text-emerald-400 shrink-0" />
            <span className="font-semibold text-4xs truncate max-w-[110px] sm:max-w-[150px]">
              {activeChat?.title || "History"}
            </span>
            <span className="px-1 py-0.2 rounded-[4px] bg-white/[0.06] text-zinc-400 font-mono text-4xs border border-white/[0.06]">
              {store.terminalChats.length}
            </span>
          </button>

          {/* Divider */}
          <div className="w-px h-3.5 bg-white/[0.08] shrink-0" />

          {/* 3. Projects Section */}
          <span className="text-zinc-500 text-4xs font-medium shrink-0">Projects:</span>

          {uniqueProjects.length === 0 ? (
            <span className="text-4xs text-zinc-500 italic shrink-0 px-1">(No projects)</span>
          ) : (
            uniqueProjects.map((project: EnvironmentProject) => {
              const isSelected = store.selectedProjectId === project.id;
              return (
                <button
                  key={project.id}
                  type="button"
                  onClick={() => handleToggleProject(project)}
                  title={`Project: ${project.title}\nPath: ${project.workspaceRoot}\nClick to ${isSelected ? "unselect" : "select"}`}
                  className={cn(
                    "flex items-center gap-1 px-2 py-0.5 rounded-[5px] text-4xs font-medium shrink-0 transition-all cursor-pointer border active:scale-[0.98]",
                    isSelected
                      ? "bg-emerald-500/20 text-emerald-300 border-emerald-500/50 shadow-xs font-semibold"
                      : "bg-[#18181b]/70 hover:bg-[#222225] text-zinc-400 hover:text-zinc-200 border-white/[0.07]",
                  )}
                >
                  <Folder className="size-2.5 text-emerald-400 shrink-0" />
                  <span className="truncate max-w-[110px] sm:max-w-[150px]">{project.title}</span>
                  {isSelected && <Check className="size-2 text-emerald-400 shrink-0" />}
                </button>
              );
            })
          )}

          {/* Divider */}
          <div className="w-px h-3.5 bg-white/[0.08] shrink-0" />

          {/* 4. SSH Servers Section */}
          <span className="text-zinc-500 text-4xs font-medium shrink-0">SSH:</span>

          {/* Icon-only outlined Plus button right after "SSH:" */}
          <button
            type="button"
            onClick={() => terminalStore.openSshSheetWithKey(null)}
            title="Add New Server Credentials / SSH Key"
            className="flex items-center justify-center size-5 rounded-[4px] border border-white/[0.12] hover:border-sky-400/50 bg-[#18181b]/70 hover:bg-sky-500/15 text-zinc-400 hover:text-sky-300 transition-all cursor-pointer shrink-0 shadow-xs active:scale-[0.96]"
          >
            <Plus className="size-2.5" />
          </button>

          {store.accessKeys
            .filter((k) => k.type === "ssh" || k.host)
            .map((key) => {
              const isSelected = store.selectedKeyId === key.id;
              return (
                <div
                  key={key.id}
                  className={cn(
                    "flex items-center gap-1 px-1.5 py-0.5 rounded-[5px] text-4xs font-medium shrink-0 transition-all border group",
                    isSelected
                      ? "bg-sky-500/20 text-sky-200 border-sky-500/50 shadow-xs font-semibold"
                      : "bg-[#18181b]/70 hover:bg-[#222225] text-zinc-400 hover:text-zinc-200 border-white/[0.07]",
                  )}
                >
                  {/* Left Side: Checkmark Toggle Button */}
                  <button
                    type="button"
                    onClick={() => terminalStore.setSelectedKey(key.id)}
                    title={
                      isSelected
                        ? "Selected for AI operations (Click to unselect)"
                        : "Click to select this server for AI operations"
                    }
                    className={cn(
                      "flex items-center justify-center size-3 rounded-[3px] border transition-colors cursor-pointer",
                      isSelected
                        ? "bg-sky-500 text-white border-sky-400"
                        : "border-zinc-600 hover:border-sky-400 bg-zinc-950/60 text-transparent hover:text-zinc-400",
                    )}
                  >
                    <Check className="size-2" />
                  </button>

                  {/* Center: Key Name & Host Info */}
                  <button
                    type="button"
                    onClick={() => terminalStore.setSelectedKey(key.id)}
                    title={`SSH Server: ${key.name}\nHost: ${key.user || "root"}@${key.host}:${key.port || 22}\nNotes: ${key.notes || "None"}`}
                    className="flex items-center gap-1 cursor-pointer text-left"
                  >
                    <Key className="size-2 text-sky-400 shrink-0" />
                    <span className="truncate max-w-[90px] sm:max-w-[130px]">{key.name}</span>
                    {key.host && (
                      <span className="text-4xs opacity-70 font-mono hidden md:inline">
                        ({key.user || "root"}@{key.host})
                      </span>
                    )}
                  </button>

                  {/* Right Side: Edit Icon Button */}
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      terminalStore.openSshSheetWithKey(key.id);
                    }}
                    title={`Edit credentials & details for ${key.name}`}
                    className="p-0.5 rounded-[3px] text-zinc-400 hover:text-sky-300 hover:bg-sky-500/20 transition-all cursor-pointer ml-0.5"
                  >
                    <Pencil className="size-2" />
                  </button>
                </div>
              );
            })}
        </div>

        {/* Right Scroll Arrow */}
        <button
          type="button"
          onClick={scrollRight}
          title="Scroll Right"
          className="shrink-0 p-1 rounded-[5px] text-zinc-400 hover:text-zinc-100 hover:bg-white/[0.06] transition-colors cursor-pointer"
        >
          <ChevronRight className="size-3" />
        </button>
      </div>

      {/* 90% Width SSH Keys Management Sheet */}
      <SshKeysSheet />

      {/* 90% Width Terminal Chat History Sheet */}
      <TerminalChatsSheet
        activeProject={activeProject ?? null}
        {...(onNewTerminalThread ? { onNewTerminalThread } : {})}
      />
    </>
  );
});
