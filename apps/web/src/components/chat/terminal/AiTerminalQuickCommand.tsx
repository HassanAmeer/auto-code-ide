import { useState, useRef, useEffect, useCallback } from "react";
import {
  Terminal,
  Play,
  Folder,
  ChevronDown,
  Sparkles,
  X,
  SlidersHorizontal,
  Server,
  Globe,
  Plus,
  Trash2,
} from "lucide-react";
import { useTerminalStore, terminalStore } from "./terminalStore";
import type { SshProfile } from "./terminalTypes";

export interface AiTerminalQuickCommandProps {
  projectCwd?: string | undefined;
  onCommandRun?: ((command: string) => void) | undefined;
  className?: string | undefined;
}

const COMMON_PRESETS = [
  { label: "ls -la", cmd: "ls -la" },
  { label: "df -h", cmd: "df -h" },
  { label: "free -m", cmd: "free -m" },
  { label: "pm2 status", cmd: "pm2 status" },
  { label: "docker ps", cmd: "docker ps" },
  { label: "ss -tulpn", cmd: "ss -tulpn" },
  { label: "uname -a", cmd: "uname -a" },
];

export function AiTerminalQuickCommand({
  projectCwd,
  onCommandRun,
  className = "",
}: AiTerminalQuickCommandProps) {
  const store = useTerminalStore();
  const [command, setCommand] = useState("");
  const [historyIndex, setHistoryIndex] = useState<number | null>(null);
  const [isEditingCwd, setIsEditingCwd] = useState(false);
  const [customCwd, setCustomCwd] = useState(store.activeCwd);
  const [isRunning, setIsRunning] = useState(false);
  const [showPresets, setShowPresets] = useState(false);
  const [showTargetMenu, setShowTargetMenu] = useState(false);
  const [showNewSshModal, setShowNewSshModal] = useState(false);

  // New SSH profile form state
  const [newSshLabel, setNewSshLabel] = useState("");
  const [newSshHost, setNewSshHost] = useState("");
  const [newSshUser, setNewSshUser] = useState("root");
  const [newSshPort, setNewSshPort] = useState("22");

  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setCustomCwd(store.activeCwd);
  }, [store.activeCwd]);

  const handleRun = useCallback(
    async (cmdToRun?: string, modeOverride?: "bash" | "ai") => {
      const targetCmd = (cmdToRun || command).trim();
      if (!targetCmd || isRunning) return;

      setIsRunning(true);
      try {
        setCommand("");
        setHistoryIndex(null);
        await terminalStore.runCommand(targetCmd, store.activeCwd, modeOverride ?? store.inputMode);
        if (onCommandRun) {
          onCommandRun(targetCmd);
        }
      } finally {
        setIsRunning(false);
        inputRef.current?.focus();
      }
    },
    [command, isRunning, store.activeCwd, store.inputMode, onCommandRun],
  );

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      void handleRun();
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      if (store.history.length === 0) return;
      const nextIndex =
        historyIndex === null ? 0 : Math.min(historyIndex + 1, store.history.length - 1);
      setHistoryIndex(nextIndex);
      setCommand(store.history[nextIndex] || "");
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      if (historyIndex === null) return;
      const nextIndex = historyIndex - 1;
      if (nextIndex < 0) {
        setHistoryIndex(null);
        setCommand("");
      } else {
        setHistoryIndex(nextIndex);
        setCommand(store.history[nextIndex] || "");
      }
    }
  };

  const toggleCwd = () => {
    if (store.activeCwd === "/") {
      terminalStore.setActiveCwd(projectCwd || "/home");
    } else {
      terminalStore.setActiveCwd("/");
    }
  };

  const handleSaveCustomCwd = () => {
    const trimmed = customCwd.trim() || "/";
    terminalStore.setActiveCwd(trimmed);
    setIsEditingCwd(false);
  };

  const handleCreateSsh = () => {
    if (!newSshHost.trim()) return;
    const profile: SshProfile = {
      id: "ssh_" + Date.now(),
      label: newSshLabel.trim() || newSshHost.trim(),
      user: newSshUser.trim() || "root",
      host: newSshHost.trim(),
      port: Number(newSshPort) || 22,
    };
    terminalStore.addSshProfile(profile);
    setShowNewSshModal(false);
    setShowTargetMenu(false);
    setNewSshHost("");
    setNewSshLabel("");
  };

  const activeSshProfile = store.sshProfiles.find((p) => p.id === store.activeTarget);

  if (!store.isQuickBarOpen) {
    return (
      <div className={`flex items-center justify-end px-3 py-1 text-2xs ${className}`}>
        <button
          type="button"
          onClick={() => terminalStore.setQuickBarOpen(true)}
          className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-secondary/80 hover:bg-secondary text-secondary-foreground border border-border/50 hover:border-primary/50 transition-all font-mono shadow-sm"
          title="Open AI Terminal Quick Command Bar"
        >
          <Terminal className="size-3 text-emerald-400" />
          <span>$ AI Terminal</span>
        </button>
      </div>
    );
  }

  return (
    <div
      className={`w-full mb-2.5 rounded-2xl border border-zinc-800 bg-[#0d121c]/95 backdrop-blur-md p-2.5 shadow-xl transition-all ${className}`}
    >
      {/* Top Bar: Controls & Status */}
      <div className="flex items-center justify-between gap-2 pb-2 px-1 border-b border-zinc-800/60 text-2xs select-none">
        <div className="flex items-center flex-wrap gap-2">
          {/* Logo / Title */}
          <span className="flex items-center gap-1.5 font-mono font-semibold text-emerald-400">
            <Terminal className="size-3.5 text-emerald-400" />
            <span>AI Terminal</span>
          </span>

          {/* Mode Switcher: Raw Shell vs AI Prompt */}
          <div className="flex items-center rounded-lg bg-zinc-900 border border-zinc-800 p-0.5 text-2xs">
            <button
              type="button"
              onClick={() => terminalStore.setInputMode("bash")}
              className={`px-2 py-0.5 rounded-md font-mono transition-colors ${
                store.inputMode === "bash"
                  ? "bg-emerald-500/20 text-emerald-400 font-semibold"
                  : "text-zinc-400 hover:text-zinc-200"
              }`}
            >
              $ Bash
            </button>
            <button
              type="button"
              onClick={() => terminalStore.setInputMode("ai")}
              className={`flex items-center gap-1 px-2 py-0.5 rounded-md transition-colors ${
                store.inputMode === "ai"
                  ? "bg-purple-500/20 text-purple-400 font-semibold"
                  : "text-zinc-400 hover:text-zinc-200"
              }`}
            >
              <Sparkles className="size-2.5" />
              <span>✨ AI Prompt</span>
            </button>
          </div>

          {/* Target Environment: Local VPS vs Remote SSH */}
          <div className="relative">
            <button
              type="button"
              onClick={() => setShowTargetMenu(!showTargetMenu)}
              className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-zinc-800/80 hover:bg-zinc-800 text-zinc-300 font-mono border border-zinc-700/60 transition-colors"
              title="Select target server: Local host or Remote SSH"
            >
              {activeSshProfile ? (
                <>
                  <Globe className="size-2.5 text-sky-400" />
                  <span className="text-sky-300 font-medium">SSH: {activeSshProfile.label}</span>
                </>
              ) : (
                <>
                  <Server className="size-2.5 text-emerald-400" />
                  <span>Host VPS (Root)</span>
                </>
              )}
              <ChevronDown className="size-2.5 text-zinc-500" />
            </button>

            {/* Target Dropdown Menu */}
            {showTargetMenu && (
              <div className="absolute left-0 top-7 z-50 w-56 rounded-xl border border-zinc-800 bg-[#12161f] p-1.5 shadow-2xl">
                <div className="px-2 py-1 text-3xs font-semibold uppercase tracking-wider text-zinc-500">
                  Target Environment
                </div>
                <button
                  type="button"
                  onClick={() => {
                    terminalStore.setActiveTarget("local");
                    setShowTargetMenu(false);
                  }}
                  className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg text-xs font-mono transition-colors ${
                    store.activeTarget === "local"
                      ? "bg-emerald-500/15 text-emerald-300"
                      : "text-zinc-300 hover:bg-zinc-800"
                  }`}
                >
                  <span className="flex items-center gap-1.5">
                    <Server className="size-3 text-emerald-400" />
                    <span>Local Host VPS (Root)</span>
                  </span>
                  {store.activeTarget === "local" && (
                    <span className="text-emerald-400 text-3xs">✓</span>
                  )}
                </button>

                {store.sshProfiles.map((profile) => (
                  <div
                    key={profile.id}
                    className="flex items-center justify-between px-2 py-1 rounded-lg hover:bg-zinc-800/80 group"
                  >
                    <button
                      type="button"
                      onClick={() => {
                        terminalStore.setActiveTarget(profile.id);
                        setShowTargetMenu(false);
                      }}
                      className="flex items-center gap-1.5 text-xs font-mono text-zinc-300 group-hover:text-sky-300 truncate flex-1 text-left"
                    >
                      <Globe className="size-3 text-sky-400" />
                      <span className="truncate">{profile.label}</span>
                    </button>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        terminalStore.removeSshProfile(profile.id);
                      }}
                      className="text-zinc-600 hover:text-rose-400 p-0.5"
                      title="Remove profile"
                    >
                      <Trash2 className="size-2.5" />
                    </button>
                  </div>
                ))}

                <button
                  type="button"
                  onClick={() => {
                    setShowNewSshModal(true);
                    setShowTargetMenu(false);
                  }}
                  className="w-full flex items-center gap-1.5 px-2.5 py-1.5 mt-1 rounded-lg text-2xs text-sky-400 hover:bg-sky-500/10 border-t border-zinc-800/80 transition-colors"
                >
                  <Plus className="size-3" />
                  <span>+ Connect Remote SSH</span>
                </button>
              </div>
            )}
          </div>

          {/* CWD Selector Pill (for Local) */}
          {!activeSshProfile && (
            <>
              {isEditingCwd ? (
                <div className="flex items-center gap-1">
                  <input
                    type="text"
                    value={customCwd}
                    onChange={(e) => setCustomCwd(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && handleSaveCustomCwd()}
                    className="h-5 px-1.5 rounded bg-zinc-900 border border-zinc-700 text-zinc-200 font-mono text-2xs w-36 focus:outline-none focus:border-primary"
                    autoFocus
                  />
                  <button
                    type="button"
                    onClick={handleSaveCustomCwd}
                    className="px-1.5 py-0.5 rounded bg-primary/20 text-primary hover:bg-primary/30"
                  >
                    Save
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={toggleCwd}
                  onContextMenu={(e) => {
                    e.preventDefault();
                    setIsEditingCwd(true);
                  }}
                  title="Click to toggle root (/) vs project CWD. Right click to edit path."
                  className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-zinc-800/80 hover:bg-zinc-800 text-zinc-300 font-mono border border-zinc-700/60 transition-colors"
                >
                  <Folder className="size-2.5 text-amber-400" />
                  <span>CWD: {store.activeCwd === "/" ? "root (/)" : store.activeCwd}</span>
                </button>
              )}
            </>
          )}
        </div>

        {/* Right side controls */}
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => setShowPresets(!showPresets)}
            className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 transition-colors"
            title="Toggle quick preset commands"
          >
            <SlidersHorizontal className="size-3" />
            <span>Presets</span>
          </button>

          {store.runs.length > 0 && (
            <button
              type="button"
              onClick={() => terminalStore.clearRuns()}
              className="px-1.5 py-0.5 rounded text-zinc-500 hover:text-rose-400 transition-colors"
              title="Clear terminal history"
            >
              Clear ({store.runs.length})
            </button>
          )}

          <button
            type="button"
            onClick={() => terminalStore.setQuickBarOpen(false)}
            className="p-1 rounded text-zinc-500 hover:text-zinc-200 hover:bg-zinc-800 transition-colors"
            title="Hide quick command bar"
          >
            <X className="size-3" />
          </button>
        </div>
      </div>

      {/* Preset pills row (if toggled) */}
      {showPresets && (
        <div className="flex flex-wrap gap-1.5 py-1.5 px-1 border-b border-zinc-800/40">
          {COMMON_PRESETS.map((preset) => (
            <button
              key={preset.cmd}
              type="button"
              onClick={() => {
                setCommand(preset.cmd);
                void handleRun(preset.cmd, "bash");
              }}
              className="px-2 py-0.5 rounded bg-zinc-900/90 hover:bg-zinc-800 text-zinc-300 font-mono text-2xs border border-zinc-800 hover:border-emerald-500/50 transition-colors"
            >
              $ {preset.label}
            </button>
          ))}
        </div>
      )}

      {/* New SSH modal form (inline) */}
      {showNewSshModal && (
        <div className="p-2.5 my-1.5 rounded-xl bg-zinc-900/90 border border-sky-500/30 text-2xs space-y-2">
          <div className="flex items-center justify-between font-semibold text-sky-400">
            <span className="flex items-center gap-1.5">
              <Globe className="size-3" />
              <span>Configure Remote SSH Host (Hostinger / cPanel / AWS)</span>
            </span>
            <button
              type="button"
              onClick={() => setShowNewSshModal(false)}
              className="text-zinc-500 hover:text-zinc-300"
            >
              <X className="size-3" />
            </button>
          </div>
          <div className="grid grid-cols-4 gap-2">
            <input
              type="text"
              placeholder="Label (e.g. Hostinger VPS)"
              value={newSshLabel}
              onChange={(e) => setNewSshLabel(e.target.value)}
              className="col-span-2 px-2 py-1 rounded bg-zinc-800 border border-zinc-700 text-zinc-200"
            />
            <input
              type="text"
              placeholder="User (e.g. root)"
              value={newSshUser}
              onChange={(e) => setNewSshUser(e.target.value)}
              className="px-2 py-1 rounded bg-zinc-800 border border-zinc-700 text-zinc-200"
            />
            <input
              type="text"
              placeholder="Port (22)"
              value={newSshPort}
              onChange={(e) => setNewSshPort(e.target.value)}
              className="px-2 py-1 rounded bg-zinc-800 border border-zinc-700 text-zinc-200"
            />
          </div>
          <div className="flex items-center gap-2">
            <input
              type="text"
              placeholder="Host / IP (e.g. 195.35.12.84 or server.domain.com)"
              value={newSshHost}
              onChange={(e) => setNewSshHost(e.target.value)}
              className="flex-1 px-2 py-1 rounded bg-zinc-800 border border-zinc-700 text-zinc-200 font-mono"
            />
            <button
              type="button"
              onClick={handleCreateSsh}
              disabled={!newSshHost.trim()}
              className="px-3 py-1 rounded bg-sky-600 hover:bg-sky-500 disabled:opacity-40 text-white font-semibold"
            >
              Save Host
            </button>
          </div>
        </div>
      )}

      {/* Command Input Row */}
      <div className="flex items-center gap-2 pt-2 px-1">
        <div
          className={`flex items-center gap-2 flex-1 rounded-xl bg-[#06090f] border px-3 py-1.5 transition-all ${
            store.inputMode === "ai"
              ? "border-purple-500/40 focus-within:border-purple-500 focus-within:ring-1 focus-within:ring-purple-500/30"
              : "border-zinc-800 focus-within:border-emerald-500/70 focus-within:ring-1 focus-within:ring-emerald-500/30"
          }`}
        >
          {store.inputMode === "ai" ? (
            <Sparkles className="size-3.5 text-purple-400 select-none shrink-0" />
          ) : (
            <span className="text-emerald-400 font-mono font-bold select-none text-sm">$</span>
          )}

          <input
            ref={inputRef}
            type="text"
            value={command}
            onChange={(e) => setCommand(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={
              store.inputMode === "ai"
                ? "Ask AI in Urdu/English (e.g. 'check disk space', 'high RAM processes', 'free port 3000')..."
                : "Run raw bash command (e.g. ls -la, df -h, free -m, pm2 restart all, docker ps)..."
            }
            className="w-full bg-transparent text-xs text-zinc-100 font-mono placeholder:text-zinc-500 focus:outline-none"
            disabled={isRunning}
          />
          {command && (
            <button
              type="button"
              onClick={() => setCommand("")}
              className="text-zinc-500 hover:text-zinc-300 p-0.5"
            >
              <X className="size-3" />
            </button>
          )}
        </div>

        {/* Run Action Button */}
        <button
          type="button"
          onClick={() => void handleRun()}
          disabled={!command.trim() || isRunning}
          className={`flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-white font-medium text-xs shadow-md transition-all active:scale-95 shrink-0 disabled:opacity-40 ${
            store.inputMode === "ai"
              ? "bg-purple-600 hover:bg-purple-500"
              : "bg-emerald-600 hover:bg-emerald-500"
          }`}
        >
          <Play className={`size-3.5 fill-current ${isRunning ? "animate-spin" : ""}`} />
          <span>{isRunning ? "Running..." : "Run"}</span>
        </button>
      </div>
    </div>
  );
}
