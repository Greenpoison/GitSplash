use super::process::run_git;
use crate::models::RepoGitStatus;
use std::path::Path;

pub async fn get_status(repo_id: &str, repo_path: &Path) -> RepoGitStatus {
    let base = RepoGitStatus {
        repo_id: repo_id.to_string(),
        branch: None,
        ahead: 0,
        behind: 0,
        is_dirty: false,
        has_upstream: false,
        upstream: None,
        error: None,
    };

    // Best-effort: refreshes git's cached stat info (mtime/size per file)
    // against what's actually on disk before checking status. Without this,
    // a file touched by a concurrent process (e.g. a build writing to the
    // working tree while this repo is also open elsewhere) can leave stale
    // stat-cache entries that make `git status` report it modified even
    // though its content is byte-identical to the index. Exit code is
    // ignored — it's non-zero whenever real changes exist, which is exactly
    // the normal case, not a failure.
    let _ = run_git(repo_path, &["update-index", "-q", "--refresh"]).await;

    let output = match run_git(repo_path, &["status", "--porcelain=2", "--branch"]).await {
        Ok(o) => o,
        Err(e) => {
            return RepoGitStatus {
                error: Some(format!("failed to run git: {e}")),
                ..base
            }
        }
    };

    if !output.success {
        let message = if output.stderr.trim().is_empty() {
            "not a git repository or git command failed".to_string()
        } else {
            output.stderr.trim().to_string()
        };
        return RepoGitStatus {
            error: Some(message),
            ..base
        };
    }

    parse_status_v2(&output.stdout, base)
}

/// Lists files with unresolved merge conflicts (porcelain v2 "u" entries).
pub async fn get_conflicted_files(repo_path: &Path) -> Result<Vec<String>, String> {
    let output = run_git(repo_path, &["status", "--porcelain=2"])
        .await
        .map_err(|e| format!("failed to run git status: {e}"))?;
    if !output.success {
        return Err(if output.stderr.trim().is_empty() {
            "git status failed".to_string()
        } else {
            output.stderr.trim().to_string()
        });
    }
    let mut conflicted = Vec::new();
    for line in output.stdout.lines() {
        if let Some(rest) = line.strip_prefix("u ") {
            if let Some(path) = rest.split_whitespace().last() {
                conflicted.push(path.to_string());
            }
        }
    }
    Ok(conflicted)
}

fn parse_status_v2(stdout: &str, mut status: RepoGitStatus) -> RepoGitStatus {
    for line in stdout.lines() {
        if let Some(rest) = line.strip_prefix("# branch.head ") {
            if rest != "(detached)" {
                status.branch = Some(rest.to_string());
            }
        } else if let Some(rest) = line.strip_prefix("# branch.upstream ") {
            status.has_upstream = true;
            status.upstream = Some(rest.to_string());
        } else if let Some(rest) = line.strip_prefix("# branch.ab ") {
            // format: "+<ahead> -<behind>"
            let mut parts = rest.split_whitespace();
            if let Some(ahead) = parts.next().and_then(|p| p.strip_prefix('+')) {
                status.ahead = ahead.parse().unwrap_or(0);
            }
            if let Some(behind) = parts.next().and_then(|p| p.strip_prefix('-')) {
                status.behind = behind.parse().unwrap_or(0);
            }
        } else if !line.starts_with('#') && !line.trim().is_empty() {
            status.is_dirty = true;
        }
    }
    status
}
