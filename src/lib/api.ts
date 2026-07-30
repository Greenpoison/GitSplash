import { invoke } from "@tauri-apps/api/core";
import type {
  Account,
  BranchInfo,
  CommitNode,
  ConflictFile,
  FileChange,
  FileDiff,
  Group,
  MergeResult,
  PullRequestSummary,
  Repo,
  RepoGitStatus,
  SecretFile,
  Settings,
} from "./types";

// Repos
export const listRepos = () => invoke<Repo[]>("list_repos");
export const addRepo = (path: string, displayName?: string) =>
  invoke<Repo>("add_repo", { path, displayName: displayName ?? null });
export const removeRepo = (id: string) => invoke<void>("remove_repo", { id });
export const renameRepo = (id: string, displayName: string) =>
  invoke<Repo>("rename_repo", { id, displayName });
export const getRepoStatus = (id: string) => invoke<RepoGitStatus>("get_repo_status", { id });
export const getRepoStatuses = (ids: string[]) => invoke<RepoGitStatus[]>("get_repo_statuses", { ids });

// Groups
export const listGroups = () => invoke<Group[]>("list_groups");
export const createGroup = (name: string) => invoke<Group>("create_group", { name });
export const renameGroup = (id: string, name: string) => invoke<void>("rename_group", { id, name });
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
  invoke<Account>("generate_signing_key", { accountId });
export const getPublicKey = (accountId: string, keyKind: "auth" | "signing") =>
  invoke<string>("get_public_key", { accountId, keyKind });
export const deleteAccount = (id: string) => invoke<void>("delete_account", { id });
export const assignRepoAccount = (repoId: string, accountId: string | null) =>
  invoke<Repo>("assign_repo_account", { repoId, accountId });

// Batch git ops
export const batchUpdateGroup = (groupId: string, pull: boolean) =>
  invoke<string>("batch_update_group", { groupId, pull });

// Changes: diff, staging, commit
export const getFileChanges = (repoId: string) => invoke<FileChange[]>("get_file_changes", { repoId });
export const getFileDiff = (repoId: string, path: string, staged: boolean, isUntracked: boolean) =>
  invoke<FileDiff>("get_file_diff", { repoId, path, staged, isUntracked });
export const stageFile = (repoId: string, path: string) => invoke<void>("stage_file", { repoId, path });
export const unstageFile = (repoId: string, path: string) => invoke<void>("unstage_file", { repoId, path });
export const discardFile = (repoId: string, path: string, isUntracked: boolean) =>
  invoke<void>("discard_file", { repoId, path, isUntracked });
export const stageAll = (repoId: string) => invoke<void>("stage_all", { repoId });
export const unstageAll = (repoId: string) => invoke<void>("unstage_all", { repoId });
export const stageHunk = (repoId: string, path: string, hunkRaw: string) =>
  invoke<void>("stage_hunk", { repoId, path, hunkRaw });
export const unstageHunk = (repoId: string, path: string, hunkRaw: string) =>
  invoke<void>("unstage_hunk", { repoId, path, hunkRaw });
export const discardHunk = (repoId: string, path: string, hunkRaw: string) =>
  invoke<void>("discard_hunk", { repoId, path, hunkRaw });
export const commitChanges = (repoId: string, message: string) =>
  invoke<void>("commit_changes", { repoId, message });

// Merge conflict resolution
export const getConflictSections = (repoId: string, path: string) =>
  invoke<ConflictFile>("get_conflict_sections", { repoId, path });
export const writeResolvedFile = (repoId: string, path: string, content: string) =>
  invoke<void>("write_resolved_file", { repoId, path, content });
export const keepOurs = (repoId: string, path: string) => invoke<void>("keep_ours", { repoId, path });
export const keepTheirs = (repoId: string, path: string) => invoke<void>("keep_theirs", { repoId, path });

// Branches
export const listBranches = (repoId: string) => invoke<BranchInfo[]>("list_branches", { repoId });
export const getCommitGraph = (repoId: string, limit: number) =>
  invoke<CommitNode[]>("get_commit_graph", { repoId, limit });
export const checkoutBranch = (repoId: string, branch: string) =>
  invoke<void>("checkout_branch", { repoId, branch });
export const checkoutPreviousBranch = (repoId: string) =>
  invoke<string>("checkout_previous_branch", { repoId });
export const mergeBranch = (repoId: string, fromBranch: string) =>
  invoke<MergeResult>("merge_branch", { repoId, fromBranch });

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

// Misc
export const openRepoExternal = (repoId: string) => invoke<void>("open_repo_external", { repoId });
