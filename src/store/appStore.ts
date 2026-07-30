import { create } from "zustand";
import * as api from "@/lib/api";
import type { Account, Group, Repo, RepoGitStatus, Settings } from "@/lib/types";

interface AppState {
  repos: Repo[];
  groups: Group[];
  accounts: Account[];
  settings: Settings | null;
  statuses: Record<string, RepoGitStatus>;
  loaded: boolean;

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
