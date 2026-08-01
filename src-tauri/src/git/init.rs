use crate::util::no_window_tokio;
use std::path::Path;
use tokio::process::Command;

fn git_err(prefix: &str, stderr: &str) -> String {
    if stderr.trim().is_empty() {
        prefix.to_string()
    } else {
        format!("{prefix}: {}", stderr.trim())
    }
}

/// Creates `dest` (which must not already exist) and runs `git init` in it,
/// explicitly naming the initial branch — `git init` alone falls back to
/// whatever `init.defaultBranch` happens to be configured (or the historic
/// "master" default if it isn't), which would be an inconsistent surprise
/// depending on the machine. Same "can't use process::run_git's -C
/// pattern" situation as clone_repo, since the destination doesn't exist
/// until this creates it.
pub async fn init_repo(dest: &Path, initial_branch: &str) -> Result<(), String> {
    if dest.exists() {
        return Err(format!("{} already exists", dest.display()));
    }
    std::fs::create_dir_all(dest).map_err(|e| format!("failed to create {}: {e}", dest.display()))?;

    let mut cmd = Command::new("git");
    no_window_tokio(&mut cmd);
    let output = cmd
        .arg("init")
        .arg("-b")
        .arg(initial_branch)
        .arg(dest)
        .output()
        .await
        .map_err(|e| format!("failed to run git init: {e}"))?;

    if !output.status.success() {
        return Err(git_err("git init failed", &String::from_utf8_lossy(&output.stderr)));
    }
    Ok(())
}
