use clap::{Parser, Subcommand};
use gitsplash_lib::git;
use std::path::{Path, PathBuf};
use std::process::ExitCode;

/// A placeholder passed to `git::*` functions that only consume it to tag
/// Tauri progress events — irrelevant here since every call below passes
/// `None` for the app handle.
const CLI_OP_ID: &str = "cli";

#[derive(Parser)]
#[command(name = "gitsplash", about = "Headless git operations from the GitSplash engine")]
struct Cli {
    #[command(subcommand)]
    command: Command,
}

#[derive(Subcommand)]
enum Command {
    /// Show branch, upstream, and working-tree status
    Status {
        #[arg(long, default_value = ".")]
        path: PathBuf,
    },
    /// Clone a repository
    Clone { url: String, dest: PathBuf },
    /// Record a commit of the currently staged changes
    Commit {
        #[arg(short, long)]
        message: String,
        #[arg(long)]
        amend: bool,
        #[arg(long, default_value = ".")]
        path: PathBuf,
    },
    /// Branch operations
    Branch {
        #[command(subcommand)]
        action: BranchAction,
    },
    /// Push the current branch to its remote
    Push {
        #[arg(long)]
        force: bool,
        #[arg(long, default_value = ".")]
        path: PathBuf,
    },
    /// Fetch from the remote and fast-forward the current branch
    Pull {
        #[arg(long, default_value = ".")]
        path: PathBuf,
    },
    /// Fetch from the remote, optionally pulling afterwards
    Fetch {
        #[arg(long)]
        pull: bool,
        #[arg(long, default_value = ".")]
        path: PathBuf,
    },
}

#[derive(Subcommand)]
enum BranchAction {
    /// List local branches
    List {
        #[arg(long, default_value = ".")]
        path: PathBuf,
    },
    /// Create a new branch and check it out
    Create {
        name: String,
        #[arg(long)]
        from: Option<String>,
        #[arg(long, default_value = ".")]
        path: PathBuf,
    },
    /// Check out an existing branch
    Checkout {
        name: String,
        #[arg(long)]
        force: bool,
        #[arg(long, default_value = ".")]
        path: PathBuf,
    },
    /// Delete a local branch
    Delete {
        name: String,
        #[arg(long)]
        force: bool,
        #[arg(long, default_value = ".")]
        path: PathBuf,
    },
}

#[tokio::main]
async fn main() -> ExitCode {
    let cli = Cli::parse();
    match run(cli.command).await {
        Ok(()) => ExitCode::SUCCESS,
        Err(message) => {
            eprintln!("error: {message}");
            ExitCode::FAILURE
        }
    }
}

async fn run(command: Command) -> Result<(), String> {
    match command {
        Command::Status { path } => status(&path).await,
        Command::Clone { url, dest } => clone(&url, &dest).await,
        Command::Commit { message, amend, path } => commit(&path, &message, amend).await,
        Command::Branch { action } => branch(action).await,
        Command::Push { force, path } => push(&path, force).await,
        Command::Pull { path } => fetch(&path, true).await,
        Command::Fetch { pull, path } => fetch(&path, pull).await,
    }
}

async fn status(path: &Path) -> Result<(), String> {
    let repo_id = canonical_id(path);
    let status = git::status::get_status(&repo_id, path).await;
    if let Some(err) = status.error {
        return Err(err);
    }

    match &status.branch {
        Some(branch) => println!("On branch {branch}"),
        None => println!("HEAD detached"),
    }
    match &status.upstream {
        Some(upstream) => println!("Upstream: {upstream} (ahead {}, behind {})", status.ahead, status.behind),
        None => println!("No upstream"),
    }
    if let Some(default_branch) = &status.default_branch {
        println!(
            "Relative to {default_branch}: ahead {}, behind {}",
            status.ahead_default, status.behind_default
        );
    }
    println!("Working tree: {}", if status.is_dirty { "dirty" } else { "clean" });
    Ok(())
}

async fn clone(url: &str, dest: &Path) -> Result<(), String> {
    git::clone::clone_repo(None, CLI_OP_ID, url, dest, None).await?;
    println!("Cloned into {}", dest.display());
    Ok(())
}

async fn commit(path: &Path, message: &str, amend: bool) -> Result<(), String> {
    if amend {
        git::commit::amend_commit(path, message).await?;
    } else {
        git::commit::commit(path, message).await?;
    }
    println!("Committed");
    Ok(())
}

async fn branch(action: BranchAction) -> Result<(), String> {
    match action {
        BranchAction::List { path } => {
            let branches = git::log::list_branches(&path).await?;
            for b in branches {
                let marker = if b.is_current { "*" } else { " " };
                match b.upstream {
                    Some(upstream) => println!("{marker} {} -> {upstream}", b.name),
                    None => println!("{marker} {}", b.name),
                }
            }
            Ok(())
        }
        BranchAction::Create { name, from, path } => {
            git::branch::create_branch(&path, &name, from.as_deref()).await?;
            println!("Created and switched to {name}");
            Ok(())
        }
        BranchAction::Checkout { name, force, path } => {
            git::branch::checkout_branch(&path, &name, false, force).await?;
            println!("Switched to {name}");
            Ok(())
        }
        BranchAction::Delete { name, force, path } => {
            git::branch::delete_branch(&path, &name, force).await?;
            println!("Deleted {name}");
            Ok(())
        }
    }
}

async fn push(path: &Path, force: bool) -> Result<(), String> {
    let repo_id = canonical_id(path);
    let outcome = git::push::push(None, CLI_OP_ID, &repo_id, path, force).await;
    if !outcome.pushed {
        return Err(outcome.message.unwrap_or_else(|| "push failed".to_string()));
    }
    if outcome.set_upstream {
        println!("Pushed and published branch upstream");
    } else {
        println!("Pushed");
    }
    Ok(())
}

async fn fetch(path: &Path, pull: bool) -> Result<(), String> {
    let repo_id = canonical_id(path);
    let outcome = git::fetch::fetch_and_maybe_pull(None, CLI_OP_ID, &repo_id, path, pull).await;
    if !outcome.fetched {
        return Err(outcome.message.unwrap_or_else(|| "fetch failed".to_string()));
    }
    println!("Fetched");
    if pull {
        if outcome.pulled {
            println!("Pulled");
        } else {
            return Err(outcome.message.unwrap_or_else(|| "pull skipped".to_string()));
        }
    }
    Ok(())
}

/// `get_status`/`push`/`fetch_and_maybe_pull` take a `repo_id` purely to tag
/// their return value/events — the CLI has no repo registry, so it derives a
/// stable-enough identifier from the path itself.
fn canonical_id(path: &Path) -> String {
    path.canonicalize().unwrap_or_else(|_| path.to_path_buf()).to_string_lossy().into_owned()
}
