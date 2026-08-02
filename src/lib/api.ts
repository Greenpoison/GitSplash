import { invoke } from "@tauri-apps/api/core";
import type {
  Account,
  AccountUploadResult,
  BlameLine,
  BranchInfo,
  CherryPickInProgress,
  CherryPickStepResult,
  CommitNode,
  CompareFile,
  ConflictFile,
  FetchOutcome,
  PushOutcome,
  HealthIssue,
  ReflogEntry,
  FileChange,
  FileDiff,
  FileTextContent,
  GitflowFinishResult,
  GitflowKind,
  GpgKeyInfo,
  Group,
  MergeResult,
  PullRequestSummary,
  PullRequestDetail,
  PrTemplate,
  RebaseInProgress,
  RebasePlanItem,
  RebaseStepResult,
  RemoteTag,
  Repo,
  RepoGitStatus,
  SecretFile,
  Settings,
  StashEntry,
  SubmoduleInfo,
  TagInfo,
  WorktreeInfo,
} from "./types";

// Repos
export const listRepos = () => invoke<Repo[]>("list_repos");
export const addRepo = (path: string, displayName?: string) =>
  invoke<Repo>("add_repo", { path, displayName: displayName ?? null });
export const cloneRepo = (
  url: string,
  parentDir: string,
  folderName: string,
  displayName?: string,
  accountId?: string,
) =>
  invoke<Repo>("clone_repo", {
    url,
    parentDir,
    folderName,
    displayName: displayName ?? null,
    accountId: accountId ?? null,
  });
export const initRepo = (
  parentDir: string,
  folderName: string,
  displayName: string | undefined,
  initialBranch: string,
) =>
  invoke<Repo>("init_repo", {
    parentDir,
    folderName,
    displayName: displayName ?? null,
    initialBranch,
  });
export const removeRepo = (id: string) => invoke<void>("remove_repo", { id });
export const renameRepo = (id: string, displayName: string) =>
  invoke<Repo>("rename_repo", { id, displayName });
export const getRepoStatus = (id: string) => invoke<RepoGitStatus>("get_repo_status", { id });
export const getRepoStatuses = (ids: string[]) => invoke<RepoGitStatus[]>("get_repo_statuses", { ids });

// Groups
export const listGroups = () => invoke<Group[]>("list_groups");
export const createGroup = (name: string, color: string | null) =>
  invoke<Group>("create_group", { name, color });
export const renameGroup = (id: string, name: string) => invoke<void>("rename_group", { id, name });
export const setGroupColor = (id: string, color: string | null) =>
  invoke<void>("set_group_color", { id, color });
export const deleteGroup = (id: string) => invoke<void>("delete_group", { id });
export const setRepoGroups = (repoId: string, groupIds: string[]) =>
  invoke<void>("set_repo_groups", { repoId, groupIds });

// Accounts
export const listAccounts = () => invoke<Account[]>("list_accounts");
export const createAccount = (
  name: string,
  hostAlias: string,
  githubUsername?: string,
  hostname?: string,
) => invoke<Account>("create_account", { name, hostAlias, githubUsername: githubUsername ?? null, hostname: hostname ?? null });
export const createAccountViaBrowser = (name: string, hostAlias: string, hostname?: string) =>
  invoke<Account>("create_account_via_browser", { name, hostAlias, hostname: hostname ?? null });
export const generateSigningKey = (accountId: string) =>
  invoke<AccountUploadResult>("generate_signing_key", { accountId });
export const getPublicKey = (accountId: string, keyKind: "auth" | "signing") =>
  invoke<string>("get_public_key", { accountId, keyKind });
export const deleteAccount = (id: string) => invoke<void>("delete_account", { id });
export const assignRepoAccount = (repoId: string, accountId: string | null) =>
  invoke<Repo>("assign_repo_account", { repoId, accountId });
export const setAccountGpgSigning = (accountId: string, gpgKeyId: string) =>
  invoke<AccountUploadResult>("set_account_gpg_signing", { accountId, gpgKeyId });
export const setAccountSshSigning = (accountId: string) =>
  invoke<Account>("set_account_ssh_signing", { accountId });
export const setAccountSshOverHttps = (accountId: string, enabled: boolean) =>
  invoke<Account>("set_account_ssh_over_https", { accountId, enabled });
export const listGpgSecretKeys = () => invoke<GpgKeyInfo[]>("list_gpg_secret_keys");
export const getGpgPublicKey = (keyId: string) => invoke<string>("get_gpg_public_key", { keyId });

// Batch git ops
export const batchUpdateGroup = (groupId: string, pull: boolean) =>
  invoke<string>("batch_update_group", { groupId, pull });
export const batchPushGroup = (groupId: string) => invoke<string>("batch_push_group", { groupId });
export const fetchRepo = (repoId: string, pull: boolean) =>
  invoke<FetchOutcome>("fetch_repo", { repoId, pull });
export const pushRepo = (repoId: string, force: boolean) =>
  invoke<PushOutcome>("push_repo", { repoId, force });

// Branch comparison
export const compareBranches = (repoId: string, base: string, branch: string) =>
  invoke<CompareFile[]>("compare_branches", { repoId, base, branch });
export const getCompareFileDiff = (repoId: string, base: string, branch: string, path: string) =>
  invoke<FileDiff>("get_compare_file_diff", { repoId, base, branch, path });
export const listBranchFiles = (repoId: string, branch: string) =>
  invoke<string[]>("list_branch_files", { repoId, branch });
export const readBranchFile = (repoId: string, branch: string, path: string) =>
  invoke<string | null>("read_branch_file", { repoId, branch, path });
export const getCommitFiles = (repoId: string, hash: string) =>
  invoke<CompareFile[]>("get_commit_files", { repoId, hash });
export const getCommitFileDiff = (repoId: string, hash: string, path: string) =>
  invoke<FileDiff>("get_commit_file_diff", { repoId, hash, path });

// Changes: diff, staging, commit
export const getFileChanges = (repoId: string) => invoke<FileChange[]>("get_file_changes", { repoId });
export const getFileDiff = (repoId: string, path: string, staged: boolean, isUntracked: boolean) =>
  invoke<FileDiff>("get_file_diff", { repoId, path, staged, isUntracked });
export const stageFile = (repoId: string, path: string) => invoke<void>("stage_file", { repoId, path });
export const unstageFile = (repoId: string, path: string) => invoke<void>("unstage_file", { repoId, path });
export const discardFile = (repoId: string, path: string, isUntracked: boolean) =>
  invoke<void>("discard_file", { repoId, path, isUntracked });
export const untrackPaths = (repoId: string, paths: string[]) =>
  invoke<void>("untrack_paths", { repoId, paths });
export const skipWorktree = (repoId: string, paths: string[]) =>
  invoke<void>("skip_worktree", { repoId, paths });
export const unskipWorktree = (repoId: string, paths: string[]) =>
  invoke<void>("unskip_worktree", { repoId, paths });
export const listSkipWorktreeFiles = (repoId: string) =>
  invoke<string[]>("list_skip_worktree_files", { repoId });
export const stageAll = (repoId: string) => invoke<void>("stage_all", { repoId });
export const unstageAll = (repoId: string) => invoke<void>("unstage_all", { repoId });
export const stageHunk = (repoId: string, path: string, hunkRaw: string) =>
  invoke<void>("stage_hunk", { repoId, path, hunkRaw });
export const unstageHunk = (repoId: string, path: string, hunkRaw: string) =>
  invoke<void>("unstage_hunk", { repoId, path, hunkRaw });
export const discardHunk = (repoId: string, path: string, hunkRaw: string) =>
  invoke<void>("discard_hunk", { repoId, path, hunkRaw });
export const commitChanges = (repoId: string, message: string) =>
  invoke<string | null>("commit_changes", { repoId, message });
export const amendCommit = (repoId: string, message: string) =>
  invoke<string | null>("amend_commit", { repoId, message });

// Stash
export const stashPush = (repoId: string, message: string | undefined, includeUntracked: boolean) =>
  invoke<void>("stash_push", { repoId, message: message ?? null, includeUntracked });
export const listStashes = (repoId: string) => invoke<StashEntry[]>("list_stashes", { repoId });
export const stashPop = (repoId: string, index: number) => invoke<void>("stash_pop", { repoId, index });
export const stashApply = (repoId: string, index: number) => invoke<void>("stash_apply", { repoId, index });
export const stashDrop = (repoId: string, index: number) => invoke<void>("stash_drop", { repoId, index });

// Undo/redo primitives
export const resetTo = (repoId: string, sha: string, mode: "soft" | "mixed" | "hard") =>
  invoke<void>("reset_to", { repoId, sha, mode });
export const getHeadSha = (repoId: string) => invoke<string | null>("get_head_sha", { repoId });
export const resolveRef = (repoId: string, rev: string) => invoke<string>("resolve_ref", { repoId, rev });

// Merge conflict resolution
export const getConflictSections = (repoId: string, path: string) =>
  invoke<ConflictFile>("get_conflict_sections", { repoId, path });
export const writeResolvedFile = (repoId: string, path: string, content: string) =>
  invoke<void>("write_resolved_file", { repoId, path, content });
export const keepOurs = (repoId: string, path: string) => invoke<void>("keep_ours", { repoId, path });
export const keepTheirs = (repoId: string, path: string) => invoke<void>("keep_theirs", { repoId, path });

// File history & blame
export const listTrackedFiles = (repoId: string) => invoke<string[]>("list_tracked_files", { repoId });
export const getFileHistory = (repoId: string, path: string, limit: number) =>
  invoke<CommitNode[]>("get_file_history", { repoId, path, limit });
export const getBlame = (repoId: string, path: string) => invoke<BlameLine[]>("get_blame", { repoId, path });
export const searchCommits = (repoId: string, query: string, searchContent: boolean, limit: number) =>
  invoke<CommitNode[]>("search_commits", { repoId, query, searchContent, limit });
export const getReflog = (repoId: string, limit: number) =>
  invoke<ReflogEntry[]>("get_reflog", { repoId, limit });
export const runHealthCheck = (repoId: string) => invoke<HealthIssue[]>("run_health_check", { repoId });
export const readFileText = (repoId: string, path: string) =>
  invoke<FileTextContent>("read_file_text", { repoId, path });
export const writeFileText = (
  repoId: string,
  path: string,
  content: string,
  expectedModifiedAt: number | null,
) => invoke<number | null>("write_file_text", { repoId, path, content, expectedModifiedAt });

// Branches
export const listBranches = (repoId: string) => invoke<BranchInfo[]>("list_branches", { repoId });
export const getCommitGraph = (repoId: string, limit: number) =>
  invoke<CommitNode[]>("get_commit_graph", { repoId, limit });
export const checkoutBranch = (repoId: string, branch: string) =>
  invoke<void>("checkout_branch", { repoId, branch });
export const createBranch = (repoId: string, name: string, base?: string) =>
  invoke<void>("create_branch", { repoId, name, base });
export const createBranchAt = (repoId: string, name: string, sha: string) =>
  invoke<void>("create_branch_at", { repoId, name, sha });
export const deleteBranch = (repoId: string, name: string, force: boolean) =>
  invoke<void>("delete_branch", { repoId, name, force });
export const checkoutPreviousBranch = (repoId: string) =>
  invoke<string>("checkout_previous_branch", { repoId });
export const mergeBranch = (repoId: string, fromBranch: string, noFf: boolean) =>
  invoke<MergeResult>("merge_branch", { repoId, fromBranch, noFf });
export const getCommit = (repoId: string, rev: string) => invoke<CommitNode | null>("get_commit", { repoId, rev });

// Tags
export const listTags = (repoId: string) => invoke<TagInfo[]>("list_tags", { repoId });
export const listRemoteTags = (repoId: string) => invoke<RemoteTag[]>("list_remote_tags", { repoId });
export const createTag = (
  repoId: string,
  name: string,
  target: string,
  message: string | undefined,
  force: boolean,
) => invoke<void>("create_tag", { repoId, name, target, message, force });
export const deleteTag = (repoId: string, name: string) => invoke<void>("delete_tag", { repoId, name });
export const pushTag = (repoId: string, name: string, force: boolean) =>
  invoke<void>("push_tag", { repoId, name, force });
export const pushAllTags = (repoId: string) => invoke<void>("push_all_tags", { repoId });
export const deleteRemoteTag = (repoId: string, name: string) => invoke<void>("delete_remote_tag", { repoId, name });
export const fetchTags = (repoId: string) => invoke<void>("fetch_tags", { repoId });

// Interactive rebase
export const getRebaseCandidates = (repoId: string, onto: string) =>
  invoke<CommitNode[]>("get_rebase_candidates", { repoId, onto });
export const getInProgressRebase = (repoId: string) =>
  invoke<RebaseInProgress | null>("get_in_progress_rebase", { repoId });
export const startRebase = (repoId: string, onto: string, plan: RebasePlanItem[]) =>
  invoke<RebaseStepResult>("start_rebase", { repoId, onto, plan });
export const continueRebase = (repoId: string) =>
  invoke<RebaseStepResult>("continue_rebase", { repoId });
export const abortRebase = (repoId: string) => invoke<void>("abort_rebase", { repoId });

// Interactive cherry-pick
export const getCherryPickCandidates = (repoId: string, sourceBranch: string) =>
  invoke<CommitNode[]>("get_cherry_pick_candidates", { repoId, sourceBranch });
export const getInProgressCherryPick = (repoId: string) =>
  invoke<CherryPickInProgress | null>("get_in_progress_cherry_pick", { repoId });
export const startCherryPick = (repoId: string, shas: string[]) =>
  invoke<CherryPickStepResult>("start_cherry_pick", { repoId, shas });
export const continueCherryPick = (repoId: string) =>
  invoke<CherryPickStepResult>("continue_cherry_pick", { repoId });
export const abortCherryPick = (repoId: string) => invoke<void>("abort_cherry_pick", { repoId });

// Worktrees
export const listWorktrees = (repoId: string) => invoke<WorktreeInfo[]>("list_worktrees", { repoId });
export const addWorktree = (repoId: string, targetPath: string, branch: string, createBranch: boolean) =>
  invoke<void>("add_worktree", { repoId, targetPath, branch, createBranch });
export const removeWorktree = (repoId: string, targetPath: string, force: boolean) =>
  invoke<void>("remove_worktree", { repoId, targetPath, force });
export const pruneWorktrees = (repoId: string) => invoke<void>("prune_worktrees", { repoId });

// Submodules
export const listSubmodules = (repoId: string) => invoke<SubmoduleInfo[]>("list_submodules", { repoId });
export const updateSubmodules = (repoId: string, paths: string[]) =>
  invoke<void>("update_submodules", { repoId, paths });

// Gitflow helpers
export const startGitflowBranch = (repoId: string, kind: GitflowKind, name: string, baseBranch: string) =>
  invoke<void>("start_gitflow_branch", { repoId, kind, name, baseBranch });
export const finishGitflowBranch = (
  repoId: string,
  kind: GitflowKind,
  name: string,
  targets: string[],
  tag: string | undefined,
  deleteBranch: boolean,
) => invoke<GitflowFinishResult>("finish_gitflow_branch", { repoId, kind, name, targets, tag: tag ?? null, deleteBranch });

// Settings
export const getSettings = () => invoke<Settings>("get_settings");
export const saveSettings = (settings: Settings) => invoke<void>("save_settings", { settings });

// Secrets
export const scanRepoSecrets = (repoId: string) => invoke<SecretFile[]>("scan_repo_secrets", { repoId });
export const exportSecretsBundle = (
  repoId: string,
  files: string[],
  destZipPath: string,
  password?: string,
) => invoke<void>("export_secrets_bundle", { repoId, files, destZipPath, password: password ?? null });

// Pull requests (via gh CLI)
export const isGhAvailable = () => invoke<boolean>("is_gh_available");
export const isAccountGhAuthenticated = (accountId: string) =>
  invoke<boolean>("is_account_gh_authenticated", { accountId });
export const listPullRequests = (repoId: string) => invoke<PullRequestSummary[]>("list_pull_requests", { repoId });
export const createPullRequest = (
  repoId: string,
  title: string,
  body: string,
  base: string,
  draft: boolean,
) => invoke<string>("create_pull_request", { repoId, title, body, base, draft });
export const mergePullRequest = (repoId: string, number: number, method: "merge" | "squash" | "rebase") =>
  invoke<string>("merge_pull_request", { repoId, number, method });
export const getPullRequestDetail = (repoId: string, number: number) =>
  invoke<PullRequestDetail>("get_pull_request_detail", { repoId, number });
export const getPullRequestTemplates = (repoId: string) =>
  invoke<PrTemplate[]>("get_pull_request_templates", { repoId });

// Misc
export const openRepoExternal = (repoId: string) => invoke<void>("open_repo_external", { repoId });
