/// Stand-in for `@tauri-apps/api/core`, swapped in only under `vite --mode
/// mock` (see vite.config.ts) so the app can run in a plain browser tab —
/// no native shell, no real git repos — for visually checking UI/layout
/// work without a Tauri build. Covers enough read commands to browse the
/// Dashboard, a repo's Changes/Branches/PRs tabs, and Repo History with
/// realistic-looking data; unmodeled commands fall through to a best-effort
/// default (see `unmocked` below) and log to the console so a gap is
/// obvious rather than silently wrong.
import * as store from "./fakeStore";

type Args = Record<string, unknown>;

function unmocked<T>(cmd: string, args: Args): T {
  console.warn(`[mock-tauri] unmocked command "${cmd}"`, args);
  // Heuristic fallback: plural list_*/get_*s commands expect an array,
  // most others expect a nullable single value or void.
  if (cmd.startsWith("list_") || (cmd.startsWith("get_") && cmd.endsWith("s"))) {
    return [] as unknown as T;
  }
  return undefined as unknown as T;
}

export async function invoke<T>(cmd: string, rawArgs?: Args): Promise<T> {
  const a = rawArgs ?? {};
  const repoId = a.repoId as string | undefined;

  switch (cmd) {
    case "list_repos":
      return store.fakeRepos as unknown as T;
    case "list_groups":
      return store.fakeGroups as unknown as T;
    case "list_accounts":
      return store.fakeAccounts as unknown as T;
    case "get_settings":
      return store.fakeSettings as unknown as T;
    case "get_repo_statuses": {
      const ids = (a.ids as string[] | undefined) ?? store.fakeRepos.map((r) => r.id);
      return ids.map((id) => store.getFakeStatus(id)) as unknown as T;
    }
    case "get_repo_status":
      return store.getFakeStatus(repoId!) as unknown as T;

    case "list_branches":
      // A real invoke() response is always a freshly-deserialized array, so
      // React's setState always sees a new reference and re-renders. This
      // mock mutates a single cached array in place (see fakeStore.ts) for
      // simplicity — returning that same reference here instead of a copy
      // would make React's Object.is bail-out silently swallow updates
      // after the first one, which real usage could never hit.
      return [...store.getFakeBranches(repoId!)] as unknown as T;
    case "get_head_sha":
      return (store.getFakeCommits(repoId!)[0]?.hash ?? null) as unknown as T;
    case "resolve_ref": {
      const branches = store.getFakeBranches(repoId!);
      const match = branches.find((b) => b.name === a.rev);
      return (match ? store.getFakeCommits(repoId!)[0]?.hash : (a.rev as string)) as unknown as T;
    }
    case "checkout_branch": {
      const branches = store.getFakeBranches(repoId!);
      const target = a.branch as string;
      let found = false;
      for (const b of branches) {
        b.isCurrent = b.name === target;
        if (b.isCurrent) found = true;
      }
      if (!found) {
        branches.push({ name: target, isCurrent: true, upstream: null, isMerged: false, isGone: false, isRemote: false });
      }
      return undefined as unknown as T;
    }
    case "create_branch": {
      const branches = store.getFakeBranches(repoId!);
      for (const b of branches) b.isCurrent = false;
      branches.push({ name: a.name as string, isCurrent: true, upstream: null, isMerged: false, isGone: false, isRemote: false });
      return undefined as unknown as T;
    }
    case "delete_branch": {
      const branches = store.getFakeBranches(repoId!);
      const idx = branches.findIndex((b) => b.name === a.name);
      if (idx >= 0) branches.splice(idx, 1);
      return undefined as unknown as T;
    }
    case "get_in_progress_rebase":
    case "get_in_progress_cherry_pick":
      return null as unknown as T;

    case "get_commit_graph": {
      const limit = (a.limit as number) ?? 60;
      return store.getFakeCommits(repoId!).slice(0, limit) as unknown as T;
    }
    case "get_commit": {
      const commit = store.getFakeCommits(repoId!).find((c) => c.hash === a.rev);
      return (commit ?? null) as unknown as T;
    }
    case "list_tags":
      return store.getFakeTags(repoId!) as unknown as T;
    case "search_commits": {
      const query = ((a.query as string) ?? "").toLowerCase();
      const matches = store.getFakeCommits(repoId!).filter((c) => c.subject.toLowerCase().includes(query));
      return matches as unknown as T;
    }
    case "get_commit_files":
      return store.getFakeCommitFiles(repoId!, a.hash as string) as unknown as T;
    case "get_file_history":
    case "get_file_history_across_branches":
      return store.getFakeFileHistory(repoId!, a.path as string) as unknown as T;

    case "get_rebase_candidates":
    case "get_cherry_pick_candidates":
      return [] as unknown as T;

    case "get_file_changes":
    case "list_tracked_files":
    case "list_skip_worktree_files":
    case "list_stashes":
    case "list_worktrees":
    case "list_submodules":
    case "list_remote_tags":
    case "compare_branches":
    case "run_health_check":
    case "scan_repo_secrets":
    case "list_pull_requests":
    case "get_pull_request_templates":
      return [] as unknown as T;

    case "is_gh_available":
    case "is_account_gh_authenticated":
      return false as unknown as T;

    default:
      return unmocked<T>(cmd, a);
  }
}
