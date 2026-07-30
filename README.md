<div align="center">
  <img src="src-tauri/icons/icon.png" width="96" height="96" alt="GitSplash icon" />

  # GitSplash

  **A desktop Git client for people who manage a lot of repos across a lot of GitHub accounts.**

  [![Stars](https://img.shields.io/github/stars/Greenpoison/GitSplash?style=flat&logo=github&color=8FC2FF)](https://github.com/Greenpoison/GitSplash/stargazers)
  [![License](https://img.shields.io/badge/license-MIT%20%2B%20Commons%20Clause-blue)](LICENSE)
  [![Platform](https://img.shields.io/badge/platform-Windows-0078D6?logo=windows&logoColor=white)](#getting-started)
  [![Tauri](https://img.shields.io/badge/Tauri-2-24C8DB?logo=tauri&logoColor=white)](https://tauri.app)
  [![React](https://img.shields.io/badge/React-19-149ECA?logo=react&logoColor=white)](https://react.dev)
  [![Rust](https://img.shields.io/badge/Rust-2021-DEA584?logo=rust&logoColor=white)](https://www.rust-lang.org)

</div>

<br />

## Contents

- [Features](#features)
- [Getting started](#getting-started)
- [Project layout](#project-layout)
- [Contributing](#contributing)
- [License](#license)

Subscription software for a local git client is a scam — you already paid for your
machine, your repos are already on your disk. GitSplash is a one-time, own-it-forever
tool for managing a lot of repos across a lot of GitHub accounts, with no monthly fee
attached.

## Features

#### 🔀 Branching & history
- Visual **interactive rebase** — drag to reorder, pick / reword / squash / fixup /
  drop, with conflict pause-and-resume
- Visual **interactive cherry-pick** — pull specific commits from another branch,
  reorder them before applying
- Checkout, switch back to the previous branch, merge with conflict detection
- **Gitflow helpers** — one-click start/finish for feature, release, and hotfix
  branches
- Branch hiding/soloing in the commit graph
- Full commit graph with lane rendering

#### 🧩 Working tree
- Diff viewer with **hunk-level staging** and a commit composer
- **Merge conflict resolver** — block-by-block accept-ours/theirs/both/custom for
  text, whole-file keep-ours/keep-theirs for binaries
- File history & blame (`git log --follow`, `git blame --porcelain`)
- **Embedded file editor** for quick edits without leaving the app
- Git **worktrees** (list/add/remove/prune) and **submodules** (status/update)

#### 👤 Multi-account & security
- Per-account SSH identities — dedicated keypair and `~/.ssh/config` host alias per
  GitHub account, remote URLs rewritten automatically on assignment
- Browser-based account login (`gh auth login --web`) — no manual key copy/paste
- Commit signing via **SSH or GPG**, applied retroactively to every repo already
  assigned to an account
- Secrets scanner — find likely-secret files and export a password-protected,
  AES-encrypted bundle

#### ⚡ Productivity
- Batch fetch/pull across a whole group of repos, with live per-repo progress
- `Ctrl+K` command palette and global keyboard shortcuts
- One-click undo/redo for stage/unstage/commit/checkout/merge

#### 🐙 GitHub integration
- List, create, and merge pull requests via the `gh` CLI, per account

## Getting started

### Prerequisites

- Windows 10/11
- [Node.js](https://nodejs.org) 18+ and npm
- [Rust](https://rustup.rs) (stable toolchain)
- [GitHub CLI](https://cli.github.com) (`gh`) — needed for account login and PRs
- Both Cargo's bin dir and the GitHub CLI's install dir need to be on `PATH`

### Install & run

```bash
git clone https://github.com/Greenpoison/GitSplash.git
cd GitSplash
npm install
npm run tauri dev
```

The first run compiles the Rust side, which takes a few minutes; subsequent runs are
incremental.

### Build a release binary

```bash
npm run tauri build
```

Output lands in `src-tauri/target/release/`.

## Project layout

```
src/                      React + TypeScript frontend
  components/             UI, grouped by feature area (repos/, settings/, dashboard/)
  lib/                    Tauri IPC bindings (api.ts) and shared types
  store/                  Zustand stores (app state, undo/redo)
src-tauri/
  src/
    git/                  One module per git concern — shells out via process::run_git
    commands/             #[tauri::command] handlers exposed to the frontend
    gh/, ssh/, gpg/       Wrappers for the gh CLI, SSH keygen/config, and GPG
    db/                   SQLite schema + migrations
  vendor/                 Patched copies of two crates blocked on an upstream fix
                          (see the comment at the top of each vendored build.rs)
```

## Contributing

Contributions are welcome.

## License

MIT with the [Commons Clause](https://commonsclause.com) — free to use, fork, and
modify, but you can't charge money for it. See [`LICENSE`](LICENSE) for the exact
terms.
