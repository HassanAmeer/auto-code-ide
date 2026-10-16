import type { EnvironmentId } from "@t3tools/contracts";
import { useEffect, useState } from "react";

export interface ProjectUploadProgressState {
  // Upload lifecycle state
  isImporting: boolean;
  projectName: string;
  stage: string;
  current: number;
  total: number;
  percent: number;
  error: string | null;

  // Drawer / Sidebar state
  isDrawerOpen: boolean;
  isDrawerCollapsed: boolean;
  itemType: "folder" | "zip" | "files" | null;
  itemName: string;
  itemSizeBytes: number;
  fileCount: number;
  customProjectName: string;
  speedText: string | null;
  pendingZipFile: File | null;
  pendingFolderFiles: File[] | null;
  targetEnvId: EnvironmentId | undefined;
}

const initialState: ProjectUploadProgressState = {
  isImporting: false,
  projectName: "",
  stage: "",
  current: 0,
  total: 0,
  percent: 0,
  error: null,

  isDrawerOpen: false,
  isDrawerCollapsed: false,
  itemType: null,
  itemName: "",
  itemSizeBytes: 0,
  fileCount: 0,
  customProjectName: "",
  speedText: null,
  pendingZipFile: null,
  pendingFolderFiles: null,
  targetEnvId: undefined,
};

let currentState: ProjectUploadProgressState = { ...initialState };
const listeners = new Set<(state: ProjectUploadProgressState) => void>();

let triggerHandler: ((envId?: EnvironmentId) => void) | null = null;
let triggerZipHandler: ((envId?: EnvironmentId) => void) | null = null;

export const projectUploadStore = {
  getState: () => currentState,
  setState: (partial: Partial<ProjectUploadProgressState>) => {
    currentState = { ...currentState, ...partial };
    listeners.forEach((listener) => listener(currentState));
  },
  reset: () => {
    currentState = {
      ...initialState,
      // Keep drawer open/closed state if user is looking at results, but clear active job
      isDrawerOpen: currentState.isDrawerOpen,
      isDrawerCollapsed: currentState.isDrawerCollapsed,
    };
    listeners.forEach((listener) => listener(currentState));
  },
  subscribe: (listener: (state: ProjectUploadProgressState) => void) => {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  },
  registerTrigger: (fn: (envId?: EnvironmentId) => void) => {
    triggerHandler = fn;
    return () => {
      if (triggerHandler === fn) {
        triggerHandler = null;
      }
    };
  },
  triggerUpload: (envId?: EnvironmentId) => {
    if (triggerHandler) {
      triggerHandler(envId);
    } else {
      console.warn("Global folder upload trigger is not yet registered.");
    }
  },
  registerZipTrigger: (fn: (envId?: EnvironmentId) => void) => {
    triggerZipHandler = fn;
    return () => {
      if (triggerZipHandler === fn) {
        triggerZipHandler = null;
      }
    };
  },
  triggerZipUpload: (envId?: EnvironmentId) => {
    if (triggerZipHandler) {
      triggerZipHandler(envId);
    } else {
      console.warn("Global zip upload trigger is not yet registered.");
    }
  },

  // Drawer specific actions
  openDrawerWithItem: (item: {
    itemType: "folder" | "zip" | "files";
    itemName: string;
    itemSizeBytes: number;
    fileCount: number;
    customProjectName: string;
    pendingZipFile?: File | null;
    pendingFolderFiles?: File[] | null;
    targetEnvId?: EnvironmentId;
  }) => {
    currentState = {
      ...currentState,
      isDrawerOpen: true,
      isDrawerCollapsed: false,
      itemType: item.itemType,
      itemName: item.itemName,
      itemSizeBytes: item.itemSizeBytes,
      fileCount: item.fileCount,
      customProjectName: item.customProjectName,
      pendingZipFile: item.pendingZipFile ?? null,
      pendingFolderFiles: item.pendingFolderFiles ?? null,
      targetEnvId: item.targetEnvId,
      error: null,
    };
    listeners.forEach((listener) => listener(currentState));
  },
  closeDrawer: () => {
    currentState = {
      ...currentState,
      isDrawerOpen: false,
      isDrawerCollapsed: false,
      pendingZipFile: null,
      pendingFolderFiles: null,
    };
    listeners.forEach((listener) => listener(currentState));
  },
  collapseDrawer: () => {
    currentState = {
      ...currentState,
      isDrawerCollapsed: true,
    };
    listeners.forEach((listener) => listener(currentState));
  },
  expandDrawer: () => {
    currentState = {
      ...currentState,
      isDrawerOpen: true,
      isDrawerCollapsed: false,
    };
    listeners.forEach((listener) => listener(currentState));
  },
  setCustomProjectName: (customProjectName: string) => {
    currentState = {
      ...currentState,
      customProjectName,
    };
    listeners.forEach((listener) => listener(currentState));
  },
};

export function useProjectUploadProgress(): ProjectUploadProgressState {
  const [state, setState] = useState(projectUploadStore.getState);

  useEffect(() => {
    return projectUploadStore.subscribe(setState);
  }, []);

  return state;
}
