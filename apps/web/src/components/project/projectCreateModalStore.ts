import type { EnvironmentId } from "@t3tools/contracts";
import { useEffect, useState } from "react";

export interface ProjectCreateModalState {
  isOpen: boolean;
  environmentId?: EnvironmentId | undefined;
}

const initialState: ProjectCreateModalState = {
  isOpen: false,
  environmentId: undefined,
};

let currentState: ProjectCreateModalState = { ...initialState };
const listeners = new Set<(state: ProjectCreateModalState) => void>();

export const projectCreateModalStore = {
  getState: () => currentState,
  open: (environmentId?: EnvironmentId | undefined) => {
    currentState = { isOpen: true, environmentId };
    listeners.forEach((listener) => listener(currentState));
  },
  close: () => {
    currentState = { ...initialState };
    listeners.forEach((listener) => listener(currentState));
  },
  subscribe: (listener: (state: ProjectCreateModalState) => void) => {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  },
};

export function useProjectCreateModal(): ProjectCreateModalState {
  const [state, setState] = useState(projectCreateModalStore.getState);

  useEffect(() => {
    return projectCreateModalStore.subscribe(setState);
  }, []);

  return state;
}
