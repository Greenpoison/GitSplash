use std::path::Path;
use tokio::process::Command;

fn git_err(prefix: &str, stderr: &str) -> String {
    if stderr.trim().is_empty() {
        prefix.to_string()
    } else {
        format!("{prefix}: {}", stderr.trim())
    }
}

/// Clones `url` into `dest`, which must not already exist. Unlike every
/// other git/ module, this can't shell out via `process::run_git`'s
/// `-C <repo_path>` pattern, since the destination doesn't exist yet — runs
/// plain `git clone <url> <dest>` instead.
pub async fn clone_repo(url: &str, dest: &Path) -> Result<(), String> {
    if dest.exists() {
        return Err(format!("{} already exists", dest.display()));
    }
    if let Some(parent) = dest.parent() {
        std::fs::create_dir_all(parent)
            .map_err(|e| format!("failed to create {}: {e}", parent.display()))?;
    }

    let output = Command::new("git")
        .arg("clone")
        .arg(url)
        .arg(dest)
        .output()
        .await
        .map_err(|e| format!("failed to run git clone: {e}"))?;

    if !output.status.success() {
        return Err(git_err("git clone failed", &String::from_utf8_lossy(&output.stderr)));
    }
    Ok(())
}
