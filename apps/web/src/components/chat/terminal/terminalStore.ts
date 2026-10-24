import { useSyncExternalStore } from "react";
import type {
  TerminalCommandRun,
  SshProfile,
  TerminalAccessKey,
  TerminalChatSession,
} from "./terminalTypes";
import {
  executeTerminalCommand,
  executeTerminalCommandStream,
  killTerminalExecution,
  diagnoseCommandFailure,
  generateAiExplanation,
  translatePromptToBashCommand,
  isNaturalLanguagePrompt,
} from "./terminalClient";

interface TerminalState {
  runs: TerminalCommandRun[];
  runsByChat: Record<string, TerminalCommandRun[]>;
  activeCwd: string;
  scopeMode: "root" | "project";
  lastProjectPath: string | null;
  selectedProjectId: string | null;
  selectedProjectTitle: string | null;
  selectedKeyId: string | null;
  isQuickBarOpen: boolean;
  isSshSheetOpen: boolean;
  isChatsSheetOpen: boolean;
  editingKeyId: string | null;
  isFileExplorerOpen: boolean;
  history: string[];
  activeTarget: string; // "local" or sshProfile id or key id
  sshProfiles: SshProfile[];
  accessKeys: TerminalAccessKey[];
  terminalChats: TerminalChatSession[];
  activeChatId: string | null;
  inputMode: "bash" | "ai";
  permissionMode: "full-access" | "ask";
  alwaysAllowedCommands: string[];
}

import { saveServerSetting } from "~/lib/serverSettingsSync";

const STORAGE_KEY_CWD = "adc_terminal_active_cwd";
const STORAGE_KEY_OPEN = "adc_terminal_quickbar_open";
const STORAGE_KEY_SSH = "adc_terminal_ssh_profiles";
const STORAGE_KEY_KEYS = "adc_terminal_access_keys";
const STORAGE_KEY_PROJECT_ID = "adc_terminal_selected_project_id";
const STORAGE_KEY_PROJECT_TITLE = "adc_terminal_selected_project_title";
const STORAGE_KEY_SELECTED_KEY = "adc_terminal_selected_key_id";
const STORAGE_KEY_TERMINAL_CHATS = "adc_terminal_chats";
const STORAGE_KEY_SCOPE_MODE = "adc_terminal_scope_mode";
const STORAGE_KEY_LAST_PROJECT_PATH = "adc_terminal_last_project_path";
const STORAGE_KEY_PERMISSION_MODE = "adc_terminal_permission_mode";
const STORAGE_KEY_ALWAYS_ALLOWED_COMMANDS = "adc_terminal_always_allowed_commands";

const initialPermissionMode: "full-access" | "ask" =
  typeof window !== "undefined" &&
  window.localStorage.getItem(STORAGE_KEY_PERMISSION_MODE) === "ask"
    ? "ask"
    : "full-access";

let initialAlwaysAllowedCommands: string[] = [];
if (typeof window !== "undefined") {
  try {
    const rawCmds = window.localStorage.getItem(STORAGE_KEY_ALWAYS_ALLOWED_COMMANDS);
    if (rawCmds) initialAlwaysAllowedCommands = JSON.parse(rawCmds);
  } catch {
    // ignore
  }
}

const initialProjectId =
  typeof window !== "undefined" ? window.localStorage.getItem(STORAGE_KEY_PROJECT_ID) : null;
const initialProjectTitle =
  typeof window !== "undefined" ? window.localStorage.getItem(STORAGE_KEY_PROJECT_TITLE) : null;
const initialSelectedKey =
  typeof window !== "undefined" ? window.localStorage.getItem(STORAGE_KEY_SELECTED_KEY) : null;
const initialLastProjectPath =
  typeof window !== "undefined" ? window.localStorage.getItem(STORAGE_KEY_LAST_PROJECT_PATH) : null;
const initialScopeMode: "root" | "project" =
  typeof window !== "undefined" && window.localStorage.getItem(STORAGE_KEY_SCOPE_MODE) === "project"
    ? "project"
    : "root";

const initialCwd =
  typeof window !== "undefined"
    ? initialScopeMode === "project" && initialLastProjectPath
      ? initialLastProjectPath
      : "/"
    : "/";

const initialOpen =
  typeof window !== "undefined" ? window.localStorage.getItem(STORAGE_KEY_OPEN) === "true" : false;

let initialSshProfiles: SshProfile[] = [];
if (typeof window !== "undefined") {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY_SSH);
    if (raw) initialSshProfiles = JSON.parse(raw);
  } catch {
    // ignore
  }
}

let initialAccessKeys: TerminalAccessKey[] = [
  {
    id: "key_vps_default",
    name: "Production Server (SSH)",
    type: "ssh",
    host: "201.18.218.29",
    user: "root",
    port: 22,
    secret: "",
    enabled: true,
    notes: "Primary VPS Access",
  },
  {
    id: "key_api_default",
    name: "API Secret Key",
    type: "api",
    secret: "sk-proj-demo-token",
    enabled: false,
    notes: "Main API Secret",
  },
];
if (typeof window !== "undefined") {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY_KEYS);
    if (raw) initialAccessKeys = JSON.parse(raw);
  } catch {
    // ignore
  }
}

let initialTerminalChats: TerminalChatSession[] = [
  {
    id: "term_chat_init_1",
    title: "VPS Production Auto-Deploy",
    createdAt: Date.now() - 1000 * 60 * 45,
    projectName: "autojobs",
    sshKeyName: "Production Server (SSH)",
    lastPrompt: "Check git status, pull latest changes, and restart service",
  },
];
if (typeof window !== "undefined") {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY_TERMINAL_CHATS);
    if (raw) initialTerminalChats = JSON.parse(raw);
  } catch {
    // ignore
  }
}

let state: TerminalState = {
  runs: [],
  runsByChat: {},
  activeCwd: initialCwd,
  scopeMode: initialScopeMode,
  lastProjectPath: initialLastProjectPath,
  selectedProjectId: initialProjectId,
  selectedProjectTitle: initialProjectTitle,
  selectedKeyId: initialSelectedKey,
  isQuickBarOpen: initialOpen,
  isSshSheetOpen: false,
  isChatsSheetOpen: false,
  editingKeyId: null,
  isFileExplorerOpen: false,
  activeTarget: initialSelectedKey ? `key_${initialSelectedKey}` : "local",
  sshProfiles: initialSshProfiles,
  accessKeys: initialAccessKeys,
  terminalChats: initialTerminalChats,
  activeChatId: initialTerminalChats[0]?.id ?? null,
  inputMode: "bash",
  permissionMode: initialPermissionMode,
  alwaysAllowedCommands: initialAlwaysAllowedCommands,
  history: ["ls -la /", "df -h", "free -m", "uname -a"],
};

const listeners = new Set<() => void>();

function notify() {
  for (const listener of listeners) {
    listener();
  }
}

export const terminalStore = {
  getState(): TerminalState {
    return state;
  },

  subscribe(listener: () => void) {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  },

  setActiveCwd(cwd: string) {
    state = { ...state, activeCwd: cwd };
    if (typeof window !== "undefined") {
      window.localStorage.setItem(STORAGE_KEY_CWD, cwd);
    }
    notify();
  },

  setQuickBarOpen(isOpen: boolean) {
    state = { ...state, isQuickBarOpen: isOpen };
    if (typeof window !== "undefined") {
      window.localStorage.setItem(STORAGE_KEY_OPEN, String(isOpen));
    }
    notify();
  },

  toggleQuickBar() {
    this.setQuickBarOpen(!state.isQuickBarOpen);
  },

  setInputMode(mode: "bash" | "ai") {
    state = { ...state, inputMode: mode };
    notify();
  },

  setPermissionMode(mode: "full-access" | "ask") {
    state = { ...state, permissionMode: mode };
    if (typeof window !== "undefined") {
      window.localStorage.setItem(STORAGE_KEY_PERMISSION_MODE, mode);
    }
    notify();
  },

  allowAlwaysCommand(command: string) {
    const trimmed = command.trim();
    if (!trimmed) return;
    const base = trimmed.split(/\s+/)[0] || trimmed;
    const next = Array.from(new Set([...state.alwaysAllowedCommands, base, trimmed]));
    state = { ...state, alwaysAllowedCommands: next };
    if (typeof window !== "undefined") {
      window.localStorage.setItem(STORAGE_KEY_ALWAYS_ALLOWED_COMMANDS, JSON.stringify(next));
    }
    notify();
  },

  isCommandAlwaysAllowed(command: string): boolean {
    const trimmed = command.trim();
    if (!trimmed) return false;
    const base = trimmed.split(/\s+/)[0] || trimmed;
    return state.alwaysAllowedCommands.some(
      (c) => c === trimmed || c === base || trimmed.startsWith(c),
    );
  },

  setActiveTarget(targetId: string) {
    state = { ...state, activeTarget: targetId };
    notify();
  },

  addSshProfile(profile: SshProfile) {
    const updated = [...state.sshProfiles.filter((p) => p.id !== profile.id), profile];
    state = { ...state, sshProfiles: updated, activeTarget: profile.id };
    if (typeof window !== "undefined") {
      window.localStorage.setItem(STORAGE_KEY_SSH, JSON.stringify(updated));
      void saveServerSetting(STORAGE_KEY_SSH, updated);
    }
    notify();
  },

  removeSshProfile(id: string) {
    const updated = state.sshProfiles.filter((p) => p.id !== id);
    state = {
      ...state,
      sshProfiles: updated,
      activeTarget: state.activeTarget === id ? "local" : state.activeTarget,
    };
    if (typeof window !== "undefined") {
      window.localStorage.setItem(STORAGE_KEY_SSH, JSON.stringify(updated));
      void saveServerSetting(STORAGE_KEY_SSH, updated);
    }
    notify();
  },

  clearRuns() {
    state = { ...state, runs: [] };
    notify();
  },

  removeRun(id: string) {
    state = {
      ...state,
      runs: state.runs.filter((r) => r.id !== id),
    };
    notify();
  },

  addAccessKey(key: Omit<TerminalAccessKey, "id">) {
    const newKey: TerminalAccessKey = {
      ...key,
      id: "key_" + Date.now() + "_" + Math.random().toString(36).slice(2, 6),
    };
    const updated = [...state.accessKeys, newKey];
    state = { ...state, accessKeys: updated };
    if (typeof window !== "undefined") {
      window.localStorage.setItem(STORAGE_KEY_KEYS, JSON.stringify(updated));
      void saveServerSetting(STORAGE_KEY_KEYS, updated);
    }
    notify();
  },

  updateAccessKey(id: string, updates: Partial<TerminalAccessKey>) {
    const updated = state.accessKeys.map((k) => (k.id === id ? { ...k, ...updates } : k));
    state = { ...state, accessKeys: updated };
    if (typeof window !== "undefined") {
      window.localStorage.setItem(STORAGE_KEY_KEYS, JSON.stringify(updated));
      void saveServerSetting(STORAGE_KEY_KEYS, updated);
    }
    notify();
  },

  toggleAccessKey(id: string) {
    const updated = state.accessKeys.map((k) => (k.id === id ? { ...k, enabled: !k.enabled } : k));
    state = { ...state, accessKeys: updated };
    if (typeof window !== "undefined") {
      window.localStorage.setItem(STORAGE_KEY_KEYS, JSON.stringify(updated));
      void saveServerSetting(STORAGE_KEY_KEYS, updated);
    }
    notify();
  },

  setSelectedProject(
    projectId: string | null,
    title: string | null,
    workspaceRoot?: string | undefined,
  ) {
    const nextCwd = projectId && workspaceRoot ? workspaceRoot : "/";
    const nextScope = projectId ? "project" : "root";
    state = {
      ...state,
      selectedProjectId: projectId,
      selectedProjectTitle: title,
      lastProjectPath: workspaceRoot ?? state.lastProjectPath,
      scopeMode: nextScope,
      activeCwd: nextCwd,
    };
    if (typeof window !== "undefined") {
      if (projectId) window.localStorage.setItem(STORAGE_KEY_PROJECT_ID, projectId);
      else window.localStorage.removeItem(STORAGE_KEY_PROJECT_ID);

      if (title) window.localStorage.setItem(STORAGE_KEY_PROJECT_TITLE, title);
      else window.localStorage.removeItem(STORAGE_KEY_PROJECT_TITLE);

      if (workspaceRoot) window.localStorage.setItem(STORAGE_KEY_LAST_PROJECT_PATH, workspaceRoot);

      window.localStorage.setItem(STORAGE_KEY_SCOPE_MODE, nextScope);
      window.localStorage.setItem(STORAGE_KEY_CWD, nextCwd);
    }
    notify();
  },

  setScopeMode(mode: "root" | "project") {
    const nextCwd = mode === "root" ? "/" : state.lastProjectPath || state.activeCwd || "/";
    state = {
      ...state,
      scopeMode: mode,
      activeCwd: nextCwd,
    };
    if (typeof window !== "undefined") {
      window.localStorage.setItem(STORAGE_KEY_SCOPE_MODE, mode);
      window.localStorage.setItem(STORAGE_KEY_CWD, nextCwd);
    }
    notify();
  },

  setSelectedKey(keyId: string | null) {
    const nextKeyId = state.selectedKeyId === keyId ? null : keyId;
    const updated = state.accessKeys.map((k) => {
      if (nextKeyId === null) return k;
      return k.id === nextKeyId ? { ...k, enabled: true } : k;
    });
    state = {
      ...state,
      selectedKeyId: nextKeyId,
      accessKeys: updated,
      activeTarget: nextKeyId ? `key_${nextKeyId}` : "local",
    };
    if (typeof window !== "undefined") {
      if (nextKeyId) window.localStorage.setItem(STORAGE_KEY_SELECTED_KEY, nextKeyId);
      else window.localStorage.removeItem(STORAGE_KEY_SELECTED_KEY);
      window.localStorage.setItem(STORAGE_KEY_KEYS, JSON.stringify(updated));
    }
    notify();
  },

  deleteAccessKeys(ids: string[]) {
    const toDelete = new Set(ids);
    const updated = state.accessKeys.filter((k) => !toDelete.has(k.id));
    const nextSelectedKey =
      state.selectedKeyId && toDelete.has(state.selectedKeyId) ? null : state.selectedKeyId;
    state = {
      ...state,
      accessKeys: updated,
      selectedKeyId: nextSelectedKey,
      activeTarget: nextSelectedKey ? `key_${nextSelectedKey}` : "local",
    };
    if (typeof window !== "undefined") {
      window.localStorage.setItem(STORAGE_KEY_KEYS, JSON.stringify(updated));
      void saveServerSetting(STORAGE_KEY_KEYS, updated);
      if (!nextSelectedKey) window.localStorage.removeItem(STORAGE_KEY_SELECTED_KEY);
    }
    notify();
  },

  removeAccessKey(id: string) {
    this.deleteAccessKeys([id]);
  },

  setSshSheetOpen(isOpen: boolean) {
    state = { ...state, isSshSheetOpen: isOpen, ...(isOpen ? {} : { editingKeyId: null }) };
    notify();
  },

  setChatsSheetOpen(isOpen: boolean) {
    state = { ...state, isChatsSheetOpen: isOpen };
    notify();
  },

  toggleChatsSheet() {
    state = { ...state, isChatsSheetOpen: !state.isChatsSheetOpen };
    notify();
  },

  setEditingKeyId(id: string | null) {
    state = { ...state, editingKeyId: id };
    notify();
  },

  openSshSheetWithKey(keyId?: string | null) {
    state = { ...state, isSshSheetOpen: true, editingKeyId: keyId ?? null };
    notify();
  },

  setFileExplorerOpen(isOpen: boolean) {
    state = { ...state, isFileExplorerOpen: isOpen };
    notify();
  },

  toggleFileExplorer() {
    state = { ...state, isFileExplorerOpen: !state.isFileExplorerOpen };
    notify();
  },

  setActiveChatId(id: string | null) {
    const sessionRuns = id ? (state.runsByChat[id] ?? []) : [];
    state = { ...state, activeChatId: id, runs: sessionRuns };
    notify();
  },

  createTerminalChat(data?: Partial<TerminalChatSession>): TerminalChatSession {
    const activeKey = state.selectedKeyId
      ? state.accessKeys.find((k) => k.id === state.selectedKeyId)
      : state.accessKeys.find((k) => k.enabled && (k.type === "ssh" || k.host));

    const newChatId = "term_chat_" + Date.now() + "_" + Math.random().toString(36).slice(2, 6);
    const newChat: TerminalChatSession = {
      id: newChatId,
      title:
        data?.title ||
        (state.selectedProjectTitle ? `${state.selectedProjectTitle} Shell` : "New Terminal Chat"),
      createdAt: Date.now(),
      projectId: data?.projectId ?? state.selectedProjectId,
      projectName: data?.projectName ?? state.selectedProjectTitle,
      sshKeyId: data?.sshKeyId ?? activeKey?.id,
      sshKeyName: data?.sshKeyName ?? activeKey?.name,
      threadId: data?.threadId,
      environmentId: data?.environmentId,
      lastPrompt: data?.lastPrompt,
    };

    const updated = [newChat, ...state.terminalChats];
    state = {
      ...state,
      terminalChats: updated,
      activeChatId: newChat.id,
      runs: [], // Fresh new chat screen is completely clear!
      runsByChat: { ...state.runsByChat, [newChat.id]: [] },
      isQuickBarOpen: true,
    };

    if (typeof window !== "undefined") {
      window.localStorage.setItem(STORAGE_KEY_TERMINAL_CHATS, JSON.stringify(updated));
    }
    notify();
    return newChat;
  },

  updateTerminalChatTitle(id: string, title: string) {
    const updated = state.terminalChats.map((c) => (c.id === id ? { ...c, title } : c));
    state = {
      ...state,
      terminalChats: updated,
    };
    if (typeof window !== "undefined") {
      window.localStorage.setItem(STORAGE_KEY_TERMINAL_CHATS, JSON.stringify(updated));
    }
    notify();
  },

  deleteTerminalChat(id: string) {
    const updated = state.terminalChats.filter((c) => c.id !== id);
    const nextActive = state.activeChatId === id ? (updated[0]?.id ?? null) : state.activeChatId;
    const nextRunsByChat = { ...state.runsByChat };
    delete nextRunsByChat[id];
    const sessionRuns = nextActive ? (nextRunsByChat[nextActive] ?? []) : [];
    state = {
      ...state,
      terminalChats: updated,
      activeChatId: nextActive,
      runsByChat: nextRunsByChat,
      runs: sessionRuns,
    };
    if (typeof window !== "undefined") {
      window.localStorage.setItem(STORAGE_KEY_TERMINAL_CHATS, JSON.stringify(updated));
    }
    notify();
  },

  saveCustomAccessKey(params: {
    id?: string | undefined;
    name: string;
    notes?: string | undefined;
    host?: string | undefined;
    user?: string | undefined;
    port?: number | undefined;
    secret?: string | undefined;
    type?: "ssh" | "server" | "api" | "custom" | undefined;
  }): TerminalAccessKey {
    const existingIndex = params.id ? state.accessKeys.findIndex((k) => k.id === params.id) : -1;
    let savedKey: TerminalAccessKey;

    if (existingIndex >= 0 && params.id) {
      savedKey = {
        ...state.accessKeys[existingIndex]!,
        name: params.name,
        notes: params.notes,
        host: params.host,
        user: params.user || "root",
        port: params.port || 22,
        secret: params.secret,
        type: params.type || "ssh",
        enabled: true,
      };
      const updated = [...state.accessKeys];
      updated[existingIndex] = savedKey;
      state = {
        ...state,
        accessKeys: updated,
        selectedKeyId: savedKey.id,
        activeTarget: `key_${savedKey.id}`,
      };
      if (typeof window !== "undefined") {
        window.localStorage.setItem(STORAGE_KEY_KEYS, JSON.stringify(updated));
        window.localStorage.setItem(STORAGE_KEY_SELECTED_KEY, savedKey.id);
      }
    } else {
      savedKey = {
        id: "key_" + Date.now() + "_" + Math.random().toString(36).slice(2, 6),
        name: params.name,
        notes: params.notes,
        host: params.host,
        user: params.user || "root",
        port: params.port || 22,
        secret: params.secret,
        type: params.type || "ssh",
        enabled: true,
      };
      const updated = [...state.accessKeys, savedKey];
      state = {
        ...state,
        accessKeys: updated,
        selectedKeyId: savedKey.id,
        activeTarget: `key_${savedKey.id}`,
      };
      if (typeof window !== "undefined") {
        window.localStorage.setItem(STORAGE_KEY_KEYS, JSON.stringify(updated));
        window.localStorage.setItem(STORAGE_KEY_SELECTED_KEY, savedKey.id);
      }
    }

    notify();
    return savedKey;
  },

  selectAllAccessKeys(enabled: boolean) {
    const updated = state.accessKeys.map((k) => ({ ...k, enabled }));
    state = { ...state, accessKeys: updated };
    if (typeof window !== "undefined") {
      window.localStorage.setItem(STORAGE_KEY_KEYS, JSON.stringify(updated));
    }
    notify();
  },

  appendRunChunk(runId: string, chunk: string, type: "stdout" | "stderr") {
    const updateRun = (r: TerminalCommandRun): TerminalCommandRun => {
      if (r.id !== runId) return r;
      return {
        ...r,
        stdout: type === "stdout" ? r.stdout + chunk : r.stdout,
        stderr: type === "stderr" ? r.stderr + chunk : r.stderr,
      };
    };
    const updatedRuns = state.runs.map(updateRun);
    const updatedRunsByChat = state.activeChatId
      ? {
          ...state.runsByChat,
          [state.activeChatId]: (state.runsByChat[state.activeChatId] || []).map(updateRun),
        }
      : state.runsByChat;

    state = {
      ...state,
      runs: updatedRuns,
      runsByChat: updatedRunsByChat,
    };
    notify();
  },

  async killRunningCommand(runId: string): Promise<boolean> {
    const target = state.runs.find((r) => r.id === runId);
    if (!target || !target.executionId) return false;
    const ok = await killTerminalExecution(target.executionId);
    if (ok) {
      state = {
        ...state,
        runs: state.runs.map((r) => {
          if (r.id !== runId) return r;
          return {
            ...r,
            status: "error",
            exitCode: 130,
            stderr:
              r.stderr + (r.stderr ? "\n" : "") + "[Process cancelled by user (Ctrl+C / Kill)]",
          };
        }),
      };
      notify();
    }
    return ok;
  },

  async runCommand(
    commandOrPrompt: string,
    customCwd?: string | undefined,
    modeOverride?: "bash" | "ai" | undefined,
  ): Promise<TerminalCommandRun> {
    const trimmedInput = commandOrPrompt.trim();
    if (!trimmedInput) {
      throw new Error("Command cannot be empty");
    }

    const currentMode = modeOverride ?? state.inputMode;
    const isNatural =
      currentMode === "ai" || (modeOverride === undefined && isNaturalLanguagePrompt(trimmedInput));
    const resolvedMode: "bash" | "ai" = isNatural ? "ai" : "bash";

    const cwd =
      state.scopeMode === "root"
        ? "/"
        : customCwd || state.activeCwd || state.lastProjectPath || "/";
    const activeKeys = state.accessKeys.filter((k) => k.enabled);

    // Translate if AI / natural mode with full awareness of project, git, keys, and notes
    const actualCommand = isNatural
      ? translatePromptToBashCommand(trimmedInput, cwd, activeKeys, {
          cwd,
          scopeMode: state.scopeMode,
          projectName: state.selectedProjectTitle,
          projectPath: state.lastProjectPath,
          activeKeys,
          selectedKeyId: state.selectedKeyId,
        })
      : trimmedInput;

    const runId = "term_" + Date.now() + "_" + Math.random().toString(36).slice(2, 7);
    const executionId = "exec_" + Date.now() + "_" + Math.random().toString(36).slice(2, 7);

    // Check for interactive commands that hang without TTY
    const firstWord = actualCommand.trim().split(/\s+/)[0]?.toLowerCase() || "";
    let effectiveCommand = actualCommand;
    if (firstWord === "top" && !actualCommand.includes("-b")) {
      // Auto-batch mode for top so it returns output instead of hanging
      effectiveCommand = `${actualCommand} -b -n 1`;
    }

    let commandToExecute = effectiveCommand;
    let targetLabel =
      state.scopeMode === "root"
        ? "Local VPS (Root)"
        : `Local (${state.selectedProjectTitle || "Project"})`;

    let isSshTarget = false;
    // ONLY execute via SSH if user explicitly selected an SSH target / profile (not "local")
    if (state.activeTarget && state.activeTarget !== "local") {
      const activeProfile = state.sshProfiles.find((p) => p.id === state.activeTarget);
      const activeKeyTarget = state.selectedKeyId
        ? state.accessKeys.find((k) => k.id === state.selectedKeyId)
        : state.activeTarget.startsWith("key_")
          ? state.accessKeys.find(
              (k) => `key_${k.id}` === state.activeTarget || k.id === state.activeTarget,
            )
          : null;

      const safeSshCmd = effectiveCommand.replace(/'/g, "'\\''");

      if (activeProfile && activeProfile.host) {
        isSshTarget = true;
        targetLabel = `SSH: ${activeProfile.label || activeProfile.host}`;
        commandToExecute = `ssh -o BatchMode=yes -o StrictHostKeyChecking=no -o ConnectTimeout=10 -p ${activeProfile.port || 22} ${activeProfile.user ? `${activeProfile.user}@` : ""}${activeProfile.host} '${safeSshCmd}'`;
      } else if (activeKeyTarget && activeKeyTarget.host) {
        isSshTarget = true;
        targetLabel = `SSH: ${activeKeyTarget.name} (${activeKeyTarget.user || "root"}@${activeKeyTarget.host})`;
        const port = activeKeyTarget.port || 22;
        const userPrefix = activeKeyTarget.user ? `${activeKeyTarget.user}@` : "";
        commandToExecute = `ssh -o BatchMode=yes -o StrictHostKeyChecking=no -o ConnectTimeout=10 -p ${port} ${userPrefix}${activeKeyTarget.host} '${safeSshCmd}'`;
      }
    }

    // Update history
    const nextHistory = [
      trimmedInput,
      ...state.history.filter((item) => item !== trimmedInput),
    ].slice(0, 50);

    const initialRun: TerminalCommandRun = {
      id: runId,
      executionId,
      command: actualCommand,
      cwd,
      status: "running",
      exitCode: null,
      stdout: "",
      stderr: "",
      durationMs: 0,
      timestamp: Date.now(),
      targetHost: targetLabel,
      mode: resolvedMode,
      aiPrompt: isNatural ? trimmedInput : undefined,
      activeKeys: activeKeys.length > 0 ? activeKeys : undefined,
    };

    const updatedInitialRuns = [initialRun, ...state.runs];
    const updatedInitialRunsByChat = state.activeChatId
      ? {
          ...state.runsByChat,
          [state.activeChatId]: [initialRun, ...(state.runsByChat[state.activeChatId] || [])],
        }
      : state.runsByChat;

    state = {
      ...state,
      runs: updatedInitialRuns,
      runsByChat: updatedInitialRunsByChat,
      history: nextHistory,
    };
    notify();

    // Execute via server using live streaming & cancellation support
    const result = await executeTerminalCommandStream(executionId, commandToExecute, cwd, {
      onChunk: (chunk, type) => {
        terminalStore.appendRunChunk(runId, chunk, type);
      },
    });

    // Auto-update CWD on successful `cd <path>` if local
    if (!isSshTarget && result.ok) {
      const cdMatch = actualCommand.match(/(?:^|[;&&|])\s*cd\s+([^;&|]+)/);
      if (cdMatch && cdMatch[1]) {
        let rawTarget = cdMatch[1].replace(/["']/g, "").trim();
        if (rawTarget) {
          let resolvedSegments: string[] = [];
          if (rawTarget.startsWith("/")) {
            resolvedSegments = rawTarget.split("/").filter(Boolean);
          } else {
            resolvedSegments = cwd
              .split("/")
              .filter(Boolean)
              .concat(rawTarget.split("/").filter(Boolean));
          }
          const cleanParts: string[] = [];
          for (const segment of resolvedSegments) {
            if (segment === "..") cleanParts.pop();
            else if (segment !== ".") cleanParts.push(segment);
          }
          const normalizedCwd = "/" + cleanParts.join("/");
          terminalStore.setActiveCwd(normalizedCwd);
        }
      }
    }

    const { explanation, nextSteps } = generateAiExplanation(actualCommand, result);
    const suggestedFix =
      result.exitCode !== 0
        ? diagnoseCommandFailure(actualCommand, result.stderr, result.exitCode, cwd)
        : undefined;

    const completedRun: TerminalCommandRun = {
      id: runId,
      executionId,
      command: actualCommand,
      cwd: result.cwd || cwd,
      status: result.ok ? "success" : "error",
      exitCode: result.exitCode,
      stdout: result.stdout,
      stderr: result.stderr,
      durationMs: result.durationMs,
      timestamp: Date.now(),
      explanation,
      nextSteps,
      suggestedFix,
      targetHost: targetLabel,
      mode: currentMode,
      aiPrompt: currentMode === "ai" ? trimmedInput : undefined,
      activeKeys: activeKeys.length > 0 ? activeKeys : undefined,
    };

    const updatedCompletedRuns = state.runs.map((r) => (r.id === runId ? completedRun : r));
    const updatedCompletedRunsByChat = state.activeChatId
      ? {
          ...state.runsByChat,
          [state.activeChatId]: (state.runsByChat[state.activeChatId] || []).map((r) =>
            r.id === runId ? completedRun : r,
          ),
        }
      : state.runsByChat;

    state = {
      ...state,
      runs: updatedCompletedRuns,
      runsByChat: updatedCompletedRunsByChat,
    };
    notify();

    return completedRun;
  },
};

export function useTerminalStore() {
  return useSyncExternalStore(terminalStore.subscribe, terminalStore.getState);
}
