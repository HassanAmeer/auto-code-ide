import { memo, useState, useEffect, useMemo } from "react";
import {
  X,
  Plus,
  Trash2,
  Terminal,
  Clock,
  Search,
  Sparkles,
  Server,
  Folder,
  Check,
} from "lucide-react";
import { useTerminalStore, terminalStore } from "./terminalStore";
import { cn } from "../../../lib/utils";
import type { EnvironmentProject } from "@t3tools/client-runtime/state/shell";

export interface TerminalChatsSheetProps {
  activeProject?: EnvironmentProject | null;
  onNewTerminalThread?: () => void;
}

export const TerminalChatsSheet = memo(function TerminalChatsSheet({
  activeProject,
  onNewTerminalThread,
}: TerminalChatsSheetProps) {
  const store = useTerminalStore();
  const isOpen = store.isChatsSheetOpen;
  const [searchQuery, setSearchQuery] = useState("");

  // Close sheet on Escape
  useEffect(() => {
    const handleKeyDown = (e: globalThis.KeyboardEvent) => {
      if (e.key === "Escape" && isOpen) {
        terminalStore.setChatsSheetOpen(false);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen]);

  // Active SSH Key
  const activeSshKey = store.selectedKeyId
    ? store.accessKeys.find((k) => k.id === store.selectedKeyId)
    : store.accessKeys.find((k) => (k.type === "ssh" || k.host) && k.enabled);

  // Filtered Chats
  const filteredChats = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    if (!query) return store.terminalChats;
    return store.terminalChats.filter(
      (chat) =>
        chat.title.toLowerCase().includes(query) ||
        (chat.projectName && chat.projectName.toLowerCase().includes(query)) ||
        (chat.sshKeyName && chat.sshKeyName.toLowerCase().includes(query)),
    );
  }, [store.terminalChats, searchQuery]);

  if (!isOpen) return null;

  const handleClose = () => {
    terminalStore.setChatsSheetOpen(false);
  };

  const handleCreateNewChat = () => {
    const projName = store.selectedProjectTitle || activeProject?.title || "Auto Deploy";
    const keyName = activeSshKey?.name || "Server";
    const newChat = terminalStore.createTerminalChat({
      title: `${projName} (${keyName})`,
      projectId: store.selectedProjectId || activeProject?.id,
      projectName: projName,
      sshKeyId: activeSshKey?.id,
      sshKeyName: keyName,
    });
    terminalStore.setActiveChatId(newChat.id);
    terminalStore.setQuickBarOpen(true);
    terminalStore.setChatsSheetOpen(false);

    if (onNewTerminalThread) {
      onNewTerminalThread();
    }
  };

  const handleSelectChat = (chatId: string) => {
    terminalStore.setActiveChatId(chatId);
    terminalStore.setChatsSheetOpen(false);
  };

  const handleDeleteChat = (e: React.MouseEvent, chatId: string) => {
    e.stopPropagation();
    terminalStore.deleteTerminalChat(chatId);
  };

  return (
    <div className="fixed inset-0 z-50 flex justify-end animate-in fade-in duration-200">
      {/* Backdrop */}
      <div
        onClick={handleClose}
        className="fixed inset-0 bg-black/60 backdrop-blur-xs transition-opacity cursor-pointer"
        aria-hidden="true"
      />

      {/* Right-Side Sheet: 90% width (up to 480px on desktop) */}
      <div className="relative z-50 flex h-full w-[90vw] sm:max-w-[480px] flex-col bg-[#141416] border-l border-zinc-800 shadow-2xl animate-in slide-in-from-right duration-250">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-zinc-800/80 px-4 py-3 bg-[#18181b]/70 backdrop-blur-md">
          <div className="flex items-center gap-2">
            <div className="flex size-7 items-center justify-center rounded-lg bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
              <Terminal className="size-4" />
            </div>
            <div>
              <div className="flex items-center gap-1.5">
                <span className="font-semibold text-sm text-zinc-100">Terminal History</span>
                <span className="px-1.5 py-0.2 rounded-full bg-zinc-800 text-zinc-400 font-mono text-3xs border border-zinc-700/60">
                  {store.terminalChats.length}
                </span>
              </div>
              <p className="text-3xs text-zinc-400">AI Terminal chat sessions & logs</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleCreateNewChat}
              className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-medium text-xs transition-all shadow-xs cursor-pointer"
            >
              <Plus className="size-3.5" />
              <span>New Chat</span>
            </button>
            <button
              type="button"
              onClick={handleClose}
              className="rounded-lg p-1.5 text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200 transition-colors cursor-pointer"
              title="Close (Esc)"
            >
              <X className="size-4" />
            </button>
          </div>
        </div>

        {/* Search Bar */}
        <div className="px-4 py-2.5 border-b border-zinc-800/60 bg-[#161618]">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-3.5 text-zinc-500" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search terminal chats by title, project, server..."
              className="w-full pl-8 pr-7 py-1.5 bg-zinc-900 border border-zinc-700/60 rounded-lg text-xs text-zinc-200 placeholder:text-zinc-500 focus:outline-none focus:border-emerald-500/60 focus:ring-1 focus:ring-emerald-500/30 transition-all font-sans"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery("")}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-200 cursor-pointer"
              >
                <X className="size-3" />
              </button>
            )}
          </div>
        </div>

        {/* Chats List */}
        <div className="flex-1 overflow-y-auto p-3 space-y-2 select-none">
          {filteredChats.length === 0 ? (
            <div className="py-12 text-center text-zinc-500 space-y-2">
              <Terminal className="size-8 mx-auto opacity-30 text-zinc-400" />
              <p className="text-xs font-medium text-zinc-400">
                {searchQuery ? "No matching terminal chats found" : "No terminal history yet"}
              </p>
              <p className="text-3xs text-zinc-500 max-w-[220px] mx-auto">
                Click &quot;New Chat&quot; above to start a fresh autonomous terminal session.
              </p>
            </div>
          ) : (
            filteredChats.map((chat) => {
              const isCurrent = store.activeChatId === chat.id;
              return (
                <div
                  key={chat.id}
                  onClick={() => handleSelectChat(chat.id)}
                  className={cn(
                    "group relative flex flex-col gap-1.5 p-3 rounded-xl border transition-all cursor-pointer text-left",
                    isCurrent
                      ? "bg-emerald-950/20 border-emerald-500/40 shadow-sm ring-1 ring-emerald-500/20 text-zinc-100"
                      : "bg-[#1a1a1d] hover:bg-[#202024] border-zinc-800 text-zinc-300 hover:border-zinc-700/80",
                  )}
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0 flex-1">
                      <div
                        className={cn(
                          "size-5 rounded-md flex items-center justify-center shrink-0",
                          isCurrent
                            ? "bg-emerald-500/20 text-emerald-400"
                            : "bg-zinc-800 text-zinc-400 group-hover:text-zinc-300",
                        )}
                      >
                        <Terminal className="size-3" />
                      </div>
                      <span className="font-semibold text-xs text-zinc-100 truncate">
                        {chat.title}
                      </span>
                    </div>

                    <div className="flex items-center gap-1 shrink-0">
                      {isCurrent && (
                        <span className="flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-emerald-500/20 text-emerald-400 font-medium text-4xs border border-emerald-500/30">
                          <Check className="size-2.5" />
                          <span>Active</span>
                        </span>
                      )}
                      <button
                        type="button"
                        onClick={(e) => handleDeleteChat(e, chat.id)}
                        className="opacity-60 group-hover:opacity-100 p-1.5 rounded-md text-zinc-500 hover:text-rose-400 hover:bg-rose-500/10 transition-all cursor-pointer"
                        title="Delete chat"
                      >
                        <Trash2 className="size-3.5" />
                      </button>
                    </div>
                  </div>

                  {/* Metadata Chips: Project & SSH Server */}
                  <div className="flex items-center gap-1.5 flex-wrap text-3xs text-zinc-400">
                    {chat.projectName && (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-zinc-800/80 text-zinc-300 border border-zinc-700/60 font-medium truncate max-w-[150px]">
                        <Folder className="size-2.5 text-emerald-400 shrink-0" />
                        <span className="truncate">{chat.projectName}</span>
                      </span>
                    )}

                    {chat.sshKeyName && (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-sky-950/30 text-sky-300 border border-sky-800/40 font-medium truncate max-w-[150px]">
                        <Server className="size-2.5 text-sky-400 shrink-0" />
                        <span className="truncate">{chat.sshKeyName}</span>
                      </span>
                    )}

                    <span className="inline-flex items-center gap-1 text-zinc-500 text-4xs ml-auto">
                      <Clock className="size-2.5" />
                      {new Date(chat.createdAt).toLocaleDateString([], {
                        month: "short",
                        day: "numeric",
                      })}{" "}
                      •{" "}
                      {new Date(chat.createdAt).toLocaleTimeString([], {
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </span>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Footer with Bottom-Right Close Button (as user specifically requested) */}
        <div className="border-t border-zinc-800/80 px-4 py-3 bg-[#18181b]/80 backdrop-blur-md flex items-center justify-between">
          <span className="text-3xs text-zinc-500">
            {filteredChats.length} {filteredChats.length === 1 ? "chat" : "chats"} stored
          </span>
          <button
            type="button"
            onClick={handleClose}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-xs font-medium transition-all shadow-xs cursor-pointer border border-zinc-700/80"
          >
            <X className="size-3.5" />
            <span>Close</span>
          </button>
        </div>
      </div>
    </div>
  );
});
