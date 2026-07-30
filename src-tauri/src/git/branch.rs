use super::process::run_git;
use super::refs::get_head_sha;
use super::status::get_conflicted_files;
use serde::{Deserialize, Serialize};
use std::path::Path;

fn git_err(prefix: &str, stderr: &str) -> String {
    if stderr.trim().is_empty() {
        prefix.to_string()
    } else {
        format!("{prefix}: {}", stderr.trim())
    }
}

pub async fn checkout_branch(repo_path: &Path, branch: &str) -> Result<(), String> {
    let output = run_git(repo_path, &["switch", branch])
        .await
        .map_err(|e| format!("failed to run git switch: {e}"))?;
    if !output.success {
        return Err(git_err("checkout failed", &output.stderr));
    }
    Ok(())
}

/// Switches back to whatever branch was checked out before the current one,
/// using git's own "@{-1}" shorthand rather than app-tracked state.
pub async fn checkout_previous_branch(repo_path: &Path) -> Result<String, String> {
    let output = run_git(repo_path, &["switch", "-"])
        .await
        .map_err(|e| format!("failed to run git switch -: {e}"))?;
    if !output.success {
        return Err(git_err(
            "could not switch back to the previous branch",
            &output.stderr,
        ));
    }
    let branch_output = run_git(repo_path, &["branch", "--show-current"])
        .await
        .map_err(|e| e.to_string())?;
    Ok(branch_output.stdout.trim().to_string())
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MergeResult {
    pub success: bool,
    pub conflicted_files: Vec<String>,
    pub message: Option<String>,
    /// HEAD before the merge started — present on success, so the caller can
    /// build an undo action (git reset --hard back to this sha). Not
    /// meaningful when a merge stops on conflicts, since HEAD never moved.
    pub previous_head_sha: Option<String>,
    /// HEAD after a successful merge — lets an undo be redone by resetting
    /// forward to this sha instead of re-running the merge from scratch.
    pub new_head_sha: Option<String>,
}

/// Merges `from_branch` into the current branch. On conflict, aborts nothing
/// automatically — leaves the tree in the conflicted state (git's normal
/// behavior) and reports which files need resolving, since silently
/// aborting would hide the merge attempt the user asked for.
pub async fn merge_branch(repo_path: &Path, from_branch: &str) -> Result<MergeResult, String> {
    let previous_head_sha = get_head_sha(repo_path).await;

    let output = run_git(repo_path, &["merge", "--no-edit", from_branch])
        .await
        .map_err(|e| format!("failed to run git merge: {e}"))?;

    if output.success {
        let new_head_sha = get_head_sha(repo_path).await;
        return Ok(MergeResult {
            success: true,
            conflicted_files: Vec::new(),
            message: None,
            previous_head_sha,
            new_head_sha,
        });
    }

    let conflicted = get_conflicted_files(repo_path).await.unwrap_or_default();
    if !conflicted.is_empty() {
        return Ok(MergeResult {
            success: false,
            conflicted_files: conflicted,
            message: Some(
                "merge stopped with conflicts — resolve the listed files, then commit"
                    .to_string(),
            ),
            previous_head_sha: None,
            new_head_sha: None,
        });
    }

    Err(git_err("merge failed", &output.stderr))
}
