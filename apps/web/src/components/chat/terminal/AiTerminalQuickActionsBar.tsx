import { memo, useRef } from "react";
import {
  GitBranch,
  Download,
  Upload,
  Rocket,
  Bug,
  Cpu,
  Zap,
  Activity,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { cn } from "../../../lib/utils";
import { useTerminalStore, terminalStore } from "./terminalStore";
import { toastManager } from "../../ui/toast";
import type { EnvironmentProject } from "@t3tools/client-runtime/state/shell";

export interface AiTerminalQuickActionsBarProps {
  activeProject?: EnvironmentProject | null;
  variant?: "top-strip" | "hero";
  className?: string;
}

interface QuickActionItem {
  id: string;
  label: string;
  cmd: string;
  icon: typeof GitBranch;
  iconColor: string;
  accentBorder: string;
  tooltip: string;
}

const QUICK_ACTIONS: QuickActionItem[] = [
  // Column 1
  {
    id: "git-status",
    label: "Git Status",
    cmd: "git status --short",
    icon: GitBranch,
    iconColor: "text-emerald-400",
    accentBorder: "hover:border-emerald-500/40",
    tooltip: "Check modified, staged, and untracked files",
  },
  {
    id: "git-pull",
    label: "Git Pull",
    cmd: "git pull origin $(git branch --show-current 2>/dev/null || echo main)",
    icon: Download,
    iconColor: "text-sky-400",
    accentBorder: "hover:border-sky-500/40",
    tooltip: "Pull latest commits from remote repository",
  },
  // Column 2
  {
    id: "git-push",
    label: "Git Push",
    cmd: "git push origin $(git branch --show-current 2>/dev/null || echo main)",
    icon: Upload,
    iconColor: "text-indigo-400",
    accentBorder: "hover:border-indigo-500/40",
    tooltip: "Push committed changes to remote repository",
  },
  {
    id: "deploy-project",
    label: "Deploy Project",
    cmd: `echo "=== Step 1: Building Web Application ===" && (pnpm --filter @t3tools/web build || npm run build) && echo "=== Step 2: Restarting Service ===" && systemctl restart autojobs.service && sleep 2 && systemctl is-active autojobs.service && echo "=== Safe Deployment Complete! ==="`,
    icon: Rocket,
    iconColor: "text-amber-400",
    accentBorder: "hover:border-amber-500/40",
    tooltip: "Build frontend bundle & safely restart autojobs daemon",
  },
  // Column 3
  {
    id: "debug-vps",
    label: "Debug VPS",
    cmd: `echo "=== Service Status & Recent Errors ===" && systemctl status autojobs.service --no-pager -n 15 && echo "=== Recent Journal Errors ===" && journalctl -u autojobs.service -p err -n 10 --no-pager`,
    icon: Bug,
    iconColor: "text-rose-400",
    accentBorder: "hover:border-rose-500/40",
    tooltip: "Inspect service status, crash logs, and errors",
  },
  {
    id: "system-info",
    label: "System Info",
    cmd: `echo "=== RAM & SWAP ===" && free -h && echo "=== NVMe DISK USAGE ===" && df -h / && echo "=== CPU LOAD & UPTIME ===" && uptime`,
    icon: Cpu,
    iconColor: "text-blue-400",
    accentBorder: "hover:border-blue-500/40",
    tooltip: "Check RAM, Swap memory, Disk storage, and CPU load",
  },
  // Column 4
  {
    id: "boost-cache",
    label: "Boost Cache",
    cmd: `echo "=== Clearing & Boosting System Cache ===" && sync && (echo 3 > /proc/sys/vm/drop_caches 2>/dev/null || true) && free -h && echo "=== Cache Boost Complete ==="`,
    icon: Zap,
    iconColor: "text-teal-400",
    accentBorder: "hover:border-teal-500/40",
    tooltip: "Flush file system buffers and drop inactive cache",
  },
  {
    id: "service-status",
    label: "Service Status",
    cmd: "systemctl status autojobs.service --no-pager",
    icon: Activity,
    iconColor: "text-violet-400",
    accentBorder: "hover:border-violet-500/40",
    tooltip: "Check live daemon status and active uptime",
  },
];

export const AiTerminalQuickActionsBar = memo(function AiTerminalQuickActionsBar({
  activeProject,
  variant = "top-strip",
  className = "",
}: AiTerminalQuickActionsBarProps) {
  const store = useTerminalStore();
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  const isRootScope = store.scopeMode === "root";
  const projectPath = store.lastProjectPath || (store.selectedProjectId ? store.activeCwd : null);
  const effectiveCwd = isRootScope
    ? "/"
    : projectPath || activeProject?.workspaceRoot || store.activeCwd || "/";

  const handleRunQuickCommand = (cmd: string, label: string) => {
    toastManager.add({
      type: "info",
      title: `Executing ${label}`,
      description: `$ ${cmd.slice(0, 50)}...`,
    });
    void terminalStore.runCommand(cmd, effectiveCwd, "bash");
  };

  const scrollLeft = () => {
    if (scrollContainerRef.current) {
      scrollContainerRef.current.scrollBy({ left: -220, behavior: "smooth" });
    }
  };

  const scrollRight = () => {
    if (scrollContainerRef.current) {
      scrollContainerRef.current.scrollBy({ left: 220, behavior: "smooth" });
    }
  };

  const isHero = variant === "hero";

  return (
    <div
      className={cn(
        isHero
          ? "w-full max-w-xl mx-auto flex items-center gap-1 p-1 rounded-[10px] bg-[#141416]/95 backdrop-blur-xl border border-white/[0.09] shadow-xl select-none transition-all"
          : "w-full bg-[#111113]/90 backdrop-blur-xl border-b border-white/[0.06] select-none flex items-center gap-1 px-2 py-1 transition-all z-10",
        className,
      )}
    >
      {/* Scroll Left Button */}
      <button
        type="button"
        onClick={scrollLeft}
        title="Scroll Left"
        className="shrink-0 p-1 rounded-[5px] text-zinc-400 hover:text-zinc-100 hover:bg-white/[0.06] transition-colors cursor-pointer"
      >
        <ChevronLeft className="size-3" />
      </button>

      {/* Horizontal Scroll Area: 2 Rows of Buttons flowing Column-by-Column */}
      <div
        ref={scrollContainerRef}
        onWheel={(e) => {
          if (e.deltaY !== 0 && scrollContainerRef.current) {
            scrollContainerRef.current.scrollLeft += e.deltaY;
          }
        }}
        className="flex-1 overflow-x-auto overflow-y-hidden py-0.5 px-0.5 scroll-smooth [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden"
      >
        <div className="grid grid-rows-2 grid-flow-col auto-cols-max gap-1.5 w-max">
          {QUICK_ACTIONS.map((item) => {
            const Icon = item.icon;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => handleRunQuickCommand(item.cmd, item.label)}
                title={`${item.label}\n${item.tooltip}\nCommand: $ ${item.cmd}`}
                className={cn(
                  "group flex items-center gap-1.5 h-[26px] px-2.5 rounded-[6px] bg-[#1c1c20]/90 hover:bg-[#28282e] active:scale-[0.98] border border-white/[0.07] text-zinc-300 hover:text-white transition-all cursor-pointer shadow-xs whitespace-nowrap",
                  item.accentBorder,
                )}
              >
                <Icon className={cn("size-3 shrink-0 transition-colors", item.iconColor)} />
                <span className="text-[11px] font-medium tracking-tight font-sans text-zinc-200 group-hover:text-white">
                  {item.label}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Scroll Right Button */}
      <button
        type="button"
        onClick={scrollRight}
        title="Scroll Right"
        className="shrink-0 p-1 rounded-[5px] text-zinc-400 hover:text-zinc-100 hover:bg-white/[0.06] transition-colors cursor-pointer"
      >
        <ChevronRight className="size-3" />
      </button>
    </div>
  );
});
