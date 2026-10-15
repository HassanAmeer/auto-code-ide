import { create } from "zustand";
import { persist } from "zustand/middleware";

interface BackgroundModeState {
  isBgEnabled: boolean;
  keepTabAwake: boolean;
  isModalOpen: boolean;
  setBgEnabled: (enabled: boolean) => void;
  toggleBg: () => void;
  setKeepTabAwake: (keep: boolean) => void;
  setModalOpen: (open: boolean) => void;
}

let activeWakeLock: any = null;

async function requestWakeLock() {
  if (typeof window !== "undefined" && "wakeLock" in navigator) {
    try {
      activeWakeLock = await (navigator as any).wakeLock.request("screen");
      activeWakeLock.addEventListener("release", () => {
        activeWakeLock = null;
      });
    } catch {
      // Wake Lock may not be supported or denied by policy
    }
  }
}

async function releaseWakeLock() {
  if (activeWakeLock) {
    try {
      await activeWakeLock.release();
    } catch {
      // Ignore
    }
    activeWakeLock = null;
  }
}

export const useBackgroundModeStore = create<BackgroundModeState>()(
  persist(
    (set, get) => ({
      isBgEnabled: true,
      keepTabAwake: true,
      isModalOpen: false,

      setBgEnabled: (enabled) => {
        set({ isBgEnabled: enabled });
        if (enabled && get().keepTabAwake) {
          void requestWakeLock();
        }
      },

      toggleBg: () => {
        const next = !get().isBgEnabled;
        get().setBgEnabled(next);
      },

      setKeepTabAwake: (keep) => {
        set({ keepTabAwake: keep });
        if (keep && get().isBgEnabled) {
          void requestWakeLock();
        } else {
          void releaseWakeLock();
        }
      },

      setModalOpen: (open) => set({ isModalOpen: open }),
    }),
    {
      name: "jobi.bgExecutionMode",
      partialize: (state) => ({
        isBgEnabled: state.isBgEnabled,
        keepTabAwake: state.keepTabAwake,
      }),
    },
  ),
);

// Auto-request wake lock on page load or visibility change if enabled
if (typeof window !== "undefined") {
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") {
      const state = useBackgroundModeStore.getState();
      if (state.isBgEnabled && state.keepTabAwake) {
        void requestWakeLock();
      }
    }
  });

  // Initial attempt
  const state = useBackgroundModeStore.getState();
  if (state.isBgEnabled && state.keepTabAwake) {
    void requestWakeLock();
  }
}
