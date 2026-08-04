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
  useSshOverHttps: boolean;
  createdAt: string;
}

export interface GpgKeyInfo {
  keyId: string;
  uid: string;
}

export interface AccountUploadResult {
  account: Account;
  githubUploadError: string | null;
}

export interface GhAuthProgress {
  line: string;
}

// Emitted (tagged with a caller-generated opId) by clone-progress,
// fetch-progress, and push-progress alike — see src-tauri/src/git/progress.rs.
export interface GitProgress {
  opId: string;
  stage: string;
  percent: number | null;
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
  upstream: string | null;
  // Set only when the current branch has diverged from the repo's default
  // branch (main/master) in either direction — distinct from
  // ahead/behind/upstream above, which are relative to this branch's own
  // tracking branch (usually itself, or nothing, for a feature branch —
  // never main).
  defaultBranch: string | null;
  behindDefault: number;
  aheadDefault: number;
  error: string | null;
}

export interface Settings {
  gitGuiPath: string | null;
  batchConcurrency: number;
  tutorialCompleted: boolean;
  checkForUpdates: boolean;
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
  isMerged: boolean;
  isGone: boolean;
  isRemote: boolean;
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

export interface HealthIssue {
  id: string;
  severity: "warning" | "info";
  title: string;
  detail: string;
}

export interface ReflogEntry {
  hash: string;
  selector: string;
  action: string;
  date: string;
}

export interface StashEntry {
  index: number;
  message: string;
}

export interface PushOutcome {
  pushed: boolean;
  setUpstream: boolean;
  rejected: boolean;
  message: string | null;
}

export interface FetchOutcome {
  fetched: boolean;
  pulled: boolean;
  skippedPull: boolean;
  diverged: boolean;
  upstream: string | null;
  branch: string | null;
  dirty: boolean;
  message: string | null;
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

export interface PrTemplate {
  name: string;
  content: string;
}

export interface PrCheck {
  name: string;
  status: string;
  conclusion: string | null;
  detailsUrl: string | null;
}

export interface PrReview {
  author: string;
  state: string;
  body: string;
  submittedAt: string | null;
}

export interface PrComment {
  author: string;
  body: string;
  createdAt: string;
}

export interface PrDiffFile {
  path: string;
  isBinary: boolean;
  insertions: number;
  deletions: number;
  hunks: DiffHunk[];
}

export interface PullRequestDetail {
  number: number;
  title: string;
  body: string;
  url: string;
  reviewDecision: string | null;
  checks: PrCheck[];
  reviews: PrReview[];
  comments: PrComment[];
  files: PrDiffFile[];
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
  insertions: number | null;
  deletions: number | null;
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
