export type SigningMethod = "ssh" | "gpg";

export interface Account {
  id: string;
  name: string;
  hostAlias: string;
  hostname: string;
  githubUsername: string | null;
  sshKeyPath: string;
  signingKeyPath: string | null;
  signingMethod: SigningMethod;
  gpgKeyId: string | null;
  createdAt: string;
}

export interface GpgKeyInfo {
  keyId: string;
  uid: string;
}

export interface GhAuthProgress {
  line: string;
}

export interface Group {
  id: string;
  name: string;
  color: string | null;
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
  tutorialCompleted: boolean;
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
  body: string;
  author: string;
  date: string;
}

export interface BranchInfo {
  name: string;
  isCurrent: boolean;
  upstream: string | null;
}

export interface TagInfo {
  name: string;
  hash: string;
  isAnnotated: boolean;
  message: string | null;
  tagger: string | null;
  date: string | null;
}

export interface RemoteTag {
  name: string;
  hash: string;
}

export interface MergeResult {
  success: boolean;
  conflictedFiles: string[];
  message: string | null;
  previousHeadSha: string | null;
  newHeadSha: string | null;
}

export type RebaseAction = "pick" | "reword" | "squash" | "fixup" | "drop";

export interface RebasePlanItem {
  sha: string;
  action: RebaseAction;
  message: string | null;
}

export interface RebaseStepResult {
  status: "done" | "conflict";
  conflictedFiles: string[];
  message: string | null;
  previousHeadSha: string | null;
  newHeadSha: string | null;
  step: number;
  totalSteps: number;
}

export interface RebaseInProgress {
  originalBranch: string;
  currentStep: number;
  totalSteps: number;
  conflictedFiles: string[];
}

export interface CherryPickStepResult {
  status: "done" | "conflict";
  conflictedFiles: string[];
  message: string | null;
  previousHeadSha: string | null;
  newHeadSha: string | null;
  step: number;
  totalSteps: number;
}

export interface CherryPickInProgress {
  currentStep: number;
  totalSteps: number;
  conflictedFiles: string[];
}

export interface WorktreeInfo {
  path: string;
  headSha: string | null;
  branch: string | null;
  isDetached: boolean;
  isLocked: boolean;
  isPrunable: boolean;
}

export type SubmoduleStatusKind = "uninitialized" | "up-to-date" | "modified" | "conflict";

export interface SubmoduleInfo {
  path: string;
  sha: string;
  status: SubmoduleStatusKind;
}

export type GitflowKind = "feature" | "release" | "hotfix";

export interface GitflowFinishResult {
  success: boolean;
  completedSteps: string[];
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

export type CompareFileStatus = "added" | "modified" | "deleted" | "renamed" | "copied";

export interface CompareFile {
  path: string;
  origPath: string | null;
  status: CompareFileStatus;
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

export interface FileTextContent {
  isBinary: boolean;
  content: string;
  modifiedAt: number | null;
}

export interface BlameLine {
  lineNumber: number;
  commitHash: string;
  author: string;
  authorTime: string;
  summary: string;
  content: string;
}
