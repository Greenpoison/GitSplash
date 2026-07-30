import { create } from "zustand";
import * as api from "@/lib/api";
import type { Account, Group, Repo, RepoGitStatus, Settings } from "@/lib/types";

export type View = "dashboard" | "settings";

interface AppState {
  repos: Repo[];
  groups: Group[];
  accounts: Account[];
  settings: Settings | null;
  statuses: Record<string, RepoGitStatus>;
  loaded: boolean;

  // Shared UI state — lifted here (rather than local component state) so
  // keyboard shortcuts and the command palette can drive the same dialogs
  // the sidebar/buttons do, from anywhere in the tree.
  view: View;
  commandPaletteOpen: boolean;
  addRepoDialogOpen: boolean;
  groupManagerOpen: boolean;
  shortcutsHelpOpen: boolean;
  createAccountDialogOpen: boolean;
  // Set to a repo id right after that repo is added, when it was the first
  // repo added and no groups exist yet — prompts a quick "put it in a group?"
  // dialog. null means the prompt is closed.
  groupPromptRepoId: string | null;

  setView: (view: View) => void;
  setCommandPaletteOpen: (open: boolean) => void;
  setAddRepoDialogOpen: (open: boolean) => void;
  setGroupManagerOpen: (open: boolean) => void;
  setShortcutsHelpOpen: (open: boolean) => void;
  setCreateAccountDialogOpen: (open: boolean) => void;
  setGroupPromptRepoId: (repoId: string | null) => void;

  refreshAll: () => Promise<void>;
  refreshRepos: () => Promise<void>;
  refreshGroups: () => Promise<void>;
  refreshAccounts: () => Promise<void>;
  refreshSettings: () => Promise<void>;
  refreshStatuses: (ids?: string[]) => Promise<void>;
  setStatus: (status: RepoGitStatus) => void;
}

export const useAppStore = create<AppState>((set, get) => ({
  repos: [],
  groups: [],
  accounts: [],
  settings: null,
  statuses: {},
  loaded: false,

  view: "dashboard",
  commandPaletteOpen: false,
  addRepoDialogOpen: false,
  groupManagerOpen: false,
  shortcutsHelpOpen: false,
  createAccountDialogOpen: false,
  groupPromptRepoId: null,

  setView: (view) => set({ view }),
  setCommandPaletteOpen: (open) => set({ commandPaletteOpen: open }),
  setAddRepoDialogOpen: (open) => set({ addRepoDialogOpen: open }),
  setGroupManagerOpen: (open) => set({ groupManagerOpen: open }),
  setShortcutsHelpOpen: (open) => set({ shortcutsHelpOpen: open }),
  setCreateAccountDialogOpen: (open) => set({ createAccountDialogOpen: open }),
  setGroupPromptRepoId: (repoId) => set({ groupPromptRepoId: repoId }),

  refreshAll: async () => {
    await Promise.all([
      get().refreshRepos(),
      get().refreshGroups(),
      get().refreshAccounts(),
      get().refreshSettings(),
    ]);
    await get().refreshStatuses();
    set({ loaded: true });
  },

  refreshRepos: async () => {
    const repos = await api.listRepos();
    set({ repos });
  },

  refreshGroups: async () => {
    const groups = await api.listGroups();
    set({ groups });
  },

  refreshAccounts: async () => {
    const accounts = await api.listAccounts();
    set({ accounts });
  },

  refreshSettings: async () => {
    const settings = await api.getSettings();
    set({ settings });
  },

  refreshStatuses: async (ids) => {
    const targetIds = ids ?? get().repos.map((r) => r.id);
    if (targetIds.length === 0) return;
    const statuses = await api.getRepoStatuses(targetIds);
    set((state) => {
      const next = { ...state.statuses };
      for (const status of statuses) next[status.repoId] = status;
      return { statuses: next };
    });
  },

  setStatus: (status) =>
    set((state) => ({ statuses: { ...state.statuses, [status.repoId]: status } })),
}));
