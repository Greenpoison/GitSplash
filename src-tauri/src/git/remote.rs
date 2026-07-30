use super::process::run_git;
use std::path::Path;

pub async fn get_remote_url(repo_path: &Path, remote: &str) -> Option<String> {
    let output = run_git(repo_path, &["remote", "get-url", remote]).await.ok()?;
    if output.success {
        let url = output.stdout.trim().to_string();
        if url.is_empty() {
            None
        } else {
            Some(url)
        }
    } else {
        None
    }
}

pub async fn set_remote_url(
    repo_path: &Path,
    remote: &str,
    new_url: &str,
) -> Result<(), String> {
    let output = run_git(repo_path, &["remote", "set-url", remote, new_url])
        .await
        .map_err(|e| e.to_string())?;
    if output.success {
        Ok(())
    } else {
        Err(if output.stderr.trim().is_empty() {
            "git remote set-url failed".to_string()
        } else {
            output.stderr.trim().to_string()
        })
    }
}

/// Extracts the "owner/repo.git" path portion out of a GitHub remote URL,
/// regardless of whether it's scp-style ssh, ssh://, or https.
pub fn extract_github_path(url: &str) -> Option<String> {
    if let Some(rest) = url.strip_prefix("ssh://") {
        // ssh://git@github.com/owner/repo.git
        let after_host = rest.split_once('/')?.1;
        return Some(after_host.to_string());
    }
    if let Some(rest) = url.strip_prefix("https://") {
        // https://github.com/owner/repo.git
        let after_host = rest.split_once('/')?.1;
        return Some(after_host.to_string());
    }
    if let Some(rest) = url.strip_prefix("http://") {
        let after_host = rest.split_once('/')?.1;
        return Some(after_host.to_string());
    }
    // scp-like syntax: git@github.com:owner/repo.git or git@host-alias:owner/repo.git
    if let Some((_, path)) = url.split_once(':') {
        if !url.starts_with("git@") {
            return None;
        }
        return Some(path.to_string());
    }
    None
}

/// Builds the ssh remote URL that routes through a GitSplash-managed
/// ~/.ssh/config Host alias, e.g. `git@github.com-personal:owner/repo.git`.
pub fn build_aliased_url(host_alias: &str, github_path: &str) -> String {
    format!("git@{host_alias}:{github_path}")
}
