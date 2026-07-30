# GitSplash — progress & roadmap (temporary working doc)

This file exists so work can pick up cleanly on another machine. It's a
snapshot, not permanent documentation — delete it once the roadmap below is
either finished or moved somewhere more permanent.

## What GitSplash is

A Tauri v2 + React + TypeScript + Tailwind/shadcn desktop app (Windows) for
managing many local git repos across multiple GitHub accounts. Goal: a real
rival to Sublime Merge / GitKraken / git-cola — not a thin wrapper.

## Standing constraints (don't relitigate these)

- **No AI features or AI agents, anywhere in the product.** Explicit,
  non-negotiable product decision.
- **Never push to a remote automatically.** Every git-changing action so far
  (fetch, pull, commit, merge, stage) stays local except an explicit future
  "push" action, which doesn't exist yet and must be its own deliberate,
  confirmed action when built — never a side effect of something else.
- **Local-only, no cloud sync.** SQLite in the Tauri app-data dir, SSH keys
  in `~/.ssh`, no backend service. (This is why GitKraken's "Cloud
  Workspaces" was explicitly skipped from the feature-parity list below.)
- **Delegate to real tools instead of vendoring**: shells out to the
  system `git.exe`, `ssh-keygen`, and `gh` CLI rather than reimplementing
  git/SSH/GitHub-API logic or building custom credential storage. Account
  login uses `gh auth login --web` (streamed progress, browser opens
  automatically) then `gh ssh-key add` — no manual copy/paste of keys.

## Architecture snapshot

- `src-tauri/src/git/` — one module per concern (status, fetch, diff,
  commit, branch, conflict, blame, log, refs, remote, config, changes,
  files, process). All shell out to `git.exe` via `process::run_git`.
- `src-tauri/src/gh/` — `gh` CLI wrapper: PR list/create/merge, the
  browser-login flow, SSH key upload.
- `src-tauri/src/ssh/` — keygen + a conservative marked-block
  `~/.ssh/config` writer (never touches the user's other Host entries).
- `src-tauri/src/db/` — rusqlite. **Schema changes need a migration step**
  in `db::migrate` (`CREATE TABLE IF NOT EXISTS` doesn't add columns to an
  existing table — this caused a real stuck-on-"Loading…" bug once already).
- `src/store/appStore.ts` — repos/groups/accounts/settings/statuses, plus
  shared UI state (active view, which dialogs are open) so shortcuts and the
  command palette can drive the same dialogs buttons do.
- `src/store/undoStore.ts` — separate small store for the undo/redo stack.
- Dev loop: `npm run tauri dev` needs **both** Cargo's bin dir and GitHub
  CLI's install dir on PATH for the spawned process (easy to forget the
  second one — caused a "gh: program not found" bug once already).

## Built so far (in build order)

1. Tauri + React + TS + Tailwind/shadcn scaffold
2. Repo registry + groups, SQLite persistence
3. Batch fetch/pull per group with live per-repo progress streaming
4. SSH identity management: per-account keygen, `~/.ssh/config` host
   aliases, remote URL rewriting on account assignment
5. Branch ops: checkout/switch, back-to-previous, merge with conflict
   detection
6. GitHub CLI integration for PRs (list/create/merge)
7. Secrets manager: scan for likely-secret files, bundle-for-export as a
   zip with optional AES password protection
8. SSH signing keys: manual "Generate signing key" button (deliberately
   *not* automatic), auto-uploads to GitHub, retroactively applies
   `gpg.format`/`user.signingkey`/`commit.gpgsign` to every repo already
   assigned to that account
9. Diff viewer + hunk-level staging + commit composer (the "Changes" tab)
10. Browser-based account login (`gh auth login --web`) replacing manual
    SSH key copy/paste, with retry-safety (rolls back partial state on
    failure) and correct OAuth scopes (`admin:public_key`)
11. Merge conflict resolution tool: block-level accept-ours/theirs/both/
    custom for text conflicts, whole-file keep-ours/keep-theirs for binary
12. File history & blame (`git log --follow`, `git blame --porcelain`)
13. Keyboard shortcuts + Ctrl+K command palette
14. One-click undo/redo (stage/unstage/commit/checkout/merge), with
    destructive entries (merge undo = hard reset) gated behind a confirm
    dialog

## Roadmap — what's left, in agreed priority order

Comparing against GitKraken's feature list (minus AI, minus Cloud
Workspaces — see constraints above), remaining gaps:

1. **Visual interactive rebase** — drag-to-reorder, squash, drop, edit
   commits. Not started.
2. **Visual interactive cherry-pick** — pick specific commits from another
   branch onto the current one. Not started.
3. **Completeness batch** (no particular order within this group):
   - Git worktrees (list/create/remove)
   - Submodules (init/update/status)
   - Gitflow helpers (feature/release/hotfix branch naming + one-click
     start/finish, on top of existing checkout/merge primitives)
   - Branch hiding/soloing in the commit graph
   - GPG commit signing as an alternative to the existing SSH signing
   - A basic embedded code/file editor

Pick up by asking to continue down this list, or reorder as needed.
