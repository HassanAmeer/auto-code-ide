import { create } from "zustand";

interface ImportSessionStore {
  isOpen: boolean;
  openDialog: () => void;
  closeDialog: () => void;
}

export const useImportSessionStore = create<ImportSessionStore>((set) => ({
  isOpen: false,
  openDialog: () => set({ isOpen: true }),
  closeDialog: () => set({ isOpen: false }),
}));
