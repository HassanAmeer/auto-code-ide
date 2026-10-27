import React from "react";
import { Brain } from "lucide-react";
import { useMemories, openMemorySheet, useMemorySheetState } from "../../lib/memoryStore";

interface MemoryTopTabButtonProps {
  className?: string;
}

export function MemoryTopTabButton({ className = "" }: MemoryTopTabButtonProps) {
  const { memories } = useMemories();
  const [isOpen] = useMemorySheetState();

  return (
    <button
      type="button"
      onClick={() => openMemorySheet()}
      className={`inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium transition-all duration-150 cursor-pointer [-webkit-app-region:no-drag] ${
        isOpen
          ? "bg-purple-500/20 text-purple-300 border border-purple-500/40 font-semibold shadow-xs"
          : "bg-zinc-800/60 text-zinc-300 hover:bg-zinc-800 hover:text-zinc-100 border border-zinc-700/50 hover:border-zinc-600"
      } ${className}`}
      title="Open Workspace Memory Vault (Permanent records, specs & rules)"
    >
      <Brain
        className={`size-3.5 transition-colors ${
          isOpen ? "text-purple-400" : "text-purple-400/90 group-hover:text-purple-300"
        }`}
      />
      <span>Memory</span>

      {memories.length > 0 && (
        <span className="rounded-full bg-purple-500/30 text-purple-200 px-1.5 py-0.2 text-[10px] font-mono font-bold">
          {memories.length}
        </span>
      )}
    </button>
  );
}
