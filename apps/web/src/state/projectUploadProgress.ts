import type { EnvironmentId } from "@t3tools/contracts";
import { useEffect, useState } from "react";

export interface ProjectUploadProgressState {
  isImporting: boolean;
  projectName: string;
  stage: string;
  current: number;
  total: number;
  percent: number;
  error: string | null;
}

const initialState: ProjectUploadProgressState = {
  isImporting: false,
  projectName: "",
  stage: "",
  current: 0,
  total: 0,
  percent: 0,
  error: null,
};

let currentState: ProjectUploadProgressState = { ...initialState };
const listeners = new Set<(state: ProjectUploadProgressState) => void>();

let triggerHandler: ((envId?: EnvironmentId) => void) | null = null;

export const projectUploadStore = {
  getState: () => currentState,
  setState: (partial: Partial<ProjectUploadProgressState>) => {
    currentState = { ...currentState, ...partial };
    listeners.forEach((listener) => listener(currentState));
  },
  reset: () => {
    currentState = { ...initialState };
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
};

export function useProjectUploadProgress(): ProjectUploadProgressState {
  const [state, setState] = useState(projectUploadStore.getState);

  useEffect(() => {
    return projectUploadStore.subscribe(setState);
  }, []);

  return state;
}
