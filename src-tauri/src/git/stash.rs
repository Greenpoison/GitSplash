use super::process::run_git;
use serde::{Deserialize, Serialize};
use std::path::Path;

fn git_err(prefix: &str, stderr: &str) -> String {
    if stderr.trim().is_empty() {
        prefix.to_string()
    } else {
        format!("{prefix}: {}", stderr.trim())
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StashEntry {
    /// The N in "stash@{N}" — index 0 is always the most recently stashed.
    pub index: u32,
    pub message: String,
}

pub async fn stash_push(repo_path: &Path, message: Option<&str>, include_untracked: bool) -> Result<(), String> {
    let mut args: Vec<&str> = vec!["stash", "push"];
    if include_untracked {
        args.push("-u");
    }
    if let Some(m) = message {
        args.push("-m");
        args.push(m);
    }
    let output = run_git(repo_path, &args).await.map_err(|e| e.to_string())?;
    if !output.success {
        return Err(git_err("could not stash changes", &output.stderr));
    }
    Ok(())
}

pub async fn list_stashes(repo_path: &Path) -> Result<Vec<StashEntry>, String> {
    // %gd = reflog selector ("stash@{0}"), %gs = reflog subject (the
    // stash's own message — either the default "WIP on <branch>: <sha>
    // <subject>" or whatever custom message stash_push was given).
    let output = run_git(repo_path, &["stash", "list", "--format=%gd%x09%gs"])
        .await
        .map_err(|e| e.to_string())?;
    if !output.success {
        return Err(git_err("could not list stashes", &output.stderr));
    }

    let mut entries = Vec::new();
    for line in output.stdout.lines() {
        let mut parts = line.splitn(2, '\t');
        let Some(selector) = parts.next() else { continue };
        let message = parts.next().unwrap_or("").to_string();
        let Some(index_str) = selector.strip_prefix("stash@{").and_then(|s| s.strip_suffix('}')) else {
            continue;
        };
        let Ok(index) = index_str.parse::<u32>() else { continue };
        entries.push(StashEntry { index, message });
    }
    Ok(entries)
}

/// Applies the stash and drops it in one step — refused (leaving the stash
/// intact) if it would conflict, so nothing about the stash is ever lost to
/// a bad pop.
pub async fn stash_pop(repo_path: &Path, index: u32) -> Result<(), String> {
    let selector = format!("stash@{{{index}}}");
    let output = run_git(repo_path, &["stash", "pop", &selector])
        .await
        .map_err(|e| e.to_string())?;
    if !output.success {
        return Err(git_err(
            "could not pop stash — likely a conflict with your current changes; the stash is still there",
            &output.stderr,
        ));
    }
    Ok(())
}

/// Applies the stash without removing it — useful for trying it on more
/// than one branch.
pub async fn stash_apply(repo_path: &Path, index: u32) -> Result<(), String> {
    let selector = format!("stash@{{{index}}}");
    let output = run_git(repo_path, &["stash", "apply", &selector])
        .await
        .map_err(|e| e.to_string())?;
    if !output.success {
        return Err(git_err("could not apply stash", &output.stderr));
    }
    Ok(())
}

pub async fn stash_drop(repo_path: &Path, index: u32) -> Result<(), String> {
    let selector = format!("stash@{{{index}}}");
    let output = run_git(repo_path, &["stash", "drop", &selector])
        .await
        .map_err(|e| e.to_string())?;
    if !output.success {
        return Err(git_err("could not drop stash", &output.stderr));
    }
    Ok(())
}
