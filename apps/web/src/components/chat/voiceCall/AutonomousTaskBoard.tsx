import { useState, useEffect, useMemo, useCallback } from "react";
import {
  FolderGit2,
  GitBranch,
  GitCommit,
  ShieldCheck,
  Zap,
  Play,
  CheckCircle2,
  Clock,
  Sparkles,
  ExternalLink,
  Plus,
  Trash2,
  RefreshCw,
  Layers,
  ArrowRight,
  Terminal,
  Activity,
  Check,
  AlertCircle,
} from "lucide-react";
import { cn } from "~/lib/utils";

export interface BoardTask {
  id: string;
  title: string;
  description: string;
  status: "backlog" | "in_progress" | "verifying" | "done";
  branch: string;
  worktreePath: string;
  workerModel: string;
  progress: number;
  filesModified?: string[];
  previewUrl?: string;
  autoHealedErrors?: number;
  updatedAt: string;
}

const STORAGE_KEY = "t3code:autonomous-tasks-board:v1";

const DEFAULT_BOARD_TASKS: BoardTask[] = [
  {
    id: "task-101",
    title: "1. Core API & Database Schema Setup",
    description: "Design SQLite tables, data models, and REST endpoints for data persistence.",
    status: "done",
    branch: "feat/db-schema",
    worktreePath: "worktrees/db-schema",
    workerModel: "opencode/beam-free",
    progress: 100,
    filesModified: ["server/db.ts", "schema.sql"],
    previewUrl: "/api/projects/preview/op/index.html",
    autoHealedErrors: 1,
    updatedAt: new Date(Date.now() - 3600000).toISOString(),
  },
  {
    id: "task-102",
    title: "2. Interactive UI Layout & Reactive State",
    description: "Build component hierarchy, clean Tailwind widgets, and live state store.",
    status: "verifying",
    branch: "feat/ui-components",
    worktreePath: "worktrees/ui-components",
    workerModel: "opencode/beam-free",
    progress: 85,
    filesModified: ["src/App.tsx", "src/components/Widget.tsx"],
    previewUrl: "/api/projects/preview/op/index.html",
    autoHealedErrors: 0,
    updatedAt: new Date(Date.now() - 1800000).toISOString(),
  },
  {
    id: "task-103",
    title: "3. Background Watchdog & Self-Healing Service",
    description: "Run automated health checks on port 13773 and auto-heal syntax discrepancies.",
    status: "in_progress",
    branch: "feat/watchdog-worker",
    worktreePath: "worktrees/watchdog-worker",
    workerModel: "opencode/beam-free",
    progress: 45,
    filesModified: ["src/services/watchdog.ts"],
    autoHealedErrors: 0,
    updatedAt: new Date().toISOString(),
  },
];

export function AutonomousTaskBoard({
  projectName = "Workspace",
  activeModel = "opencode/beam-free",
  onOpenPreview,
}: {
  projectName?: string;
  activeModel?: string;
  onOpenPreview?: (url: string) => void;
}) {
  const [tasks, setTasks] = useState<BoardTask[]>(() => {
    if (typeof window === "undefined") return DEFAULT_BOARD_TASKS;
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      }
    } catch {}
    return DEFAULT_BOARD_TASKS;
  });

  const [newGoalInput, setNewGoalInput] = useState("");
  const [isDecomposing, setIsDecomposing] = useState(false);
  const [copiedTaskUrl, setCopiedTaskUrl] = useState<string | null>(null);

  // Sync to local storage
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(tasks));
    } catch {}
  }, [tasks]);

  const stats = useMemo(() => {
    const backlog = tasks.filter((t) => t.status === "backlog").length;
    const inProgress = tasks.filter((t) => t.status === "in_progress").length;
    const verifying = tasks.filter((t) => t.status === "verifying").length;
    const done = tasks.filter((t) => t.status === "done").length;
    return { backlog, inProgress, verifying, done, total: tasks.length };
  }, [tasks]);

  // Handle task status progression
  const moveTaskStatus = useCallback((taskId: string, nextStatus: BoardTask["status"]) => {
    setTasks((prev) =>
      prev.map((t) => {
        if (t.id !== taskId) return t;
        let progress = t.progress;
        if (nextStatus === "backlog") progress = 0;
        if (nextStatus === "in_progress") progress = Math.max(25, t.progress);
        if (nextStatus === "verifying") progress = 85;
        if (nextStatus === "done") progress = 100;

        return {
          ...t,
          status: nextStatus,
          progress,
          updatedAt: new Date().toISOString(),
        };
      }),
    );
  }, []);

  const deleteTask = useCallback((taskId: string) => {
    setTasks((prev) => prev.filter((t) => t.id !== taskId));
  }, []);

  // Goal Decomposer (Simulated DeepSeek supervisor task breakdown)
  const handleDecomposeGoal = useCallback(() => {
    const goal = newGoalInput.trim();
    if (!goal) return;

    setIsDecomposing(true);

    setTimeout(() => {
      const cleanSlug = goal
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .slice(0, 20);
      const timestamp = Date.now().toString(36).slice(-4);

      const subtaskA: BoardTask = {
        id: `task-${Date.now()}-1`,
        title: `1. Setup: ${goal.slice(0, 40)}`,
        description: `Initialize architecture, data structures, and configuration files for ${goal}.`,
        status: "in_progress",
        branch: `task/${cleanSlug}-core-${timestamp}`,
        worktreePath: `worktrees/${cleanSlug}-core`,
        workerModel: activeModel,
        progress: 30,
        filesModified: [`src/${cleanSlug}.ts`],
        autoHealedErrors: 0,
        updatedAt: new Date().toISOString(),
      };

      const subtaskB: BoardTask = {
        id: `task-${Date.now()}-2`,
        title: `2. Implementation: ${goal.slice(0, 40)}`,
        description: `Implement primary business logic, client views, and integration handling.`,
        status: "backlog",
        branch: `task/${cleanSlug}-ui-${timestamp}`,
        worktreePath: `worktrees/${cleanSlug}-ui`,
        workerModel: activeModel,
        progress: 0,
        autoHealedErrors: 0,
        updatedAt: new Date().toISOString(),
      };

      setTasks((prev) => [subtaskA, subtaskB, ...prev]);
      setNewGoalInput("");
      setIsDecomposing(false);
    }, 800);
  }, [newGoalInput, activeModel]);

  const handleCopyUrl = (url: string) => {
    navigator.clipboard?.writeText(url);
    setCopiedTaskUrl(url);
    setTimeout(() => setCopiedTaskUrl(null), 2000);
  };

  const columns: Array<{
    key: BoardTask["status"];
    title: string;
    icon: typeof Clock;
    color: string;
    border: string;
    bg: string;
  }> = [
    {
      key: "backlog",
      title: "Planned / Backlog",
      icon: Clock,
      color: "text-amber-400",
      border: "border-amber-500/30",
      bg: "bg-amber-500/10",
    },
    {
      key: "in_progress",
      title: "In Worktree (Running)",
      icon: Activity,
      color: "text-cyan-400",
      border: "border-cyan-500/30",
      bg: "bg-cyan-500/10",
    },
    {
      key: "verifying",
      title: "Verifying / Self-Heal",
      icon: ShieldCheck,
      color: "text-indigo-400",
      border: "border-indigo-500/30",
      bg: "bg-indigo-500/10",
    },
    {
      key: "done",
      title: "Ready to Merge / Done",
      icon: CheckCircle2,
      color: "text-emerald-400",
      border: "border-emerald-500/30",
      bg: "bg-emerald-500/10",
    },
  ];

  return (
    <div className="space-y-4">
      {/* Top Banner & Overview */}
      <div className="rounded-xl border border-primary/30 bg-gradient-to-r from-primary/10 via-background/80 to-background/95 p-3.5 shadow-sm">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center gap-2">
            <span className="p-1.5 rounded-lg bg-primary/20 text-primary border border-primary/30">
              <FolderGit2 className="size-4" />
            </span>
            <div>
              <h3 className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                <span>Autonomous Multi-Agent Worktrees Board</span>
                <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-primary/20 text-primary font-mono">
                  {projectName}
                </span>
              </h3>
              <p className="text-[11px] text-muted-foreground mt-0.5">
                Master Supervisor tasks ko parallel Git Worktrees mein run aur verify karta hai.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1.5 text-[10px] font-mono">
            <span className="px-2 py-0.5 rounded-md bg-muted/60 border border-border/70 text-muted-foreground">
              Total: {stats.total}
            </span>
            <span className="px-2 py-0.5 rounded-md bg-cyan-500/15 border border-cyan-500/30 text-cyan-300">
              Active: {stats.inProgress + stats.verifying}
            </span>
            <span className="px-2 py-0.5 rounded-md bg-emerald-500/15 border border-emerald-500/30 text-emerald-300">
              Done: {stats.done}
            </span>
          </div>
        </div>

        {/* Goal Decomposer Form */}
        <div className="mt-3 flex items-center gap-2">
          <div className="relative flex-1">
            <input
              type="text"
              value={newGoalInput}
              onChange={(e) => setNewGoalInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleDecomposeGoal()}
              placeholder="Naya Goal likhein (e.g. Add Stripe checkout with sqlite webhook)..."
              className="w-full text-xs rounded-lg border border-border/70 bg-background/90 px-3 py-1.5 text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary"
            />
          </div>
          <button
            type="button"
            onClick={handleDecomposeGoal}
            disabled={!newGoalInput.trim() || isDecomposing}
            className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-primary text-primary-foreground text-xs font-semibold hover:bg-primary/90 transition-all shadow-xs cursor-pointer disabled:opacity-50"
          >
            {isDecomposing ? (
              <>
                <RefreshCw className="size-3 animate-spin" />
                <span>Decomposing...</span>
              </>
            ) : (
              <>
                <Sparkles className="size-3" />
                <span>Decompose & Plan</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* Kanban Board Columns Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
        {columns.map((col) => {
          const colTasks = tasks.filter((t) => t.status === col.key);
          const ColIcon = col.icon;

          return (
            <div
              key={col.key}
              className={cn(
                "rounded-xl border bg-card/40 flex flex-col min-h-[340px] max-h-[520px] overflow-hidden",
                col.border,
              )}
            >
              {/* Column Header */}
              <div
                className={cn(
                  "p-2.5 border-b flex items-center justify-between text-xs font-semibold",
                  col.border,
                  col.bg,
                )}
              >
                <div className="flex items-center gap-1.5">
                  <ColIcon className={cn("size-3.5", col.color)} />
                  <span className="text-foreground">{col.title}</span>
                </div>
                <span
                  className={cn(
                    "text-[10px] font-mono px-1.5 py-0.5 rounded-full font-bold",
                    col.color,
                  )}
                >
                  {colTasks.length}
                </span>
              </div>

              {/* Column Tasks List */}
              <div className="flex-1 overflow-y-auto p-2 space-y-2.5 scrollbar-thin">
                {colTasks.length === 0 ? (
                  <div className="py-12 text-center text-[11px] text-muted-foreground/60">
                    No tasks in this stage
                  </div>
                ) : (
                  colTasks.map((t) => (
                    <div
                      key={t.id}
                      className="group p-2.5 rounded-lg border border-border/70 bg-card/80 hover:border-primary/50 transition-all space-y-2 shadow-xs"
                    >
                      {/* Task Title & Delete */}
                      <div className="flex items-start justify-between gap-1">
                        <h4 className="text-xs font-semibold text-foreground/90 leading-snug">
                          {t.title}
                        </h4>
                        <button
                          type="button"
                          onClick={() => deleteTask(t.id)}
                          className="opacity-0 group-hover:opacity-100 p-0.5 rounded text-muted-foreground hover:text-destructive transition-all cursor-pointer"
                          title="Delete Task"
                        >
                          <Trash2 className="size-3" />
                        </button>
                      </div>

                      {/* Description */}
                      <p className="text-[11px] text-muted-foreground line-clamp-2 leading-relaxed">
                        {t.description}
                      </p>

                      {/* Git Worktree Branch Tag */}
                      <div className="flex items-center gap-1 text-[10px] font-mono text-cyan-400 bg-cyan-950/20 px-2 py-0.5 rounded border border-cyan-500/20 truncate">
                        <GitBranch className="size-2.5 shrink-0" />
                        <span className="truncate">{t.branch}</span>
                      </div>

                      {/* Progress Bar */}
                      <div className="w-full bg-border/50 rounded-full h-1 overflow-hidden">
                        <div
                          className="bg-primary h-full rounded-full transition-all duration-300"
                          style={{ width: `${t.progress}%` }}
                        />
                      </div>

                      {/* Files Modified & Errors Fixed */}
                      {t.filesModified && t.filesModified.length > 0 && (
                        <div className="text-[9.5px] font-mono text-muted-foreground truncate">
                          📁 {t.filesModified.join(", ")}
                        </div>
                      )}

                      {/* Preview Button if available */}
                      {t.previewUrl && (
                        <div className="pt-1 flex items-center justify-between gap-1 text-[10px]">
                          <span className="text-emerald-400 font-medium flex items-center gap-1">
                            <span className="size-1.5 rounded-full bg-emerald-400 animate-pulse" />
                            HTTP 200 OK
                          </span>
                          <a
                            href={t.previewUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex items-center gap-1 text-primary hover:underline font-semibold"
                          >
                            <span>Preview</span>
                            <ExternalLink className="size-2.5" />
                          </a>
                        </div>
                      )}

                      {/* Action Stage Switcher Buttons */}
                      <div className="pt-1.5 border-t border-border/40 flex items-center justify-between gap-1 text-[10px]">
                        {col.key === "backlog" && (
                          <button
                            type="button"
                            onClick={() => moveTaskStatus(t.id, "in_progress")}
                            className="w-full inline-flex items-center justify-center gap-1 px-2 py-1 rounded bg-cyan-500/15 text-cyan-300 hover:bg-cyan-500/25 border border-cyan-500/30 transition-all font-medium cursor-pointer"
                          >
                            <Play className="size-2.5" />
                            <span>Start in Worktree</span>
                          </button>
                        )}

                        {col.key === "in_progress" && (
                          <div className="w-full flex items-center gap-1">
                            <button
                              type="button"
                              onClick={() => moveTaskStatus(t.id, "backlog")}
                              className="px-1.5 py-1 rounded bg-muted/50 text-muted-foreground hover:bg-muted text-[9px] cursor-pointer"
                            >
                              Back
                            </button>
                            <button
                              type="button"
                              onClick={() => moveTaskStatus(t.id, "verifying")}
                              className="flex-1 inline-flex items-center justify-center gap-1 px-2 py-1 rounded bg-indigo-500/15 text-indigo-300 hover:bg-indigo-500/25 border border-indigo-500/30 transition-all font-medium cursor-pointer"
                            >
                              <ShieldCheck className="size-2.5" />
                              <span>Verify & Test</span>
                            </button>
                          </div>
                        )}

                        {col.key === "verifying" && (
                          <div className="w-full flex items-center gap-1">
                            <button
                              type="button"
                              onClick={() => moveTaskStatus(t.id, "in_progress")}
                              className="px-1.5 py-1 rounded bg-muted/50 text-muted-foreground hover:bg-muted text-[9px] cursor-pointer"
                            >
                              Fix
                            </button>
                            <button
                              type="button"
                              onClick={() => moveTaskStatus(t.id, "done")}
                              className="flex-1 inline-flex items-center justify-center gap-1 px-2 py-1 rounded bg-emerald-500/20 text-emerald-300 hover:bg-emerald-500/30 border border-emerald-500/30 transition-all font-semibold cursor-pointer"
                            >
                              <Check className="size-2.5" />
                              <span>Approve & Merge</span>
                            </button>
                          </div>
                        )}

                        {col.key === "done" && (
                          <div className="w-full flex items-center justify-between text-emerald-400 font-semibold text-[9.5px]">
                            <span className="flex items-center gap-1">
                              <CheckCircle2 className="size-3 text-emerald-400" />
                              <span>Merged to main</span>
                            </span>
                            <span className="text-[9px] text-muted-foreground font-mono">
                              Verified
                            </span>
                          </div>
                        )}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
