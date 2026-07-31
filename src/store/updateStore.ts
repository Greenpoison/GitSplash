import { create } from "zustand";
import { check, type Update } from "@tauri-apps/plugin-updater";
import { relaunch } from "@tauri-apps/plugin-process";

interface UpdateState {
  available: Update | null;
  checking: boolean;
  installing: boolean;
  dismissed: boolean;

  checkNow: () => Promise<Update | null>;
  install: () => Promise<void>;
  dismiss: () => void;
}

export const useUpdateStore = create<UpdateState>((set, get) => ({
  available: null,
  checking: false,
  installing: false,
  dismissed: false,

  checkNow: async () => {
    set({ checking: true });
    try {
      const update = await check();
      set({ available: update, dismissed: false, checking: false });
      return update;
    } catch (e) {
      set({ checking: false });
      throw e;
    }
  },

  install: async () => {
    const update = get().available;
    if (!update) return;
    set({ installing: true });
    try {
      await update.downloadAndInstall();
      await relaunch();
    } finally {
      set({ installing: false });
    }
  },

  dismiss: () => set({ dismissed: true }),
}));
