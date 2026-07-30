use super::process::run_git;
use std::path::Path;

fn git_err(prefix: &str, stderr: &str) -> String {
    if stderr.trim().is_empty() {
        prefix.to_string()
    } else {
        format!("{prefix}: {}", stderr.trim())
    }
}

pub async fn stage_file(repo_path: &Path, rel_path: &str) -> Result<(), String> {
    let output = run_git(repo_path, &["add", "--", rel_path])
        .await
        .map_err(|e| e.to_string())?;
    if !output.success {
        return Err(git_err("stage failed", &output.stderr));
    }
    Ok(())
}

pub async fn unstage_file(repo_path: &Path, rel_path: &str) -> Result<(), String> {
    let output = run_git(repo_path, &["restore", "--staged", "--", rel_path])
        .await
        .map_err(|e| e.to_string())?;
    if !output.success {
        return Err(git_err("unstage failed", &output.stderr));
    }
    Ok(())
}

pub async fn stage_all(repo_path: &Path) -> Result<(), String> {
    let output = run_git(repo_path, &["add", "-A"]).await.map_err(|e| e.to_string())?;
    if !output.success {
        return Err(git_err("stage all failed", &output.stderr));
    }
    Ok(())
}

pub async fn unstage_all(repo_path: &Path) -> Result<(), String> {
    let output = run_git(repo_path, &["restore", "--staged", "."])
        .await
        .map_err(|e| e.to_string())?;
    if !output.success {
        return Err(git_err("unstage all failed", &output.stderr));
    }
    Ok(())
}

/// Destructive: discards unstaged changes to a tracked file, or deletes an
/// untracked file outright (there's nothing in git history to restore it
/// from either way — the caller is expected to have confirmed with the user).
pub async fn discard_file(repo_path: &Path, rel_path: &str, is_untracked: bool) -> Result<(), String> {
    if is_untracked {
        std::fs::remove_file(repo_path.join(rel_path)).map_err(|e| e.to_string())?;
        return Ok(());
    }
    let output = run_git(repo_path, &["restore", "--", rel_path])
        .await
        .map_err(|e| e.to_string())?;
    if !output.success {
        return Err(git_err("discard failed", &output.stderr));
    }
    Ok(())
}

pub async fn commit(repo_path: &Path, message: &str) -> Result<(), String> {
    let output = run_git(repo_path, &["commit", "-m", message])
        .await
        .map_err(|e| e.to_string())?;
    if !output.success {
        return Err(git_err("commit failed", &output.stderr));
    }
    Ok(())
}
