import { create } from "zustand";
import { check, type Update } from "@tauri-apps/plugin-updater";
import { relaunch } from "@tauri-apps/plugin-process";
import { useBackgroundOpsStore } from "./backgroundOpsStore";

interface UpdateState {
  available: Update | null;
  checking: boolean;
  installing: boolean;
  dismissed: boolean;

  checkNow: () => Promise<Update | null>;
  install: () => Promise<void>;
  dismiss: () => void;
}

function formatMb(bytes: number): string {
  return (bytes / (1024 * 1024)).toFixed(1);
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

  // A slow connection can make this take a while — rather than leave the
  // user staring at a toast that might scroll away or get dismissed with
  // no way to check back in, track it in the status bar the same way a
  // slow repo clone is (see backgroundOpsStore), with live byte progress.
  install: async () => {
    const update = get().available;
    if (!update) return;
    set({ installing: true });
    const { start, progress, finish } = useBackgroundOpsStore.getState();
    const opId = start(`Downloading GitSplash ${update.version}…`);
    let downloaded = 0;
    let total: number | undefined;
    try {
      await update.downloadAndInstall((event) => {
        if (event.event === "Started") {
          total = event.data.contentLength;
        } else if (event.event === "Progress") {
          downloaded += event.data.chunkLength;
          progress(
            opId,
            total ? `${formatMb(downloaded)}/${formatMb(total)} MB` : `${formatMb(downloaded)} MB`,
          );
        }
      });
      finish(opId, "success", "Installed — restarting…");
      await relaunch();
    } catch (e) {
      finish(opId, "error", "Update failed");
      throw e;
    } finally {
      set({ installing: false });
    }
  },

  dismiss: () => set({ dismissed: true }),
}));
