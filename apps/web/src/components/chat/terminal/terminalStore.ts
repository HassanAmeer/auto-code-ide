import { useSyncExternalStore } from "react";
import type { TerminalCommandRun, SshProfile } from "./terminalTypes";
import {
  executeTerminalCommand,
  generateAiExplanation,
  translatePromptToBashCommand,
} from "./terminalClient";

interface TerminalState {
  runs: TerminalCommandRun[];
  activeCwd: string;
  isQuickBarOpen: boolean;
  history: string[];
  activeTarget: string; // "local" or sshProfile id
  sshProfiles: SshProfile[];
  inputMode: "bash" | "ai";
}

const STORAGE_KEY_CWD = "t3_terminal_active_cwd";
const STORAGE_KEY_OPEN = "t3_terminal_quickbar_open";
const STORAGE_KEY_SSH = "t3_terminal_ssh_profiles";

const initialCwd =
  typeof window !== "undefined" ? window.localStorage.getItem(STORAGE_KEY_CWD) || "/" : "/";

const initialOpen =
  typeof window !== "undefined" ? window.localStorage.getItem(STORAGE_KEY_OPEN) !== "false" : true;

let initialSshProfiles: SshProfile[] = [];
if (typeof window !== "undefined") {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY_SSH);
    if (raw) initialSshProfiles = JSON.parse(raw);
  } catch {
    // ignore
  }
}

let state: TerminalState = {
  runs: [],
  activeCwd: initialCwd,
  isQuickBarOpen: initialOpen,
  activeTarget: "local",
  sshProfiles: initialSshProfiles,
  inputMode: "bash",
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

  setActiveTarget(targetId: string) {
    state = { ...state, activeTarget: targetId };
    notify();
  },

  addSshProfile(profile: SshProfile) {
    const updated = [...state.sshProfiles.filter((p) => p.id !== profile.id), profile];
    state = { ...state, sshProfiles: updated, activeTarget: profile.id };
    if (typeof window !== "undefined") {
      window.localStorage.setItem(STORAGE_KEY_SSH, JSON.stringify(updated));
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
    const cwd = customCwd || state.activeCwd || "/";

    // Translate if AI mode
    const actualCommand =
      currentMode === "ai" ? translatePromptToBashCommand(trimmedInput, cwd) : trimmedInput;

    const runId = "term_" + Date.now() + "_" + Math.random().toString(36).slice(2, 7);

    // Check if target is remote SSH
    const activeProfile = state.sshProfiles.find((p) => p.id === state.activeTarget);
    let commandToExecute = actualCommand;
    let targetLabel = "Local VPS (Root)";

    if (activeProfile) {
      targetLabel = `SSH: ${activeProfile.label || activeProfile.host}`;
      const escapedCmd = actualCommand.replace(/"/g, '\\"');
      commandToExecute = `ssh -o StrictHostKeyChecking=no -o ConnectTimeout=10 -p ${activeProfile.port || 22} ${activeProfile.user ? `${activeProfile.user}@` : ""}${activeProfile.host} "${escapedCmd}"`;
    }

    // Update history
    const nextHistory = [
      trimmedInput,
      ...state.history.filter((item) => item !== trimmedInput),
    ].slice(0, 50);

    const initialRun: TerminalCommandRun = {
      id: runId,
      command: actualCommand,
      cwd,
      status: "running",
      exitCode: null,
      stdout: "",
      stderr: "",
      durationMs: 0,
      timestamp: Date.now(),
      targetHost: targetLabel,
      mode: currentMode,
      aiPrompt: currentMode === "ai" ? trimmedInput : undefined,
    };

    state = {
      ...state,
      runs: [initialRun, ...state.runs],
      history: nextHistory,
    };
    notify();

    // Auto-update CWD on `cd <path>` if local
    if (!activeProfile) {
      const cdMatch = actualCommand.match(/^cd\s+(.+)$/);
      if (cdMatch && cdMatch[1]) {
        const targetPath = cdMatch[1].trim();
        let newCwd = targetPath;
        if (!targetPath.startsWith("/")) {
          newCwd = (cwd.endsWith("/") ? cwd : cwd + "/") + targetPath;
        }
        terminalStore.setActiveCwd(newCwd);
      }
    }

    // Execute via server
    const result = await executeTerminalCommand(commandToExecute, cwd);
    const { explanation, nextSteps } = generateAiExplanation(actualCommand, result);

    const completedRun: TerminalCommandRun = {
      id: runId,
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
      targetHost: targetLabel,
      mode: currentMode,
      aiPrompt: currentMode === "ai" ? trimmedInput : undefined,
    };

    state = {
      ...state,
      runs: state.runs.map((r) => (r.id === runId ? completedRun : r)),
    };
    notify();

    return completedRun;
  },
};

export function useTerminalStore() {
  return useSyncExternalStore(terminalStore.subscribe, terminalStore.getState);
}
