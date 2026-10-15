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
};
