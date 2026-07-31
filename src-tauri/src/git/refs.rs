use super::process::run_git;
use std::path::Path;

/// None when there's no HEAD yet (a brand-new repo with zero commits) —
/// callers use this to skip offering undo for an initial commit, since
/// there's nothing to reset back to.
pub async fn get_head_sha(repo_path: &Path) -> Option<String> {
    let output = run_git(repo_path, &["rev-parse", "HEAD"]).await.ok()?;
    if !output.success {
        return None;
    }
    let sha = output.stdout.trim().to_string();
    if sha.is_empty() {
        None
    } else {
        Some(sha)
    }
}

pub async fn reset_to(repo_path: &Path, sha: &str, mode: &str) -> Result<(), String> {
    let mode_flag = match mode {
        "hard" => "--hard",
        "mixed" => "--mixed",
        _ => "--soft",
    };

    // Every caller of "hard" mode is an undo/redo entry (merge, rebase,
    // cherry-pick) — none of those are meant to touch edits made *after*
    // the fact, so refuse rather than silently discarding a dirty working
    // tree the user might not realize is still in scope.
    if mode_flag == "--hard" {
        let status = run_git(repo_path, &["status", "--porcelain=2"])
            .await
            .map_err(|e| format!("failed to check working tree status: {e}"))?;
        if !status.stdout.trim().is_empty() {
            return Err(
                "Working tree has uncommitted changes — commit, stash, or discard them first"
                    .to_string(),
            );
        }
    }

    let output = run_git(repo_path, &["reset", mode_flag, sha])
        .await
        .map_err(|e| format!("failed to run git reset: {e}"))?;
    if !output.success {
        return Err(if output.stderr.trim().is_empty() {
            "git reset failed".to_string()
        } else {
            output.stderr.trim().to_string()
        });
    }
    Ok(())
}
