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
