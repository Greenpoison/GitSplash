export interface Account {
  id: string;
  name: string;
  hostAlias: string;
  hostname: string;
  githubUsername: string | null;
  sshKeyPath: string;
  signingKeyPath: string | null;
  createdAt: string;
}

export interface GhAuthProgress {
  line: string;
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
  previousHeadSha: string | null;
  newHeadSha: string | null;
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

export interface FileChange {
  path: string;
  origPath: string | null;
  indexStatus: string;
  worktreeStatus: string;
  isUntracked: boolean;
  isConflicted: boolean;
}

export type DiffLineKind = "context" | "add" | "del";

export interface DiffLine {
  kind: DiffLineKind;
  content: string;
}

export interface DiffHunk {
  header: string;
  lines: DiffLine[];
  raw: string;
}

export interface FileDiff {
  isBinary: boolean;
  hunks: DiffHunk[];
}

export type ConflictSegment =
  | { kind: "plain"; text: string }
  | {
      kind: "conflict";
      oursLabel: string;
      theirsLabel: string;
      ours: string;
      theirs: string;
      base: string | null;
    };

export interface ConflictFile {
  isBinary: boolean;
  segments: ConflictSegment[];
}

export interface BlameLine {
  lineNumber: number;
  commitHash: string;
  author: string;
  authorTime: string;
  summary: string;
  content: string;
}
