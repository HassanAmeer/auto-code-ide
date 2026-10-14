import { memo, useState, useRef, useEffect, useCallback, type KeyboardEvent } from "react";
import {
  Terminal,
  SendHorizontal,
  Loader2,
  X,
  Check,
  Copy,
  ChevronDown,
  ChevronUp,
  ChevronLeft,
  ChevronRight,
  Folder,
  Server,
  Key,
  MoreVertical,
  Plus,
  Trash2,
  Eye,
  EyeOff,
  ShieldCheck,
  CheckSquare,
  Square,
} from "lucide-react";

import { cn } from "../../../lib/utils";
import { useTerminalStore, terminalStore } from "./terminalStore";
import type { TerminalCommandRun, TerminalAccessKey } from "./terminalTypes";
import { useProjects } from "../../../state/entities";

export interface AiTerminalCommandBarProps {
  projectCwd?: string | undefined;
  className?: string | undefined;
}

export const AiTerminalCommandBar = memo(function AiTerminalCommandBar({
  projectCwd,
  className = "",
}: AiTerminalCommandBarProps) {
  const store = useTerminalStore();
  const projects = useProjects();
  const [command, setCommand] = useState("");
  const [historyIndex, setHistoryIndex] = useState<number | null>(null);
  const [isRunning, setIsRunning] = useState(false);
  const [latestRun, setLatestRun] = useState<TerminalCommandRun | null>(null);
  const [isOutputCollapsed, setIsOutputCollapsed] = useState(false);
  const [copied, setCopied] = useState(false);

  // Modal state for More (⋮) menu
  const [showManageModal, setShowManageModal] = useState(false);
  const [modalTab, setModalTab] = useState<"add" | "manage">("add");

  // Add SSH Key Form state
  const [newKeyName, setNewKeyName] = useState("");
  const [newKeyHost, setNewKeyHost] = useState("");
  const [newKeyUser, setNewKeyUser] = useState("root");
  const [newKeyPort, setNewKeyPort] = useState("22");
  const [newKeySecret, setNewKeySecret] = useState("");
  const [newKeyNotes, setNewKeyNotes] = useState("");
  const [showSecret, setShowSecret] = useState(false);

  // Manage Keys Batch Selection state
  const [selectedKeyIdsToDelete, setSelectedKeyIdsToDelete] = useState<string[]>([]);

  const inputRef = useRef<HTMLInputElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  // Update latestRun when runs change
  useEffect(() => {
    if (store.runs.length > 0) {
      setLatestRun(store.runs[0] ?? null);
    }
  }, [store.runs]);

  // Determine active project and active CWD
  const effectiveCwd = store.activeCwd || projectCwd || "/";

  // Active SSH Key
  const activeSshKey = store.selectedKeyId
    ? store.accessKeys.find((k) => k.id === store.selectedKeyId)
    : store.accessKeys.find(
        (k) => (k.type === "ssh" || k.type === "server") && k.enabled && k.host,
      );

  // Active Project title
  const activeProject =
    projects.find((p) => p.id === store.selectedProjectId) ||
    projects.find((p) => p.workspaceRoot === effectiveCwd);

  const handleExecute = useCallback(async () => {
    const trimmed = command.trim();
    if (!trimmed || isRunning) return;

    setIsRunning(true);
    setHistoryIndex(null);
    try {
      const run = await terminalStore.runCommand(trimmed, effectiveCwd, "bash");
      setLatestRun(run);
      setIsOutputCollapsed(false);
      setCommand("");
    } catch (err) {
      console.error("Command execution error:", err);
    } finally {
      setIsRunning(false);
      inputRef.current?.focus();
    }
  }, [command, isRunning, effectiveCwd]);

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      void handleExecute();
      return;
    }

    if (e.key === "ArrowUp") {
      e.preventDefault();
      const history = store.history;
      if (history.length === 0) return;
      const nextIndex = historyIndex === null ? 0 : Math.min(historyIndex + 1, history.length - 1);
      setHistoryIndex(nextIndex);
      setCommand(history[nextIndex] ?? "");
      return;
    }

    if (e.key === "ArrowDown") {
      e.preventDefault();
      if (historyIndex === null) return;
      const nextIndex = historyIndex - 1;
      if (nextIndex < 0) {
        setHistoryIndex(null);
        setCommand("");
      } else {
        setHistoryIndex(nextIndex);
        setCommand(store.history[nextIndex] ?? "");
      }
      return;
    }

    if (e.key === "Escape") {
      terminalStore.setQuickBarOpen(false);
    }
  };

  const handleCopyOutput = useCallback(() => {
    if (!latestRun) return;
    const text = [`$ ${latestRun.command}`, latestRun.stdout, latestRun.stderr]
      .filter(Boolean)
      .join("\n");
    void navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [latestRun]);

  // Horizontal scroll buttons
  const scrollLeft = () => {
    scrollContainerRef.current?.scrollBy({ left: -220, behavior: "smooth" });
  };

  const scrollRight = () => {
    scrollContainerRef.current?.scrollBy({ left: 220, behavior: "smooth" });
  };

  // Add SSH Key Handler
  const handleSaveKey = () => {
    if (!newKeyName.trim() || !newKeyHost.trim()) return;

    const accessKey: Omit<TerminalAccessKey, "id"> = {
      name: newKeyName.trim(),
      type: "ssh",
      host: newKeyHost.trim(),
      user: newKeyUser.trim() || "root",
      port: Number(newKeyPort) || 22,
      secret: newKeySecret.trim(),
      notes: newKeyNotes.trim(),
      enabled: true,
    };

    terminalStore.addAccessKey(accessKey);
    // Reset form
    setNewKeyName("");
    setNewKeyHost("");
    setNewKeyUser("root");
    setNewKeyPort("22");
    setNewKeySecret("");
    setNewKeyNotes("");
    setShowManageModal(false);
  };

  // Toggle selection for bulk deletion
  const toggleSelectKeyToDelete = (id: string) => {
    setSelectedKeyIdsToDelete((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id],
    );
  };

  const handleSelectAllKeysToDelete = () => {
    if (selectedKeyIdsToDelete.length === store.accessKeys.length) {
      setSelectedKeyIdsToDelete([]);
    } else {
      setSelectedKeyIdsToDelete(store.accessKeys.map((k) => k.id));
    }
  };

  const handleDeleteSelectedKeys = () => {
    if (selectedKeyIdsToDelete.length === 0) return;
    terminalStore.deleteAccessKeys(selectedKeyIdsToDelete);
    setSelectedKeyIdsToDelete([]);
  };

  return (
    <div
      className={cn(
        "w-full mb-2 space-y-1.5 transition-all animate-in fade-in-50 duration-200",
        className,
      )}
    >
      {/* Latest Execution Output Drawer */}
      {latestRun && (
        <div className="rounded-2xl border border-border/70 bg-card/95 shadow-md overflow-hidden backdrop-blur-sm transition-all text-xs">
          <div className="flex items-center justify-between px-3 py-1.5 bg-muted/40 border-b border-border/40 select-none">
            <div className="flex items-center gap-2 min-w-0">
              <span className="font-mono text-3xs font-semibold text-emerald-400 flex items-center gap-1">
                <span className="size-1.5 rounded-full bg-emerald-400" />$ {latestRun.command}
              </span>
              <span
                className={cn(
                  "text-3xs font-mono px-1.5 py-0.2 rounded-full",
                  latestRun.status === "success"
                    ? "bg-emerald-500/15 text-emerald-400 border border-emerald-500/30"
                    : latestRun.status === "error"
                      ? "bg-destructive/15 text-destructive border border-destructive/30"
                      : "bg-muted text-muted-foreground",
                )}
              >
                {latestRun.status === "running"
                  ? "Running..."
                  : latestRun.exitCode !== undefined
                    ? `exit ${latestRun.exitCode}`
                    : latestRun.status}
              </span>
            </div>

            <div className="flex items-center gap-1 shrink-0">
              <button
                type="button"
                onClick={handleCopyOutput}
                title="Copy output"
                className="p-1 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-colors cursor-pointer"
              >
                {copied ? (
                  <Check className="size-3 text-emerald-400" />
                ) : (
                  <Copy className="size-3" />
                )}
              </button>
              <button
                type="button"
                onClick={() => setIsOutputCollapsed(!isOutputCollapsed)}
                title={isOutputCollapsed ? "Expand output" : "Collapse output"}
                className="p-1 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-colors cursor-pointer"
              >
                {isOutputCollapsed ? (
                  <ChevronDown className="size-3" />
                ) : (
                  <ChevronUp className="size-3" />
                )}
              </button>
              <button
                type="button"
                onClick={() => {
                  terminalStore.removeRun(latestRun.id);
                  setLatestRun(null);
                }}
                title="Dismiss output"
                className="p-1 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-colors cursor-pointer"
              >
                <X className="size-3" />
              </button>
            </div>
          </div>

          {!isOutputCollapsed && (
            <div className="p-3 max-h-48 overflow-y-auto font-mono text-3xs leading-relaxed space-y-1 bg-black/40">
              {latestRun.stdout && (
                <pre className="text-zinc-200 whitespace-pre-wrap break-all select-text">
                  {latestRun.stdout}
                </pre>
              )}
              {latestRun.stderr && (
                <pre className="text-rose-400 whitespace-pre-wrap break-all select-text">
                  {latestRun.stderr}
                </pre>
              )}
              {!latestRun.stdout && !latestRun.stderr && latestRun.status === "success" && (
                <span className="text-muted-foreground italic">
                  (Command completed with no output)
                </span>
              )}
            </div>
          )}
        </div>
      )}

      {/* Sleek Single-Line Command Input Bar */}
      <div className="flex items-center gap-2 rounded-2xl border border-emerald-500/35 bg-card/90 px-3 py-1.5 shadow-sm focus-within:border-emerald-500/70 focus-within:ring-2 focus-within:ring-emerald-500/20 transition-all">
        {/* Terminal Icon & Prompt */}
        <div className="flex items-center gap-1.5 shrink-0 select-none text-emerald-400">
          <Terminal className="size-3.5" />
          <span className="font-mono text-3xs font-semibold text-muted-foreground hidden sm:inline">
            cmd:
          </span>
        </div>

        {/* Command Input Field */}
        <input
          ref={inputRef}
          type="text"
          value={command}
          onChange={(e) => setCommand(e.target.value)}
          onKeyDown={handleKeyDown}
          disabled={isRunning}
          placeholder="Run shell command directly (e.g. ls -la, git status, bun run dev)..."
          className="flex-1 min-w-0 bg-transparent text-xs text-foreground placeholder:text-muted-foreground/60 focus:outline-none font-mono"
        />

        {/* Send / Run Button */}
        <div className="flex items-center gap-1 shrink-0">
          <button
            type="button"
            onClick={handleExecute}
            disabled={!command.trim() || isRunning}
            title="Execute Command (Enter)"
            className={cn(
              "inline-flex items-center justify-center size-7 rounded-xl transition-all cursor-pointer",
              command.trim() && !isRunning
                ? "bg-emerald-500 hover:bg-emerald-600 text-white shadow-xs"
                : "text-muted-foreground/40 hover:text-muted-foreground cursor-not-allowed",
            )}
          >
            {isRunning ? (
              <Loader2 className="size-3.5 animate-spin" />
            ) : (
              <SendHorizontal className="size-3.5" />
            )}
          </button>

          {/* Close Bar Button */}
          <button
            type="button"
            onClick={() => terminalStore.setQuickBarOpen(false)}
            title="Close Terminal Bar"
            className="inline-flex items-center justify-center size-7 rounded-xl text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors cursor-pointer"
          >
            <X className="size-3.5" />
          </button>
        </div>
      </div>

      {/* Responsive Horizontal Strip for Projects & SSH Access Keys */}
      <div className="relative flex items-center gap-1 px-1 py-1 rounded-2xl bg-card/75 border border-border/50 text-2xs backdrop-blur-md select-none shadow-xs">
        {/* Left Scroll Arrow Button */}
        <button
          type="button"
          onClick={scrollLeft}
          title="Scroll left"
          className="shrink-0 p-1 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-colors cursor-pointer"
        >
          <ChevronLeft className="size-3.5" />
        </button>

        {/* Horizontal Scrollable Container */}
        <div
          ref={scrollContainerRef}
          className="flex-1 flex items-center gap-1.5 overflow-x-auto py-0.5 px-0.5 scroll-smooth [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden"
        >
          {/* Projects Badge / Label */}
          <div className="flex items-center gap-1 px-1.5 py-0.5 rounded-lg bg-emerald-500/10 text-emerald-400 font-semibold text-3xs shrink-0 border border-emerald-500/20">
            <Folder className="size-3" />
            <span>Projects:</span>
          </div>

          {/* List of Projects */}
          {projects.length === 0 ? (
            <span className="text-3xs text-muted-foreground italic shrink-0 px-1">
              (No projects yet)
            </span>
          ) : (
            projects.map((project) => {
              const isSelected =
                store.selectedProjectId === project.id ||
                (!store.selectedProjectId && effectiveCwd === project.workspaceRoot);
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
                    "flex items-center gap-1.5 px-2.5 py-1 rounded-xl text-3xs font-medium shrink-0 transition-all cursor-pointer border",
                    isSelected
                      ? "bg-emerald-500/20 text-emerald-300 border-emerald-500/50 shadow-xs ring-1 ring-emerald-500/20 font-semibold"
                      : "bg-muted/40 hover:bg-muted/70 text-muted-foreground hover:text-foreground border-border/40",
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
          <div className="w-px h-4 bg-border/60 mx-1 shrink-0" />

          {/* SSH Servers Badge / Label */}
          <div className="flex items-center gap-1 px-1.5 py-0.5 rounded-lg bg-sky-500/10 text-sky-400 font-semibold text-3xs shrink-0 border border-sky-500/20">
            <Server className="size-3" />
            <span>SSH Servers:</span>
          </div>

          {/* List of SSH Access Keys */}
          {store.accessKeys
            .filter((k) => k.type === "ssh" || k.host)
            .map((key) => {
              const isSelected =
                store.selectedKeyId === key.id ||
                (!store.selectedKeyId && key.enabled && activeSshKey?.id === key.id);
              return (
                <button
                  key={key.id}
                  type="button"
                  onClick={() => terminalStore.setSelectedKey(key.id)}
                  title={`SSH Server: ${key.name}\nHost: ${key.user || "root"}@${key.host}:${key.port || 22}\nNotes: ${key.notes || "None"}`}
                  className={cn(
                    "flex items-center gap-1.5 px-2.5 py-1 rounded-xl text-3xs font-medium shrink-0 transition-all cursor-pointer border",
                    isSelected
                      ? "bg-sky-500/20 text-sky-300 border-sky-500/50 shadow-xs ring-1 ring-sky-500/20 font-semibold"
                      : "bg-muted/40 hover:bg-muted/70 text-muted-foreground hover:text-foreground border-border/40",
                  )}
                >
                  <Key className="size-3 text-sky-400 shrink-0" />
                  <span className="truncate max-w-[110px] sm:max-w-[150px] font-medium">
                    {key.name}
                  </span>
                  {key.host && (
                    <span className="text-4xs opacity-75 font-mono hidden md:inline">
                      ({key.user || "root"}@{key.host})
                    </span>
                  )}
                  {isSelected && <Check className="size-2.5 text-sky-400 shrink-0" />}
                </button>
              );
            })}

          {/* Quick Add Button inside strip if no SSH keys */}
          {store.accessKeys.filter((k) => k.type === "ssh" || k.host).length === 0 && (
            <button
              type="button"
              onClick={() => {
                setModalTab("add");
                setShowManageModal(true);
              }}
              className="flex items-center gap-1 px-2 py-1 rounded-xl bg-sky-500/10 text-sky-400 hover:bg-sky-500/20 border border-sky-500/30 text-3xs shrink-0 cursor-pointer transition-colors"
            >
              <Plus className="size-3" />
              <span>Add SSH Server</span>
            </button>
          )}
        </div>

        {/* Right Scroll Arrow Button */}
        <button
          type="button"
          onClick={scrollRight}
          title="Scroll right"
          className="shrink-0 p-1 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-colors cursor-pointer"
        >
          <ChevronRight className="size-3.5" />
        </button>

        {/* More (⋮) Options Button */}
        <button
          type="button"
          onClick={() => setShowManageModal(true)}
          title="Manage SSH Keys & Servers"
          className="shrink-0 p-1.5 rounded-xl text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-colors cursor-pointer"
        >
          <MoreVertical className="size-3.5" />
        </button>
      </div>

      {/* Target Context Summary Info Line */}
      <div className="flex items-center justify-between px-2 text-3xs text-muted-foreground select-none font-mono">
        <div className="flex items-center gap-1.5 min-w-0 truncate">
          <span className="text-zinc-500">Target Context:</span>
          <span className="text-emerald-400 font-semibold truncate">
            {activeProject ? activeProject.title : "Default Project"}
          </span>
          <span className="text-zinc-600">→</span>
          <span className="text-sky-400 font-semibold truncate">
            {activeSshKey
              ? `${activeSshKey.name} (${activeSshKey.user || "root"}@${activeSshKey.host})`
              : "Local VPS (Root)"}
          </span>
        </div>
        <div className="shrink-0 text-zinc-500 text-4xs">
          AI Aware &bull; {store.accessKeys.length} Keys
        </div>
      </div>

      {/* More (⋮) Modal: Add & Manage SSH Keys */}
      {showManageModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in-50 duration-150">
          <div className="w-full max-w-lg rounded-2xl border border-border/80 bg-card p-5 shadow-2xl space-y-4 text-xs">
            {/* Modal Header */}
            <div className="flex items-center justify-between border-b border-border/50 pb-3">
              <div className="flex items-center gap-2">
                <ShieldCheck className="size-4 text-sky-400" />
                <h3 className="font-semibold text-sm text-foreground">
                  SSH Server Access & Key Manager
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setShowManageModal(false)}
                className="p-1 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-colors cursor-pointer"
              >
                <X className="size-4" />
              </button>
            </div>

            {/* Modal Tabs */}
            <div className="flex items-center gap-2 border-b border-border/40 pb-2">
              <button
                type="button"
                onClick={() => setModalTab("add")}
                className={cn(
                  "px-3 py-1.5 rounded-xl font-medium transition-colors cursor-pointer",
                  modalTab === "add"
                    ? "bg-sky-500/15 text-sky-400 border border-sky-500/30"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                + Add New SSH Key
              </button>
              <button
                type="button"
                onClick={() => setModalTab("manage")}
                className={cn(
                  "px-3 py-1.5 rounded-xl font-medium transition-colors cursor-pointer",
                  modalTab === "manage"
                    ? "bg-sky-500/15 text-sky-400 border border-sky-500/30"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                Manage & Delete Keys ({store.accessKeys.length})
              </button>
            </div>

            {/* Tab 1: Add New SSH Key Form */}
            {modalTab === "add" && (
              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-3xs font-semibold text-muted-foreground block mb-1">
                      Server / Key Title *
                    </label>
                    <input
                      type="text"
                      placeholder="e.g. Production VPS, AWS Staging"
                      value={newKeyName}
                      onChange={(e) => setNewKeyName(e.target.value)}
                      className="w-full px-3 py-1.5 rounded-xl bg-muted/40 border border-border/60 text-foreground placeholder:text-muted-foreground/50 text-xs focus:outline-none focus:border-sky-500"
                    />
                  </div>
                  <div>
                    <label className="text-3xs font-semibold text-muted-foreground block mb-1">
                      Host IP or Domain *
                    </label>
                    <input
                      type="text"
                      placeholder="e.g. 201.18.218.29 or vps.example.com"
                      value={newKeyHost}
                      onChange={(e) => setNewKeyHost(e.target.value)}
                      className="w-full px-3 py-1.5 rounded-xl bg-muted/40 border border-border/60 text-foreground placeholder:text-muted-foreground/50 text-xs font-mono focus:outline-none focus:border-sky-500"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-3xs font-semibold text-muted-foreground block mb-1">
                      Username
                    </label>
                    <input
                      type="text"
                      placeholder="root"
                      value={newKeyUser}
                      onChange={(e) => setNewKeyUser(e.target.value)}
                      className="w-full px-3 py-1.5 rounded-xl bg-muted/40 border border-border/60 text-foreground placeholder:text-muted-foreground/50 text-xs font-mono focus:outline-none focus:border-sky-500"
                    />
                  </div>
                  <div>
                    <label className="text-3xs font-semibold text-muted-foreground block mb-1">
                      SSH Port
                    </label>
                    <input
                      type="number"
                      placeholder="22"
                      value={newKeyPort}
                      onChange={(e) => setNewKeyPort(e.target.value)}
                      className="w-full px-3 py-1.5 rounded-xl bg-muted/40 border border-border/60 text-foreground placeholder:text-muted-foreground/50 text-xs font-mono focus:outline-none focus:border-sky-500"
                    />
                  </div>
                </div>

                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="text-3xs font-semibold text-muted-foreground">
                      SSH Private Key or Password (Optional)
                    </label>
                    <button
                      type="button"
                      onClick={() => setShowSecret(!showSecret)}
                      className="text-3xs text-muted-foreground hover:text-foreground flex items-center gap-1 cursor-pointer"
                    >
                      {showSecret ? <EyeOff className="size-3" /> : <Eye className="size-3" />}
                      <span>{showSecret ? "Hide" : "Show"}</span>
                    </button>
                  </div>
                  <textarea
                    rows={2}
                    placeholder="Enter SSH password or paste -----BEGIN OPENSSH PRIVATE KEY-----"
                    value={newKeySecret}
                    onChange={(e) => setNewKeySecret(e.target.value)}
                    className="w-full px-3 py-1.5 rounded-xl bg-muted/40 border border-border/60 text-foreground placeholder:text-muted-foreground/50 text-xs font-mono focus:outline-none focus:border-sky-500 resize-none"
                  />
                </div>

                <div>
                  <label className="text-3xs font-semibold text-muted-foreground block mb-1">
                    Notes / Description
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. Main production deployment server for autojobs"
                    value={newKeyNotes}
                    onChange={(e) => setNewKeyNotes(e.target.value)}
                    className="w-full px-3 py-1.5 rounded-xl bg-muted/40 border border-border/60 text-foreground placeholder:text-muted-foreground/50 text-xs focus:outline-none focus:border-sky-500"
                  />
                </div>

                <div className="flex items-center justify-end gap-2 pt-2 border-t border-border/40">
                  <button
                    type="button"
                    onClick={() => setShowManageModal(false)}
                    className="px-3.5 py-1.5 rounded-xl text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={handleSaveKey}
                    disabled={!newKeyName.trim() || !newKeyHost.trim()}
                    className="px-4 py-1.5 rounded-xl bg-sky-500 hover:bg-sky-600 disabled:opacity-40 text-white font-semibold transition-colors cursor-pointer"
                  >
                    Save Server Key
                  </button>
                </div>
              </div>
            )}

            {/* Tab 2: Manage & Delete Keys */}
            {modalTab === "manage" && (
              <div className="space-y-3">
                {/* Actions row: Select all & Batch Delete */}
                <div className="flex items-center justify-between py-1 border-b border-border/40">
                  <button
                    type="button"
                    onClick={handleSelectAllKeysToDelete}
                    className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground cursor-pointer"
                  >
                    {selectedKeyIdsToDelete.length > 0 &&
                    selectedKeyIdsToDelete.length === store.accessKeys.length ? (
                      <CheckSquare className="size-3.5 text-sky-400" />
                    ) : (
                      <Square className="size-3.5" />
                    )}
                    <span>
                      {selectedKeyIdsToDelete.length === store.accessKeys.length
                        ? "Deselect All"
                        : "Select All"}
                    </span>
                  </button>

                  {selectedKeyIdsToDelete.length > 0 && (
                    <button
                      type="button"
                      onClick={handleDeleteSelectedKeys}
                      className="flex items-center gap-1 px-3 py-1 rounded-xl bg-rose-500/15 text-rose-400 border border-rose-500/30 hover:bg-rose-500/25 transition-colors cursor-pointer"
                    >
                      <Trash2 className="size-3" />
                      <span>Delete Selected ({selectedKeyIdsToDelete.length})</span>
                    </button>
                  )}
                </div>

                {/* Keys List */}
                <div className="max-h-60 overflow-y-auto space-y-2 pr-1">
                  {store.accessKeys.length === 0 ? (
                    <div className="text-center py-6 text-muted-foreground italic text-xs">
                      No SSH access keys saved yet.
                    </div>
                  ) : (
                    store.accessKeys.map((key) => {
                      const isChecked = selectedKeyIdsToDelete.includes(key.id);
                      return (
                        <div
                          key={key.id}
                          className={cn(
                            "flex items-center justify-between p-2.5 rounded-xl border transition-colors",
                            isChecked
                              ? "bg-rose-500/10 border-rose-500/30"
                              : "bg-muted/30 border-border/50 hover:bg-muted/50",
                          )}
                        >
                          <div className="flex items-center gap-2.5 min-w-0">
                            <button
                              type="button"
                              onClick={() => toggleSelectKeyToDelete(key.id)}
                              className="cursor-pointer text-muted-foreground hover:text-foreground"
                            >
                              {isChecked ? (
                                <CheckSquare className="size-4 text-rose-400" />
                              ) : (
                                <Square className="size-4" />
                              )}
                            </button>

                            <div className="min-w-0">
                              <div className="flex items-center gap-2">
                                <span className="font-semibold text-foreground truncate">
                                  {key.name}
                                </span>
                                <span className="text-4xs px-1.5 py-0.2 rounded-full bg-sky-500/15 text-sky-400 font-mono">
                                  {key.type}
                                </span>
                              </div>
                              <div className="text-3xs text-muted-foreground font-mono truncate">
                                {key.user || "root"}@{key.host || "localhost"}:{key.port || 22}
                              </div>
                              {key.notes && (
                                <div className="text-3xs text-zinc-500 truncate">{key.notes}</div>
                              )}
                            </div>
                          </div>

                          <div className="flex items-center gap-2 shrink-0">
                            {/* Toggle active state */}
                            <button
                              type="button"
                              onClick={() => terminalStore.toggleAccessKey(key.id)}
                              className={cn(
                                "text-3xs px-2 py-0.5 rounded-lg border font-medium cursor-pointer transition-colors",
                                key.enabled
                                  ? "bg-emerald-500/15 text-emerald-400 border-emerald-500/30"
                                  : "bg-muted/40 text-muted-foreground border-border/40",
                              )}
                            >
                              {key.enabled ? "Active" : "Disabled"}
                            </button>

                            {/* Delete single key */}
                            <button
                              type="button"
                              onClick={() => terminalStore.removeAccessKey(key.id)}
                              title="Delete key"
                              className="p-1 rounded-lg text-muted-foreground hover:text-rose-400 hover:bg-rose-500/10 transition-colors cursor-pointer"
                            >
                              <Trash2 className="size-3.5" />
                            </button>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>

                <div className="flex justify-end pt-2 border-t border-border/40">
                  <button
                    type="button"
                    onClick={() => setShowManageModal(false)}
                    className="px-4 py-1.5 rounded-xl bg-muted/60 hover:bg-muted text-foreground transition-colors cursor-pointer"
                  >
                    Done
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
});
