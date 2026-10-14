import { useState, useMemo, useEffect } from "react";
import { Sparkles, Search, X, Play, ArrowRight } from "lucide-react";
import { QUICK_COMMANDS_LIST, QUICK_COMMAND_CATEGORIES } from "./terminalCommandsData";

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

  // Close on Escape
  useEffect(() => {
    const handleKeyDown = (e: globalThis.KeyboardEvent) => {
      if (e.key === "Escape" && isOpen) {
        onClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);

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
    <div className="fixed inset-0 z-50 flex justify-end animate-in fade-in duration-200">
      {/* Backdrop */}
      <div
        onClick={onClose}
        className="fixed inset-0 bg-black/60 backdrop-blur-xs transition-opacity cursor-pointer"
        aria-hidden="true"
      />

      {/* Cupertino iOS Right-Side Sheet (Mobile: 90% width, Desktop: compact ~420px) */}
      <div
        role="dialog"
        aria-label="Commands Library & Shortcuts"
        className="relative z-50 h-full w-[90vw] max-w-[90vw] sm:w-[420px] bg-[#161618] border-l border-zinc-800 shadow-2xl flex flex-col text-zinc-100 overflow-hidden font-sans"
      >
        {/* Header in Cupertino iOS Style */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-800/80 bg-[#1c1c1e] shrink-0">
          <div className="flex items-center gap-2">
            <div className="p-1.5 rounded-[5px] bg-purple-500/15 text-purple-400 border border-purple-500/30">
              <Sparkles className="size-4" />
            </div>
            <div>
              <h2 className="text-xs font-semibold tracking-tight flex items-center gap-1.5 text-zinc-100">
                Commands Library
                <span className="text-4xs font-mono font-medium px-1.5 py-0.2 rounded-[5px] bg-purple-500/15 text-purple-300 border border-purple-500/30">
                  {filteredCommands.length}
                </span>
              </h2>
              <p className="text-3xs text-zinc-400 mt-0.5">
                Quick commands, system tools & shortcuts
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded-[5px] text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors cursor-pointer"
            title="Close Sheet"
          >
            <X className="size-4" />
          </button>
        </div>

        {/* Search & Category Pills */}
        <div className="p-3 bg-[#161618] border-b border-zinc-800 space-y-2">
          {/* Search bar */}
          <div className="relative flex items-center">
            <Search className="size-3.5 text-zinc-500 absolute left-2.5" />
            <input
              type="text"
              placeholder="Search command, description or task..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-8 pr-7 py-1.5 rounded-[5px] bg-zinc-900 border border-zinc-700 text-zinc-100 text-xs placeholder:text-zinc-500 focus:outline-none focus:border-purple-500/70 transition-colors"
              autoFocus
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery("")}
                className="absolute right-2.5 text-zinc-500 hover:text-zinc-300 cursor-pointer"
              >
                <X className="size-3" />
              </button>
            )}
          </div>

          {/* Category Tabs */}
          <div className="flex items-center gap-1.5 overflow-x-auto pb-0.5 [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden text-2xs">
            {QUICK_COMMAND_CATEGORIES.map((cat) => (
              <button
                key={cat.id}
                type="button"
                onClick={() => setSelectedCategory(cat.id)}
                className={`px-2.5 py-1 rounded-[5px] shrink-0 font-medium transition-all cursor-pointer ${
                  selectedCategory === cat.id
                    ? "bg-purple-600 text-white shadow-xs font-semibold"
                    : "bg-zinc-800/80 hover:bg-zinc-800 text-zinc-400 hover:text-zinc-200"
                }`}
              >
                {cat.label}
              </button>
            ))}
          </div>
        </div>

        {/* Commands List */}
        <div className="flex-1 overflow-y-auto p-3 space-y-2 pb-16 [scrollbar-width:thin]">
          {filteredCommands.length > 0 ? (
            filteredCommands.map((item) => (
              <div
                key={item.id}
                className="group p-2.5 rounded-[5px] bg-[#1c1c1e] hover:bg-[#202023] border border-zinc-800 hover:border-purple-500/40 transition-all cursor-pointer shadow-xs space-y-2 text-left"
                onClick={() => {
                  onSelectCommand(item.cmd, false);
                  onClose();
                }}
              >
                {/* Title & Badge */}
                <div className="flex items-center justify-between gap-1.5">
                  <span className="font-semibold text-xs text-zinc-100 group-hover:text-purple-300 transition-colors truncate">
                    {item.title}
                  </span>
                  {item.badge && (
                    <span className="px-1.5 py-0.2 rounded-[5px] text-4xs font-mono bg-zinc-800 text-zinc-400 border border-zinc-700/60 shrink-0">
                      {item.badge}
                    </span>
                  )}
                </div>

                {/* Subtitle / Explanation */}
                <p className="text-3xs text-zinc-400 leading-relaxed font-sans line-clamp-2">
                  {item.subtitle}
                </p>

                {/* Command Snippet */}
                <div className="flex items-center gap-1.5 font-mono text-3xs text-emerald-400 bg-black/60 px-2 py-1 rounded-[5px] border border-zinc-800/80 break-all select-all">
                  <span className="select-none font-bold text-emerald-500">$</span>
                  <span>{item.cmd}</span>
                </div>

                {/* Actions */}
                <div className="flex items-center justify-end gap-1.5 pt-0.5">
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      onSelectCommand(item.cmd, false);
                      onClose();
                    }}
                    className="flex items-center gap-1 px-2 py-0.5 rounded-[5px] bg-zinc-800 hover:bg-zinc-700 text-zinc-300 hover:text-white text-3xs font-medium border border-zinc-700/60 transition-colors cursor-pointer"
                    title="Load into terminal input"
                  >
                    <span>Input</span>
                    <ArrowRight className="size-2.5" />
                  </button>

                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      onSelectCommand(item.cmd, true);
                      onClose();
                    }}
                    className="flex items-center gap-1 px-2.5 py-0.5 rounded-[5px] bg-emerald-600 hover:bg-emerald-500 text-white text-3xs font-semibold shadow-xs transition-all cursor-pointer"
                    title="Execute command immediately"
                  >
                    <Play className="size-2 fill-white" />
                    <span>Run</span>
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

        {/* Close Icon Button on Right Bottom Side in Cupertino iOS Style */}
        <div className="absolute bottom-3 right-3 z-50">
          <button
            type="button"
            onClick={onClose}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-[5px] bg-zinc-800 hover:bg-zinc-700 text-zinc-200 hover:text-white font-medium text-xs shadow-lg border border-zinc-700 transition-all cursor-pointer"
            title="Close Sheet"
          >
            <X className="size-3.5" />
            <span>Close</span>
          </button>
        </div>
      </div>
    </div>
  );
}
