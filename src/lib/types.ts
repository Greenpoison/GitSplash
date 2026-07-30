export interface Account {
  id: string;
  name: string;
  hostAlias: string;
  githubUsername: string | null;
  sshKeyPath: string;
  signingKeyPath: string | null;
  createdAt: string;
}

export interface Group {
  id: string;
  name: string;
  createdAt: string;
}

export interface Repo {
  id: string;
  path: string;
  displayName: string;
  accountId: string | null;
  lastFetchedAt: string | null;
  createdAt: string;
  groupIds: string[];
}

export interface RepoGitStatus {
  repoId: string;
  branch: string | null;
  ahead: number;
  behind: number;
  isDirty: boolean;
  hasUpstream: boolean;
  error: string | null;
}

export interface Settings {
  gitGuiPath: string | null;
  batchConcurrency: number;
}

export type BatchPhase = "started" | "success" | "failed" | "skipped";

export interface BatchEvent {
  runId: string;
  repoId: string;
  repoName: string;
  phase: BatchPhase;
  message: string | null;
  pulled: boolean;
}

export interface CommitNode {
  hash: string;
  parents: string[];
  refs: string[];
  subject: string;
  author: string;
  date: string;
}

export interface BranchInfo {
  name: string;
  isCurrent: boolean;
  upstream: string | null;
}

export interface MergeResult {
  success: boolean;
  conflictedFiles: string[];
  message: string | null;
}

export interface SecretFile {
  relativePath: string;
  absolutePath: string;
  sizeBytes: number;
}

export interface PullRequestSummary {
  number: number;
  title: string;
  url: string;
  state: string;
  isDraft: boolean;
  headRefName: string;
  baseRefName: string;
}
