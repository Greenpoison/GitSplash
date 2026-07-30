import { create } from "zustand";
import { toast } from "sonner";

export interface UndoEntry {
  id: string;
  repoId: string;
  label: string;
  /// Set for actions whose undo/redo is a hard reset — i.e. it can discard
  /// uncommitted work made after the fact. Gated behind a confirmation
  /// dialog instead of firing immediately like safe entries (stage/unstage,
  /// soft-reset commit undo) do.
  destructive?: boolean;
  undo: () => Promise<void>;
  redo: () => Promise<void>;
}

interface PendingConfirm {
  entry: UndoEntry;
  direction: "undo" | "redo";
}

interface UndoState {
  undoStack: UndoEntry[];
  redoStack: UndoEntry[];
  busy: boolean;
  pendingConfirm: PendingConfirm | null;

  push: (entry: UndoEntry) => void;
  requestUndo: () => void;
  requestRedo: () => void;
  confirmPending: () => Promise<void>;
  cancelPending: () => void;
}

const MAX_STACK = 50;

async function run(
  entry: UndoEntry,
  direction: "undo" | "redo",
  set: (partial: Partial<UndoState>) => void,
  get: () => UndoState,
) {
  set({ busy: true });
  try {
    if (direction === "undo") {
      await entry.undo();
      set({
        undoStack: get().undoStack.filter((e) => e.id !== entry.id),
        redoStack: [...get().redoStack, entry],
      });
    } else {
      await entry.redo();
      set({
        redoStack: get().redoStack.filter((e) => e.id !== entry.id),
        undoStack: [...get().undoStack, entry],
      });
    }
  } catch (e) {
    toast.error(String(e));
  } finally {
    set({ busy: false });
  }
}

export const useUndoStore = create<UndoState>((set, get) => ({
  undoStack: [],
  redoStack: [],
  busy: false,
  pendingConfirm: null,

  push: (entry) =>
    set({
      undoStack: [...get().undoStack, entry].slice(-MAX_STACK),
      redoStack: [],
    }),

  requestUndo: () => {
    const { undoStack, busy } = get();
    if (busy || undoStack.length === 0) return;
    const entry = undoStack[undoStack.length - 1];
    if (entry.destructive) {
      set({ pendingConfirm: { entry, direction: "undo" } });
    } else {
      run(entry, "undo", set, get);
    }
  },

  requestRedo: () => {
    const { redoStack, busy } = get();
    if (busy || redoStack.length === 0) return;
    const entry = redoStack[redoStack.length - 1];
    if (entry.destructive) {
      set({ pendingConfirm: { entry, direction: "redo" } });
    } else {
      run(entry, "redo", set, get);
    }
  },

  confirmPending: async () => {
    const pending = get().pendingConfirm;
    if (!pending) return;
    set({ pendingConfirm: null });
    await run(pending.entry, pending.direction, set, get);
  },

  cancelPending: () => set({ pendingConfirm: null }),
}));
