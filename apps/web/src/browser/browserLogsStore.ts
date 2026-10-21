import { create } from "zustand";
import type {
  PreviewAutomationConsoleEntry,
  PreviewAutomationNetworkEntry,
} from "@t3tools/contracts";

export type BrowserLogsFilter = "all" | "console" | "network" | "errors";

export interface BrowserLogsTabState {
  consoleEntries: PreviewAutomationConsoleEntry[];
  networkEntries: PreviewAutomationNetworkEntry[];
}

export interface BrowserLogsStore {
  logsByTab: Record<string, BrowserLogsTabState>;
  isLogsOpen: boolean;
  activeFilter: BrowserLogsFilter;
  searchQuery: string;

  toggleLogsOpen: () => void;
  setLogsOpen: (open: boolean) => void;
  setActiveFilter: (filter: BrowserLogsFilter) => void;
  setSearchQuery: (query: string) => void;

  addConsoleEntry: (tabId: string, entry: PreviewAutomationConsoleEntry) => void;
  addNetworkEntry: (tabId: string, entry: PreviewAutomationNetworkEntry) => void;
  clearLogs: (tabId: string) => void;

  getTabLogs: (tabId: string) => BrowserLogsTabState;
  getErrorCount: (tabId: string) => number;
  getFormattedErrorsForAi: (tabId?: string) => string;
  getRawErrorsForSync: (
    tabId?: string,
  ) => Array<{ level: string; text: string; timestamp?: string }>;
}

const DEFAULT_TAB_STATE: BrowserLogsTabState = {
  consoleEntries: [],
  networkEntries: [],
};

export const useBrowserLogsStore = create<BrowserLogsStore>((set, get) => ({
  logsByTab: {},
  isLogsOpen: false,
  activeFilter: "all",
  searchQuery: "",

  toggleLogsOpen: () => set((state) => ({ isLogsOpen: !state.isLogsOpen })),
  setLogsOpen: (open) => set({ isLogsOpen: open }),
  setActiveFilter: (activeFilter) => set({ activeFilter }),
  setSearchQuery: (searchQuery) => set({ searchQuery }),

  addConsoleEntry: (tabId: string, entry: PreviewAutomationConsoleEntry) => {
    if (!tabId) return;
    set((state) => {
      const current = state.logsByTab[tabId] || { consoleEntries: [], networkEntries: [] };
      // Keep bounded at 500 entries per tab
      const consoleEntries = [...current.consoleEntries, entry].slice(-500);
      return {
        logsByTab: {
          ...state.logsByTab,
          [tabId]: {
            ...current,
            consoleEntries,
          },
        },
      };
    });
  },

  addNetworkEntry: (tabId: string, entry: PreviewAutomationNetworkEntry) => {
    if (!tabId) return;
    set((state) => {
      const current = state.logsByTab[tabId] || { consoleEntries: [], networkEntries: [] };
      // Keep bounded at 500 entries per tab
      const networkEntries = [...current.networkEntries, entry].slice(-500);
      return {
        logsByTab: {
          ...state.logsByTab,
          [tabId]: {
            ...current,
            networkEntries,
          },
        },
      };
    });
  },

  clearLogs: (tabId: string) => {
    if (!tabId) return;
    set((state) => ({
      logsByTab: {
        ...state.logsByTab,
        [tabId]: {
          consoleEntries: [],
          networkEntries: [],
        },
      },
    }));
  },

  getTabLogs: (tabId: string) => {
    return get().logsByTab[tabId] || DEFAULT_TAB_STATE;
  },

  getErrorCount: (tabId: string) => {
    const logs = get().logsByTab[tabId];
    if (!logs) return 0;
    const consoleErrors = logs.consoleEntries.filter((c) => c.level === "error").length;
    const networkErrors = logs.networkEntries.filter(
      (n) => n.failed || (n.status !== null && n.status >= 400),
    ).length;
    return consoleErrors + networkErrors;
  },

  getFormattedErrorsForAi: (tabId?: string) => {
    const state = get();
    const tabs =
      tabId && state.logsByTab[tabId]
        ? [[tabId, state.logsByTab[tabId]!] as const]
        : Object.entries(state.logsByTab);

    const errorLines: string[] = [];
    for (const [, tab] of tabs) {
      const consoleErrors = tab.consoleEntries.filter(
        (c) => c.level === "error" || c.level === "warn",
      );
      for (const ce of consoleErrors.slice(-15)) {
        const prefix = ce.level === "error" ? "CONSOLE ERROR" : "CONSOLE WARNING";
        const src = ce.source ? ` (${ce.source})` : "";
        errorLines.push(`- [${prefix}]${src}: ${ce.text}`);
      }
      const netErrors = tab.networkEntries.filter(
        (n) => n.failed || (n.status !== null && n.status >= 400),
      );
      for (const ne of netErrors.slice(-10)) {
        errorLines.push(
          `- [NETWORK FAILED]: ${ne.method} ${ne.url} (${ne.status ?? "Failed"}${ne.errorText ? `: ${ne.errorText}` : ""})`,
        );
      }
    }
    return errorLines.join("\n");
  },

  getRawErrorsForSync: (tabId?: string) => {
    const state = get();
    const tabs =
      tabId && state.logsByTab[tabId]
        ? [[tabId, state.logsByTab[tabId]!] as const]
        : Object.entries(state.logsByTab);

    const result: Array<{ level: string; text: string; timestamp?: string }> = [];
    for (const [, tab] of tabs) {
      for (const ce of tab.consoleEntries
        .filter((c) => c.level === "error" || c.level === "warn")
        .slice(-15)) {
        result.push({
          level: ce.level,
          text: ce.text,
          timestamp: ce.timestamp,
        });
      }
      for (const ne of tab.networkEntries
        .filter((n) => n.failed || (n.status !== null && n.status >= 400))
        .slice(-10)) {
        result.push({
          level: "error",
          text: `Network Request Failed: ${ne.method} ${ne.url} (${ne.status ?? "Failed"}${ne.errorText ? `: ${ne.errorText}` : ""})`,
          timestamp: ne.timestamp,
        });
      }
    }
    return result;
  },
}));

export const browserLogsStore = {
  getState: useBrowserLogsStore.getState,
  setState: useBrowserLogsStore.setState,
  addConsoleEntry: (tabId: string, entry: PreviewAutomationConsoleEntry) =>
    useBrowserLogsStore.getState().addConsoleEntry(tabId, entry),
  addNetworkEntry: (tabId: string, entry: PreviewAutomationNetworkEntry) =>
    useBrowserLogsStore.getState().addNetworkEntry(tabId, entry),
  toggleLogsOpen: () => useBrowserLogsStore.getState().toggleLogsOpen(),
  setLogsOpen: (open: boolean) => useBrowserLogsStore.getState().setLogsOpen(open),
  clearLogs: (tabId: string) => useBrowserLogsStore.getState().clearLogs(tabId),
  getFormattedErrorsForAi: (tabId?: string) =>
    useBrowserLogsStore.getState().getFormattedErrorsForAi(tabId),
  getRawErrorsForSync: (tabId?: string) =>
    useBrowserLogsStore.getState().getRawErrorsForSync(tabId),
};
