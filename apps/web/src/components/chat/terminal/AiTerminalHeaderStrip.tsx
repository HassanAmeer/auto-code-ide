import { memo, useRef, useState, useEffect } from "react";
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
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Close dropdown on outside click
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsDropdownOpen(false);
      }
    }
    if (isDropdownOpen) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [isDropdownOpen]);

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
    setIsDropdownOpen(false);
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
    setIsDropdownOpen(false);
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
          "w-full bg-zinc-950/90 border-b border-zinc-800/80 backdrop-blur-md px-2 py-1 select-none flex items-center gap-1.5 transition-all text-2xs z-30",
          className,
        )}
      >
        {/* Left Scroll Arrow */}
        <button
          type="button"
          onClick={scrollLeft}
          title="Scroll Left"
          className="shrink-0 p-1 rounded-[5px] text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800/60 transition-colors cursor-pointer"
        >
          <ChevronLeft className="size-3.5" />
        </button>

        {/* Scrollable Patti Container */}
        <div
          ref={scrollContainerRef}
          className="flex-1 flex items-center gap-2 overflow-x-auto py-0.5 px-0.5 scroll-smooth [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden"
        >
          {/* 1. Terminal Chats Dropdown */}
          <div className="relative shrink-0" ref={dropdownRef}>
            <button
              type="button"
              onClick={() => setIsDropdownOpen(!isDropdownOpen)}
              className={cn(
                "flex items-center gap-1.5 px-2.5 py-1 rounded-[5px] text-3xs font-medium border transition-all cursor-pointer shadow-xs",
                isDropdownOpen
                  ? "bg-emerald-500/20 text-emerald-300 border-emerald-500/50 ring-1 ring-emerald-500/30"
                  : "bg-emerald-500/10 hover:bg-emerald-500/15 text-emerald-400 border-emerald-500/30",
              )}
              title="View and manage Terminal & Deploy chats"
            >
              <Terminal className="size-3 text-emerald-400 shrink-0" />
              <span className="font-semibold truncate max-w-[140px] sm:max-w-[180px]">
                {activeChat?.title || "Terminal Chats"}
              </span>
              <span className="px-1.5 py-0.2 rounded-[5px] bg-emerald-500/20 text-emerald-300 font-mono text-4xs">
                {store.terminalChats.length}
              </span>
              <ChevronDown
                className={cn(
                  "size-3 text-emerald-400 transition-transform duration-200",
                  isDropdownOpen && "rotate-180",
                )}
              />
            </button>

            {/* Dropdown Menu */}
            {isDropdownOpen && (
              <div className="absolute top-full left-0 mt-1.5 w-72 sm:w-80 rounded-[5px] bg-zinc-950/95 border border-zinc-800/80 shadow-2xl p-2 z-50 text-foreground animate-in fade-in-50 slide-in-from-top-1 duration-150 backdrop-blur-md">
                {/* Header with New Chat Button */}
                <div className="flex items-center justify-between px-2 py-1.5 border-b border-zinc-800/60 pb-2 mb-1.5">
                  <div className="flex items-center gap-1.5 text-xs font-semibold">
                    <Sparkles className="size-3.5 text-emerald-400" />
                    <span>Terminal / Deploy Chats</span>
                  </div>
                  <button
                    type="button"
                    onClick={handleCreateNewChat}
                    className="flex items-center gap-1 px-2 py-1 rounded-[5px] bg-emerald-500 hover:bg-emerald-600 text-white font-medium text-3xs transition-all shadow-xs cursor-pointer"
                  >
                    <Plus className="size-3" />
                    <span>New Chat</span>
                  </button>
                </div>

                {/* List of Chats */}
                <div className="max-h-60 overflow-y-auto space-y-1 p-0.5">
                  {store.terminalChats.length === 0 ? (
                    <div className="py-4 text-center text-3xs text-muted-foreground italic">
                      No terminal chats yet. Click &quot;New Chat&quot; to begin.
                    </div>
                  ) : (
                    store.terminalChats.map((chat) => {
                      const isCurrent = store.activeChatId === chat.id;
                      return (
                        <div
                          key={chat.id}
                          onClick={() => handleSelectChat(chat.id)}
                          className={cn(
                            "flex items-center justify-between gap-2 p-2 rounded-[5px] transition-all cursor-pointer group text-left",
                            isCurrent
                              ? "bg-emerald-500/15 border border-emerald-500/30 text-emerald-200 font-medium"
                              : "hover:bg-zinc-900/60 text-muted-foreground hover:text-foreground border border-transparent",
                          )}
                        >
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-1.5">
                              <Terminal className="size-3 shrink-0 text-emerald-400" />
                              <span className="truncate text-3xs font-medium text-foreground">
                                {chat.title}
                              </span>
                            </div>
                            <div className="flex items-center gap-2 mt-0.5 text-4xs text-muted-foreground">
                              {chat.projectName && (
                                <span className="truncate max-w-[90px]">{chat.projectName}</span>
                              )}
                              {chat.sshKeyName && (
                                <span className="truncate max-w-[90px] text-sky-400">
                                  {chat.sshKeyName}
                                </span>
                              )}
                              <span className="shrink-0 flex items-center gap-0.5 opacity-70">
                                <Clock className="size-2.5" />
                                {new Date(chat.createdAt).toLocaleTimeString([], {
                                  hour: "2-digit",
                                  minute: "2-digit",
                                })}
                              </span>
                            </div>
                          </div>

                          <div className="flex items-center gap-1 shrink-0">
                            {isCurrent && <Check className="size-3 text-emerald-400" />}
                            <button
                              type="button"
                              onClick={(e) => handleDeleteChat(e, chat.id)}
                              title="Delete chat"
                              className="p-1 rounded-[5px] text-muted-foreground/60 hover:text-destructive hover:bg-destructive/10 opacity-0 group-hover:opacity-100 transition-all cursor-pointer"
                            >
                              <Trash2 className="size-3" />
                            </button>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Divider */}
          <div className="w-px h-4 bg-zinc-800/80 shrink-0" />

          {/* 2. Projects List */}
          <div className="flex items-center gap-1 px-1.5 py-0.5 rounded-[5px] bg-emerald-500/10 text-emerald-400 font-semibold text-3xs shrink-0 border border-emerald-500/20">
            <Folder className="size-3" />
            <span>Projects:</span>
          </div>

          {projects.length === 0 ? (
            <span className="text-3xs text-muted-foreground italic shrink-0 px-1">
              (No projects yet)
            </span>
          ) : (
            projects.map((project) => {
              const isSelected =
                store.selectedProjectId === project.id ||
                (!store.selectedProjectId && activeProject?.id === project.id);
              return (
                <button
                  key={project.id}
                  type="button"
                  onClick={() =>
                    terminalStore.setSelectedProject(
                      project.id,
                      project.title,
                      project.workspaceRoot,
                    )
                  }
                  title={`Project: ${project.title}\nPath: ${project.workspaceRoot}`}
                  className={cn(
                    "flex items-center gap-1.5 px-2.5 py-1 rounded-[5px] text-3xs font-medium shrink-0 transition-all cursor-pointer border",
                    isSelected
                      ? "bg-emerald-500/20 text-emerald-300 border-emerald-500/50 shadow-xs ring-1 ring-emerald-500/20 font-semibold"
                      : "bg-zinc-900/60 hover:bg-zinc-800/70 text-zinc-400 hover:text-zinc-200 border-zinc-800/60",
                  )}
                >
                  <Folder className="size-3 text-emerald-400 shrink-0" />
                  <span className="truncate max-w-[120px] sm:max-w-[160px]">{project.title}</span>
                  {isSelected && <Check className="size-2.5 text-emerald-400 shrink-0" />}
                </button>
              );
            })
          )}

          {/* Divider */}
          <div className="w-px h-4 bg-zinc-800/80 shrink-0" />

          {/* 3. SSH Servers List */}
          <div className="flex items-center gap-1 px-1.5 py-0.5 rounded-[5px] bg-sky-500/10 text-sky-400 font-semibold text-3xs shrink-0 border border-sky-500/20">
            <Server className="size-3" />
            <span>SSH Servers:</span>
          </div>

          {store.accessKeys
            .filter((k) => k.type === "ssh" || k.host)
            .map((key) => {
              const isSelected =
                store.selectedKeyId === key.id ||
                (!store.selectedKeyId && key.enabled && activeSshKey?.id === key.id);
              return (
                <div
                  key={key.id}
                  className={cn(
                    "flex items-center gap-1 px-2 py-0.5 rounded-[5px] text-3xs font-medium shrink-0 transition-all border group",
                    isSelected
                      ? "bg-sky-500/20 text-sky-200 border-sky-500/50 shadow-xs ring-1 ring-sky-500/25 font-semibold"
                      : "bg-zinc-900/60 hover:bg-zinc-800/70 text-zinc-400 hover:text-zinc-200 border-zinc-800/60",
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
                      "flex items-center justify-center size-3.5 rounded-[3px] border transition-colors cursor-pointer",
                      isSelected
                        ? "bg-sky-500 text-white border-sky-400"
                        : "border-zinc-600 hover:border-sky-400 bg-zinc-950/60 text-transparent hover:text-zinc-400",
                    )}
                  >
                    <Check className="size-2.5" />
                  </button>

                  {/* Center: Key Name & Host Info */}
                  <button
                    type="button"
                    onClick={() => terminalStore.setSelectedKey(key.id)}
                    title={`SSH Server: ${key.name}\nHost: ${key.user || "root"}@${key.host}:${key.port || 22}\nNotes: ${key.notes || "None"}`}
                    className="flex items-center gap-1 cursor-pointer text-left"
                  >
                    <Key className="size-2.5 text-sky-400 shrink-0" />
                    <span className="truncate max-w-[100px] sm:max-w-[140px]">{key.name}</span>
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
                    className="p-1 rounded-[3px] text-zinc-400 hover:text-sky-300 hover:bg-sky-500/20 transition-all cursor-pointer ml-0.5"
                  >
                    <Pencil className="size-2.5" />
                  </button>
                </div>
              );
            })}

          {/* Add / Manage SSH Button (Opens Sheet in Add Mode) */}
          <button
            type="button"
            onClick={() => terminalStore.openSshSheetWithKey(null)}
            title="Add New Server Credentials / SSH Key"
            className="flex items-center gap-1 px-2 py-1 rounded-[5px] bg-sky-500/15 hover:bg-sky-500/25 text-sky-300 border border-sky-500/40 text-3xs font-medium shrink-0 cursor-pointer transition-all shadow-xs"
          >
            <Plus className="size-3" />
            <span>Add Server</span>
          </button>
        </div>

        {/* Right Scroll Arrow */}
        <button
          type="button"
          onClick={scrollRight}
          title="Scroll Right"
          className="shrink-0 p-1 rounded-[5px] text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800/60 transition-colors cursor-pointer"
        >
          <ChevronRight className="size-3.5" />
        </button>
      </div>

      {/* 90% Width SSH Keys Management Sheet */}
      <SshKeysSheet />
    </>
  );
});
