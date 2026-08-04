import type { Account, BranchInfo, Group, Repo, RepoGitStatus, Settings } from "@/lib/types";
import { generateFakeHistory, type FakeHistory } from "./fakeHistory";

const NOW = "2026-08-03T00:00:00.000Z";

export const fakeRepos: Repo[] = [
  {
    id: "repo-aurora",
    path: "C:/mock/projects/aurora",
    displayName: "aurora",
    accountId: null,
    lastFetchedAt: NOW,
    createdAt: NOW,
    groupIds: [],
  },
  {
    id: "repo-beacon",
    path: "C:/mock/projects/beacon",
    displayName: "beacon",
    accountId: null,
    lastFetchedAt: null,
    createdAt: NOW,
    groupIds: [],
  },
  {
    id: "repo-comet",
    path: "C:/mock/projects/comet",
    displayName: "comet",
    accountId: null,
    lastFetchedAt: NOW,
    createdAt: NOW,
    groupIds: [],
  },
];

export const fakeGroups: Group[] = [];
export const fakeAccounts: Account[] = [];

export const fakeSettings: Settings = {
  gitGuiPath: null,
  batchConcurrency: 3,
  tutorialCompleted: true,
  checkForUpdates: false,
};

const historyByRepo = new Map<string, FakeHistory>();

function historyFor(repoId: string): FakeHistory {
  let history = historyByRepo.get(repoId);
  if (!history) {
    let seed = 1;
    for (const ch of repoId) seed = (seed * 31 + ch.charCodeAt(0)) % 100000;
    history = generateFakeHistory(seed);
    historyByRepo.set(repoId, history);
  }
  return history;
}

export function getFakeCommits(repoId: string) {
  return historyFor(repoId).commits;
}

export function getFakeBranches(repoId: string): BranchInfo[] {
  return historyFor(repoId).branches;
}

export function getFakeTags(repoId: string) {
  return historyFor(repoId).tags;
}

export function getFakeCommitFiles(repoId: string, hash: string) {
  return historyFor(repoId).filesByHash.get(hash) ?? [];
}

export function getFakeFileHistory(repoId: string, path: string) {
  const history = historyFor(repoId);
  return history.commits.filter((c) => history.filesByHash.get(c.hash)?.some((f) => f.path === path));
}

export function getFakeStatus(repoId: string): RepoGitStatus {
  const current = getFakeBranches(repoId).find((b) => b.isCurrent);
  return {
    repoId,
    branch: current?.name ?? null,
    ahead: 1,
    behind: 0,
    isDirty: false,
    hasUpstream: !!current?.upstream,
    upstream: current?.upstream ?? null,
    defaultBranch: null,
    behindDefault: 0,
    error: null,
  };
}
