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
pub struct WorktreeInfo {
    pub path: String,
    pub head_sha: Option<String>,
    pub branch: Option<String>,
    pub is_detached: bool,
    pub is_locked: bool,
    pub is_prunable: bool,
}

fn parse_worktree_list(stdout: &str) -> Vec<WorktreeInfo> {
    let mut worktrees = Vec::new();
    let mut current: Option<WorktreeInfo> = None;

    for line in stdout.lines() {
        if let Some(path) = line.strip_prefix("worktree ") {
            if let Some(wt) = current.take() {
                worktrees.push(wt);
            }
            current = Some(WorktreeInfo {
                path: path.to_string(),
                head_sha: None,
                branch: None,
                is_detached: false,
                is_locked: false,
                is_prunable: false,
            });
        } else if let Some(wt) = current.as_mut() {
            if let Some(sha) = line.strip_prefix("HEAD ") {
                wt.head_sha = Some(sha.to_string());
            } else if let Some(branch_ref) = line.strip_prefix("branch ") {
                wt.branch = Some(branch_ref.strip_prefix("refs/heads/").unwrap_or(branch_ref).to_string());
            } else if line == "detached" {
                wt.is_detached = true;
            } else if line == "locked" || line.starts_with("locked ") {
                wt.is_locked = true;
            } else if line == "prunable" || line.starts_with("prunable ") {
                wt.is_prunable = true;
            }
        }
    }
    if let Some(wt) = current.take() {
        worktrees.push(wt);
    }
    worktrees
}

pub async fn list_worktrees(repo_path: &Path) -> Result<Vec<WorktreeInfo>, String> {
    let output = run_git(repo_path, &["worktree", "list", "--porcelain"])
        .await
        .map_err(|e| format!("failed to run git worktree list: {e}"))?;
    if !output.success {
        return Err(git_err("git worktree list failed", &output.stderr));
    }
    Ok(parse_worktree_list(&output.stdout))
}

/// `create_branch = true`: `branch` names a brand-new branch (starting from
/// current HEAD) to check out into the new worktree. `create_branch = false`:
/// `branch` names an existing branch/ref to check out there instead.
pub async fn add_worktree(
    repo_path: &Path,
    target_path: &str,
    branch: &str,
    create_branch: bool,
) -> Result<(), String> {
    let args: Vec<&str> = if create_branch {
        vec!["worktree", "add", "-b", branch, target_path]
    } else {
        vec!["worktree", "add", target_path, branch]
    };
    let output = run_git(repo_path, &args)
        .await
        .map_err(|e| format!("failed to run git worktree add: {e}"))?;
    if !output.success {
        return Err(git_err("failed to add worktree", &output.stderr));
    }
    Ok(())
}

/// `force` is needed when the worktree has uncommitted changes or is locked
/// — git refuses a plain `remove` in either case rather than silently
/// discarding work.
pub async fn remove_worktree(repo_path: &Path, target_path: &str, force: bool) -> Result<(), String> {
    let mut args = vec!["worktree", "remove"];
    if force {
        args.push("--force");
    }
    args.push(target_path);
    let output = run_git(repo_path, &args)
        .await
        .map_err(|e| format!("failed to run git worktree remove: {e}"))?;
    if !output.success {
        return Err(git_err("failed to remove worktree", &output.stderr));
    }
    Ok(())
}

/// Cleans up administrative state left behind for worktrees whose directory
/// was deleted outside git (e.g. `rm -rf` instead of `worktree remove`).
pub async fn prune_worktrees(repo_path: &Path) -> Result<(), String> {
    let output = run_git(repo_path, &["worktree", "prune"])
        .await
        .map_err(|e| format!("failed to run git worktree prune: {e}"))?;
    if !output.success {
        return Err(git_err("failed to prune worktrees", &output.stderr));
    }
    Ok(())
}
