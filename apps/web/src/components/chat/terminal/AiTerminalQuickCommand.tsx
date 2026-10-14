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
  Key,
  CheckSquare,
  Square,
  ShieldCheck,
  ShieldAlert,
  AlertTriangle,
  Eye,
  EyeOff,
  Lock,
} from "lucide-react";
import { useTerminalStore, terminalStore } from "./terminalStore";
import type { SshProfile, TerminalKeyType, TerminalAccessKey } from "./terminalTypes";
import { scanCommandSafety, type CommandSafetyScanResult } from "./terminalClient";
import { TerminalCommandsMenu } from "./TerminalCommandsMenu";
import { TerminalFileExplorerModal } from "./TerminalFileExplorerModal";
import { TerminalSystemStatsBar } from "./TerminalSystemStatsBar";

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
  const [showCommandsMenu, setShowCommandsMenu] = useState(false);
  const [showFileExplorer, setShowFileExplorer] = useState(false);

  // Access Keys Vault menu & modal state
  const [showKeysMenu, setShowKeysMenu] = useState(false);
  const [showNewKeyModal, setShowNewKeyModal] = useState(false);
  const [newKeyName, setNewKeyName] = useState("");
  const [newKeyType, setNewKeyType] = useState<TerminalKeyType>("ssh");
  const [newKeyHost, setNewKeyHost] = useState("");
  const [newKeyUser, setNewKeyUser] = useState("root");
  const [newKeyPort, setNewKeyPort] = useState("22");
  const [newKeySecret, setNewKeySecret] = useState("");
  const [newKeyNotes, setNewKeyNotes] = useState("");
  const [showSecretInModal, setShowSecretInModal] = useState(false);

  // High-risk command safety guard modal state
  const [pendingDangerousCmd, setPendingDangerousCmd] = useState<{
    cmd: string;
    scan: CommandSafetyScanResult;
    modeOverride?: "bash" | "ai" | undefined;
  } | null>(null);

  // New SSH profile form state
  const [newSshLabel, setNewSshLabel] = useState("");
  const [newSshHost, setNewSshHost] = useState("");
  const [newSshUser, setNewSshUser] = useState("root");
  const [newSshPort, setNewSshPort] = useState("22");

  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setCustomCwd(store.activeCwd);
  }, [store.activeCwd]);

  const activeKeysCount = store.accessKeys.filter((k) => k.enabled).length;

  const handleCreateKey = () => {
    if (!newKeyName.trim()) return;
    const accessKey: TerminalAccessKey = {
      id: "key_" + Date.now(),
      name: newKeyName.trim(),
      type: newKeyType,
      enabled: true,
      ...(newKeyHost.trim() ? { host: newKeyHost.trim() } : {}),
      ...(newKeyUser.trim() ? { user: newKeyUser.trim() } : {}),
      ...(newKeyPort.trim() ? { port: Number(newKeyPort) || 22 } : {}),
      ...(newKeySecret.trim() ? { secret: newKeySecret.trim() } : {}),
      ...(newKeyNotes.trim() ? { notes: newKeyNotes.trim() } : {}),
    };
    terminalStore.addAccessKey(accessKey);
    setShowNewKeyModal(false);
    setShowKeysMenu(false);
    setNewKeyName("");
    setNewKeyHost("");
    setNewKeyUser("root");
    setNewKeyPort("22");
    setNewKeySecret("");
    setNewKeyNotes("");
    setShowSecretInModal(false);
  };

  const handleRun = useCallback(
    async (cmdToRun?: string, modeOverride?: "bash" | "ai", bypassSafetyCheck = false) => {
      const targetCmd = (cmdToRun || command).trim();
      if (!targetCmd || isRunning) return;

      // 1. Safety Guard Check: catch destructive commands before execution
      if (!bypassSafetyCheck) {
        const safetyScan = scanCommandSafety(targetCmd);
        if (safetyScan && safetyScan.isDangerous) {
          setPendingDangerousCmd({
            cmd: targetCmd,
            scan: safetyScan,
            modeOverride,
          });
          return;
        }
      }

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

          {/* Access Keys & Credentials Vault (Multi-select checkmarks) */}
          <div className="relative">
            <button
              type="button"
              onClick={() => {
                setShowKeysMenu(!showKeysMenu);
                setShowTargetMenu(false);
              }}
              className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full font-mono border transition-colors ${
                activeKeysCount > 0
                  ? "bg-amber-500/15 text-amber-300 border-amber-500/40 hover:bg-amber-500/25"
                  : "bg-zinc-800/80 text-zinc-400 border-zinc-700/60 hover:text-zinc-200 hover:bg-zinc-800"
              }`}
              title="Access Keys Vault: Select active keys for AI to use via checkmarks"
            >
              <Key className="size-2.5 text-amber-400" />
              <span>
                Keys ({activeKeysCount}/{store.accessKeys.length})
              </span>
              <ChevronDown className="size-2.5 text-zinc-500" />
            </button>

            {/* Keys Dropdown Popover */}
            {showKeysMenu && (
              <div className="absolute left-0 top-7 z-50 w-72 rounded-xl border border-zinc-800 bg-[#12161f] p-2 shadow-2xl">
                <div className="flex items-center justify-between pb-1.5 mb-1.5 border-b border-zinc-800/80">
                  <div className="flex items-center gap-1.5 text-2xs font-semibold uppercase tracking-wider text-amber-400">
                    <ShieldCheck className="size-3" />
                    <span>Keys & Credentials Vault</span>
                  </div>
                  {store.accessKeys.length > 0 && (
                    <div className="flex items-center gap-1.5 text-3xs">
                      <button
                        type="button"
                        onClick={() => terminalStore.selectAllAccessKeys(true)}
                        className="text-zinc-400 hover:text-emerald-400"
                      >
                        All
                      </button>
                      <span className="text-zinc-600">|</span>
                      <button
                        type="button"
                        onClick={() => terminalStore.selectAllAccessKeys(false)}
                        className="text-zinc-400 hover:text-rose-400"
                      >
                        None
                      </button>
                    </div>
                  )}
                </div>

                {store.accessKeys.length === 0 ? (
                  <div className="py-3 px-2 text-center text-zinc-500 text-3xs">
                    No credentials stored yet. Add SSH keys, server IPs, passwords, or API tokens to
                    enable AI automated connections.
                  </div>
                ) : (
                  <div className="max-h-48 overflow-y-auto space-y-1 pr-0.5">
                    {store.accessKeys.map((k) => (
                      <div
                        key={k.id}
                        onClick={() => terminalStore.toggleAccessKey(k.id)}
                        className={`flex items-center justify-between p-1.5 rounded-lg border cursor-pointer transition-colors ${
                          k.enabled
                            ? "bg-amber-500/10 border-amber-500/30 text-zinc-200"
                            : "bg-zinc-900/60 border-zinc-800/60 text-zinc-400 hover:bg-zinc-800/60"
                        }`}
                      >
                        <div className="flex items-center gap-2 truncate flex-1 min-w-0">
                          {k.enabled ? (
                            <CheckSquare className="size-3.5 text-amber-400 shrink-0" />
                          ) : (
                            <Square className="size-3.5 text-zinc-600 shrink-0" />
                          )}
                          <div className="truncate">
                            <div className="flex items-center gap-1.5">
                              <span className="font-medium text-xs truncate">{k.name}</span>
                              <span
                                className={`px-1 py-0.2 rounded text-3xs font-mono uppercase ${
                                  k.type === "ssh"
                                    ? "bg-sky-500/20 text-sky-300"
                                    : k.type === "api"
                                      ? "bg-emerald-500/20 text-emerald-300"
                                      : k.type === "server"
                                        ? "bg-indigo-500/20 text-indigo-300"
                                        : "bg-zinc-700/50 text-zinc-300"
                                }`}
                              >
                                {k.type}
                              </span>
                            </div>
                            {(k.host || k.user) && (
                              <div className="text-3xs text-zinc-500 font-mono truncate">
                                {k.user ? `${k.user}@` : ""}
                                {k.host}
                                {k.port && k.port !== 22 ? `:${k.port}` : ""}
                              </div>
                            )}
                          </div>
                        </div>

                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            terminalStore.removeAccessKey(k.id);
                          }}
                          className="p-1 text-zinc-600 hover:text-rose-400 rounded shrink-0 transition-colors"
                          title="Remove key"
                        >
                          <Trash2 className="size-2.5" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}

                <button
                  type="button"
                  onClick={() => {
                    setShowNewKeyModal(true);
                    setShowKeysMenu(false);
                  }}
                  className="w-full flex items-center justify-center gap-1.5 px-2.5 py-1.5 mt-2 rounded-lg text-2xs text-amber-400 hover:bg-amber-500/10 border border-dashed border-amber-500/30 transition-colors font-medium"
                >
                  <Plus className="size-3" />
                  <span>+ Add Key / Credential</span>
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
        <div className="flex items-center gap-1.5 flex-wrap">
          {/* Commands Library Button */}
          <button
            type="button"
            onClick={() => setShowCommandsMenu(true)}
            className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-lg bg-purple-500/15 hover:bg-purple-500/25 border border-purple-500/30 text-purple-300 font-medium text-2xs transition-all hover:scale-105 active:scale-95"
            title="Open Commands Library with Urdu/English explanations"
          >
            <Sparkles className="size-3 text-purple-400" />
            <span>⚡ Commands Library</span>
          </button>

          {/* Browse Files Button */}
          <button
            type="button"
            onClick={() => setShowFileExplorer(true)}
            className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-lg bg-amber-500/15 hover:bg-amber-500/25 border border-amber-500/30 text-amber-300 font-medium text-2xs transition-all hover:scale-105 active:scale-95"
            title="Browse server files & folders, peek and download"
          >
            <Folder className="size-3 text-amber-400" />
            <span>📁 Browse Files</span>
          </button>

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

      {/* New Key & Credential Modal Form */}
      {showNewKeyModal && (
        <div className="p-3 my-2 rounded-xl bg-zinc-900/95 border border-amber-500/40 text-2xs space-y-2.5 shadow-2xl">
          <div className="flex items-center justify-between font-semibold text-amber-400 border-b border-zinc-800 pb-1.5">
            <span className="flex items-center gap-1.5">
              <Key className="size-3.5 text-amber-400" />
              <span>Add Access Key / Server Credential / API Token</span>
            </span>
            <button
              type="button"
              onClick={() => setShowNewKeyModal(false)}
              className="text-zinc-500 hover:text-zinc-300"
            >
              <X className="size-3" />
            </button>
          </div>

          <div className="grid grid-cols-3 gap-2">
            <div>
              <label className="text-3xs text-zinc-400 block mb-1">Key / Credential Type</label>
              <select
                value={newKeyType}
                onChange={(e) => setNewKeyType(e.target.value as TerminalKeyType)}
                className="w-full px-2 py-1 rounded bg-zinc-800 border border-zinc-700 text-zinc-200"
              >
                <option value="ssh">SSH Key / Server</option>
                <option value="server">Server IP / Password</option>
                <option value="api">API Token / Bearer</option>
                <option value="custom">Custom Credential</option>
              </select>
            </div>

            <div className="col-span-2">
              <label className="text-3xs text-zinc-400 block mb-1">Name / Label</label>
              <input
                type="text"
                placeholder="e.g. Production VPS, Hostinger Node, Cloudflare Token"
                value={newKeyName}
                onChange={(e) => setNewKeyName(e.target.value)}
                className="w-full px-2 py-1 rounded bg-zinc-800 border border-zinc-700 text-zinc-200"
              />
            </div>
          </div>

          {(newKeyType === "ssh" || newKeyType === "server") && (
            <div className="grid grid-cols-4 gap-2">
              <div className="col-span-2">
                <label className="text-3xs text-zinc-400 block mb-1">Host / IP</label>
                <input
                  type="text"
                  placeholder="e.g. 192.168.1.100 or vps.domain.com"
                  value={newKeyHost}
                  onChange={(e) => setNewKeyHost(e.target.value)}
                  className="w-full px-2 py-1 rounded bg-zinc-800 border border-zinc-700 text-zinc-200 font-mono"
                />
              </div>
              <div>
                <label className="text-3xs text-zinc-400 block mb-1">User</label>
                <input
                  type="text"
                  placeholder="root"
                  value={newKeyUser}
                  onChange={(e) => setNewKeyUser(e.target.value)}
                  className="w-full px-2 py-1 rounded bg-zinc-800 border border-zinc-700 text-zinc-200 font-mono"
                />
              </div>
              <div>
                <label className="text-3xs text-zinc-400 block mb-1">Port</label>
                <input
                  type="text"
                  placeholder="22"
                  value={newKeyPort}
                  onChange={(e) => setNewKeyPort(e.target.value)}
                  className="w-full px-2 py-1 rounded bg-zinc-800 border border-zinc-700 text-zinc-200 font-mono"
                />
              </div>
            </div>
          )}

          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="text-3xs text-zinc-400 flex items-center gap-1">
                <Lock className="size-2.5 text-amber-400" />
                <span>
                  {newKeyType === "api"
                    ? "API Key / Token"
                    : newKeyType === "ssh"
                      ? "SSH Private Key or Password (Optional)"
                      : "Password / Secret (Optional)"}
                </span>
              </label>
              <button
                type="button"
                onClick={() => setShowSecretInModal(!showSecretInModal)}
                className="text-3xs text-zinc-500 hover:text-zinc-300 flex items-center gap-1"
              >
                {showSecretInModal ? (
                  <>
                    <EyeOff className="size-2.5" /> <span>Hide</span>
                  </>
                ) : (
                  <>
                    <Eye className="size-2.5" /> <span>Show</span>
                  </>
                )}
              </button>
            </div>
            <input
              type={showSecretInModal ? "text" : "password"}
              placeholder="Paste password, private key path/string, or API token here..."
              value={newKeySecret}
              onChange={(e) => setNewKeySecret(e.target.value)}
              className="w-full px-2 py-1 rounded bg-zinc-800 border border-zinc-700 text-zinc-200 font-mono"
            />
          </div>

          <div className="flex items-center justify-end gap-2 pt-1 border-t border-zinc-800">
            <button
              type="button"
              onClick={() => setShowNewKeyModal(false)}
              className="px-2.5 py-1 rounded text-zinc-400 hover:text-zinc-200"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleCreateKey}
              disabled={!newKeyName.trim()}
              className="px-3.5 py-1 rounded bg-amber-600 hover:bg-amber-500 disabled:opacity-40 text-white font-semibold flex items-center gap-1.5 shadow"
            >
              <Plus className="size-3" />
              <span>Save to Vault</span>
            </button>
          </div>
        </div>
      )}

      {/* High-Risk Destructive Command Safety Guard Confirmation Modal */}
      {pendingDangerousCmd && (
        <div className="p-3.5 my-2.5 rounded-xl bg-rose-950/90 border-2 border-rose-500 text-xs space-y-2.5 shadow-2xl animate-in fade-in zoom-in-95">
          <div className="flex items-center justify-between font-bold text-rose-300 border-b border-rose-800 pb-2">
            <span className="flex items-center gap-2">
              <ShieldAlert className="size-4 text-rose-400" />
              <span>Safety Guard: High-Risk Destructive Command</span>
            </span>
            <button
              type="button"
              onClick={() => setPendingDangerousCmd(null)}
              className="text-zinc-400 hover:text-white"
            >
              <X className="size-3.5" />
            </button>
          </div>

          <div className="text-zinc-200">
            <p className="text-2xs text-rose-200 font-sans leading-relaxed mb-2">
              {pendingDangerousCmd.scan.reason}
            </p>
            <div className="p-2.5 rounded-lg bg-black/70 font-mono text-xs text-rose-300 border border-rose-800/60 break-all select-all">
              <span className="text-rose-500 font-bold">$ </span>
              {pendingDangerousCmd.cmd}
            </div>
          </div>

          <div className="flex items-center justify-between pt-1">
            <div className="flex items-center gap-1.5 text-3xs font-mono text-rose-300/90 uppercase tracking-wide">
              <span className="size-2 rounded-full bg-rose-500 animate-ping" />
              <span>Severity: {pendingDangerousCmd.scan.severity}</span>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setPendingDangerousCmd(null)}
                className="px-3 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-xs font-medium transition-colors"
              >
                Cancel Command
              </button>
              <button
                type="button"
                onClick={() => {
                  const toRun = pendingDangerousCmd.cmd;
                  const mode = pendingDangerousCmd.modeOverride;
                  setPendingDangerousCmd(null);
                  void handleRun(toRun, mode, true);
                }}
                className="px-3 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-500 text-white text-xs font-semibold shadow transition-all hover:scale-105 active:scale-95"
              >
                Force Execute Anyway
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Active Keys Strip (Selected checkmarks active in AI execution context) */}
      {activeKeysCount > 0 && (
        <div className="flex items-center gap-1.5 px-1 py-1 overflow-x-auto text-3xs border-b border-zinc-800/40">
          <span className="text-zinc-500 flex items-center gap-1 shrink-0 font-medium">
            <Key className="size-2.5 text-amber-400" />
            <span>Active Keys for AI:</span>
          </span>
          {store.accessKeys
            .filter((k) => k.enabled)
            .map((k) => (
              <span
                key={k.id}
                className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-amber-500/15 border border-amber-500/30 text-amber-300 font-mono shrink-0"
              >
                <span>{k.name}</span>
                {k.host && <span className="text-zinc-400">({k.host})</span>}
                <button
                  type="button"
                  onClick={() => terminalStore.toggleAccessKey(k.id)}
                  className="hover:text-rose-400 text-zinc-400 ml-0.5"
                  title="Uncheck this key"
                >
                  <X className="size-2.5" />
                </button>
              </span>
            ))}
        </div>
      )}

      {/* Live Server Telemetry Specs Bar (CPU, RAM, ROM/Disk) */}
      <div className="pt-1.5 px-1">
        <TerminalSystemStatsBar />
      </div>

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

      {/* Commands Library Modal */}
      <TerminalCommandsMenu
        isOpen={showCommandsMenu}
        onClose={() => setShowCommandsMenu(false)}
        onSelectCommand={(cmd, autoRun) => {
          setCommand(cmd);
          if (autoRun) {
            void handleRun(cmd, "bash");
          } else {
            inputRef.current?.focus();
          }
        }}
      />

      {/* Server File Explorer Modal */}
      <TerminalFileExplorerModal
        initialPath={store.activeCwd || "/"}
        isOpen={showFileExplorer}
        onClose={() => setShowFileExplorer(false)}
        onSelectPath={(newPath) => {
          setCustomCwd(newPath);
        }}
      />
    </div>
  );
}
