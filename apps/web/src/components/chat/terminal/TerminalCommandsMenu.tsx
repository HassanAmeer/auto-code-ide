import { useState, useMemo } from "react";
import {
  Sparkles,
  Search,
  X,
  Play,
  ArrowRight,
  Terminal,
  Server,
  Layers,
  Cpu,
  Globe,
  Folder,
} from "lucide-react";
import {
  QUICK_COMMANDS_LIST,
  QUICK_COMMAND_CATEGORIES,
  type QuickCommandItem,
} from "./terminalCommandsData";

export interface TerminalCommandsMenuProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectCommand: (cmd: string, autoRun?: boolean) => void;
}

export function TerminalCommandsMenu({
  isOpen,
  onClose,
  onSelectCommand,
}: TerminalCommandsMenuProps) {
  const [selectedCategory, setSelectedCategory] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState("");

  const filteredCommands = useMemo(() => {
    return QUICK_COMMANDS_LIST.filter((item) => {
      const matchesCat = selectedCategory === "all" || item.category === selectedCategory;
      if (!matchesCat) return false;

      if (!searchQuery.trim()) return true;
      const q = searchQuery.toLowerCase();
      return (
        item.title.toLowerCase().includes(q) ||
        item.cmd.toLowerCase().includes(q) ||
        item.subtitle.toLowerCase().includes(q) ||
        (item.badge && item.badge.toLowerCase().includes(q))
      );
    });
  }, [selectedCategory, searchQuery]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-black/75 backdrop-blur-sm animate-in fade-in">
      <div className="relative w-full max-w-3xl max-h-[85vh] flex flex-col rounded-2xl bg-[#0c1017] border border-zinc-800 shadow-2xl text-zinc-100 overflow-hidden font-sans">
        {/* Header Bar */}
        <div className="flex items-center justify-between border-b border-zinc-800/80 bg-[#161b22] px-4 py-3 select-none">
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1.5 mr-2">
              <span className="size-3 rounded-full bg-[#ff5f56]" />
              <span className="size-3 rounded-full bg-[#ffbd2e]" />
              <span className="size-3 rounded-full bg-[#27c93f]" />
            </div>
            <Sparkles className="size-4 text-purple-400" />
            <span className="font-semibold text-sm text-zinc-100">
              Commands Library & Shortcuts
            </span>
            <span className="text-zinc-500 text-xs">· Categorized with Explanations</span>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded-lg text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors"
          >
            <X className="size-4" />
          </button>
        </div>

        {/* Search & Category Tabs */}
        <div className="p-3 bg-[#0e141e] border-b border-zinc-800 space-y-2.5">
          {/* Search bar */}
          <div className="relative flex items-center">
            <Search className="size-3.5 text-zinc-500 absolute left-3" />
            <input
              type="text"
              placeholder="Search command, description or task (e.g. restart, RAM, git, ports, download)..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-3 py-1.5 rounded-xl bg-zinc-900 border border-zinc-700 text-zinc-100 text-xs placeholder:text-zinc-500 focus:outline-none focus:border-purple-500/60 transition-colors"
              autoFocus
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery("")}
                className="absolute right-3 text-zinc-500 hover:text-zinc-300"
              >
                <X className="size-3" />
              </button>
            )}
          </div>

          {/* Category Tabs */}
          <div className="flex items-center gap-1.5 overflow-x-auto pb-0.5 scrollbar-none text-2xs">
            {QUICK_COMMAND_CATEGORIES.map((cat) => (
              <button
                key={cat.id}
                type="button"
                onClick={() => setSelectedCategory(cat.id)}
                className={`px-3 py-1 rounded-lg shrink-0 font-medium transition-all ${
                  selectedCategory === cat.id
                    ? "bg-purple-600 text-white shadow-md shadow-purple-900/30 font-semibold"
                    : "bg-zinc-800/80 hover:bg-zinc-800 text-zinc-400 hover:text-zinc-200"
                }`}
              >
                {cat.label}
              </button>
            ))}
          </div>
        </div>

        {/* Commands List Grid */}
        <div className="flex-1 overflow-y-auto p-3.5 space-y-2 max-h-[58vh] scrollbar-thin scrollbar-thumb-zinc-800">
          {filteredCommands.length > 0 ? (
            filteredCommands.map((item) => (
              <div
                key={item.id}
                className="group flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 p-3 rounded-xl bg-[#070a0f] hover:bg-zinc-900/90 border border-zinc-800/80 hover:border-purple-500/40 transition-all cursor-pointer shadow-sm hover:shadow-md"
                onClick={() => {
                  onSelectCommand(item.cmd, false);
                  onClose();
                }}
              >
                {/* Left: Info & Description */}
                <div className="flex-1 min-w-0 pr-2">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="font-semibold text-xs text-zinc-100 group-hover:text-purple-300 transition-colors truncate">
                      {item.title}
                    </span>
                    {item.badge && (
                      <span className="px-1.5 py-0.5 rounded text-3xs font-mono bg-zinc-800 text-zinc-400 group-hover:bg-purple-950/60 group-hover:text-purple-300 group-hover:border group-hover:border-purple-500/30">
                        {item.badge}
                      </span>
                    )}
                  </div>

                  {/* Subtitle / Explanation in Urdu/English */}
                  <p className="text-2xs text-zinc-400 leading-relaxed font-sans mb-1.5">
                    {item.subtitle}
                  </p>

                  {/* Command line */}
                  <div className="flex items-center gap-1.5 font-mono text-2xs text-emerald-400 bg-black/50 px-2 py-1 rounded-md border border-zinc-900 group-hover:border-zinc-800 break-all select-all">
                    <span className="select-none font-bold text-emerald-500">$</span>
                    <span>{item.cmd}</span>
                  </div>
                </div>

                {/* Right: Actions */}
                <div className="flex items-center gap-1.5 shrink-0 self-end sm:self-center">
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      onSelectCommand(item.cmd, false);
                      onClose();
                    }}
                    className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-2xs font-medium border border-zinc-700/60 transition-colors"
                    title="Copy to terminal input"
                  >
                    <span>Load Input</span>
                    <ArrowRight className="size-3" />
                  </button>

                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      onSelectCommand(item.cmd, true);
                      onClose();
                    }}
                    className="flex items-center gap-1 px-3 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-2xs font-semibold shadow transition-all hover:scale-105 active:scale-95"
                    title="Execute command immediately in terminal"
                  >
                    <Play className="size-2.5 fill-white" />
                    <span>Run Now</span>
                  </button>
                </div>
              </div>
            ))
          ) : (
            <div className="text-center py-12 text-zinc-500 text-xs font-mono">
              (No commands found matching "{searchQuery}")
            </div>
          )}
        </div>

        {/* Footer Summary */}
        <div className="flex items-center justify-between border-t border-zinc-800 bg-[#161b22] px-4 py-2 text-2xs text-zinc-400">
          <span>{filteredCommands.length} commands available</span>
          <span className="text-zinc-500">Tip: Click any command card to fill the input box</span>
        </div>
      </div>
    </div>
  );
}
