import { create } from "zustand";

export type BackgroundOpStatus = "running" | "success" | "error";

export interface BackgroundOp {
  id: string;
  label: string;
  status: BackgroundOpStatus;
  detail?: string;
}

const FINISHED_LINGER_MS = 5000;

interface BackgroundOpsState {
  ops: BackgroundOp[];
  start: (label: string) => string;
  finish: (id: string, status: "success" | "error", detail?: string) => void;
}

/// Tracks long-running actions that shouldn't block a dialog for their whole
/// duration (e.g. cloning a repo over a slow connection) — surfaced in the
/// status bar, independent of whatever component originally kicked the
/// operation off (which may have already closed/unmounted by the time it
/// finishes).
export const useBackgroundOpsStore = create<BackgroundOpsState>((set) => ({
  ops: [],

  start: (label) => {
    const id = crypto.randomUUID();
    set((s) => ({ ops: [...s.ops, { id, label, status: "running" }] }));
    return id;
  },

  finish: (id, status, detail) => {
    set((s) => ({ ops: s.ops.map((o) => (o.id === id ? { ...o, status, detail } : o)) }));
    setTimeout(() => {
      set((s) => ({ ops: s.ops.filter((o) => o.id !== id) }));
    }, FINISHED_LINGER_MS);
  },
}));
