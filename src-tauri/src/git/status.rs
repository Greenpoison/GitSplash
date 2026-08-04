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
        default_branch: None,
        behind_default: 0,
        ahead_default: 0,
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

    let mut status = parse_status_v2(&output.stdout, base);
    if let Some(branch) = status.branch.clone() {
        if let Some((default_branch, behind, ahead)) = get_default_branch_divergence(repo_path, &branch).await {
            if behind > 0 || ahead > 0 {
                status.default_branch = Some(default_branch);
                status.behind_default = behind;
                status.ahead_default = ahead;
            }
        }
    }
    status
}

/// Best-effort: resolves the repo's default branch (main/master) via
/// `origin/HEAD`'s symbolic ref — the same thing GitHub sets it to when you
/// clone — falling back to checking for a same-named remote branch directly
/// if that ref was never set (e.g. an older clone, or `git remote set-head
/// origin -a` never ran). Returns `None` if neither approach finds
/// anything; not every repo even has a remote.
async fn resolve_default_branch(repo_path: &Path) -> Option<String> {
    if let Ok(output) = run_git(repo_path, &["symbolic-ref", "--short", "refs/remotes/origin/HEAD"]).await {
        if output.success {
            if let Some(name) = output.stdout.trim().strip_prefix("origin/") {
                return Some(name.to_string());
            }
        }
    }
    for candidate in ["main", "master"] {
        let verify = run_git(repo_path, &["rev-parse", "--verify", "--quiet", &format!("origin/{candidate}")]).await;
        if matches!(verify, Ok(o) if o.success) {
            return Some(candidate.to_string());
        }
    }
    None
}

/// Best-effort: how far the current branch has diverged from
/// `origin/<default>` in both directions — commits on main it doesn't have
/// yet (behind) and commits it has that main doesn't (ahead). This is
/// exactly what a feature branch needs in order to notice "main moved on
/// without me" AND "I've got finished work that hasn't made it back to main
/// yet": its own `ahead`/`behind` above compare against its own tracking
/// branch, which for a feature branch is usually itself or nothing, never
/// main. A single `--left-right` rev-list gets both counts in one call.
/// Returns `None` if there's no default branch to compare against, or the
/// current branch IS the default branch (comparing it to itself is never
/// useful).
async fn get_default_branch_divergence(repo_path: &Path, current_branch: &str) -> Option<(String, u32, u32)> {
    let default_branch = resolve_default_branch(repo_path).await?;
    if default_branch == current_branch {
        return None;
    }
    let output = run_git(
        repo_path,
        &["rev-list", "--left-right", "--count", &format!("origin/{default_branch}...HEAD")],
    )
    .await
    .ok()?;
    if !output.success {
        return None;
    }
    // "--left-right --count LEFT...RIGHT" prints "<left-only> <right-only>",
    // i.e. commits only on origin/<default> (behind), then commits only on
    // HEAD (ahead).
    let mut parts = output.stdout.split_whitespace();
    let behind: u32 = parts.next()?.parse().ok()?;
    let ahead: u32 = parts.next()?.parse().ok()?;
    Some((default_branch, behind, ahead))
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

#[cfg(test)]
mod tests {
    use super::*;
    use std::process::Command as StdCommand;

    fn git(repo: &Path, args: &[&str]) {
        let status = StdCommand::new("git").arg("-C").arg(repo).args(args).status().unwrap();
        assert!(status.success(), "git {args:?} failed");
    }

    fn init_repo() -> tempfile::TempDir {
        let dir = tempfile::tempdir().unwrap();
        git(dir.path(), &["init", "-q", "-b", "main"]);
        git(dir.path(), &["config", "user.email", "test@example.com"]);
        git(dir.path(), &["config", "user.name", "Test"]);
        dir
    }

    fn commit(repo: &Path, message: &str) {
        std::fs::write(repo.join("file.txt"), format!("{message}\n")).unwrap();
        git(repo, &["add", "-A"]);
        git(repo, &["commit", "-q", "-m", message]);
    }

    /// Sets up `repo` with a local "main" tracking a plain local-path
    /// "origin" remote, checked out onto a "feature" branch created off it —
    /// the same starting shape used across the git module's tests.
    fn repo_on_feature_branch_tracking_origin_main() -> (tempfile::TempDir, tempfile::TempDir) {
        let origin = init_repo();
        commit(origin.path(), "base");

        let repo = init_repo();
        git(repo.path(), &["remote", "add", "origin", origin.path().to_str().unwrap()]);
        git(repo.path(), &["fetch", "-q", "origin"]);
        git(repo.path(), &["reset", "-q", "--hard", "origin/main"]);
        git(repo.path(), &["branch", "-q", "--set-upstream-to=origin/main", "main"]);
        git(repo.path(), &["checkout", "-q", "-b", "feature"]);
        (origin, repo)
    }

    #[tokio::test]
    async fn reports_behind_default_when_main_moved_on_without_this_branch() {
        let (origin, repo) = repo_on_feature_branch_tracking_origin_main();
        commit(origin.path(), "teammate's new commit");
        git(repo.path(), &["fetch", "-q", "origin"]);

        let status = get_status("id", repo.path()).await;
        assert_eq!(status.default_branch.as_deref(), Some("main"));
        assert_eq!(status.behind_default, 1);
        assert_eq!(status.ahead_default, 0);
    }

    #[tokio::test]
    async fn reports_ahead_default_when_this_branch_has_unmerged_commits() {
        let (_origin, repo) = repo_on_feature_branch_tracking_origin_main();
        commit(repo.path(), "finished work not yet in main");

        let status = get_status("id", repo.path()).await;
        assert_eq!(status.default_branch.as_deref(), Some("main"));
        assert_eq!(status.behind_default, 0);
        assert_eq!(status.ahead_default, 1);
    }

    #[tokio::test]
    async fn reports_both_directions_when_branches_have_diverged() {
        let (origin, repo) = repo_on_feature_branch_tracking_origin_main();
        commit(origin.path(), "teammate's new commit");
        git(repo.path(), &["fetch", "-q", "origin"]);
        commit(repo.path(), "finished work not yet in main");

        let status = get_status("id", repo.path()).await;
        assert_eq!(status.default_branch.as_deref(), Some("main"));
        assert_eq!(status.behind_default, 1);
        assert_eq!(status.ahead_default, 1);
    }

    #[tokio::test]
    async fn reports_nothing_when_up_to_date_with_default() {
        let (_origin, repo) = repo_on_feature_branch_tracking_origin_main();

        let status = get_status("id", repo.path()).await;
        assert_eq!(status.default_branch, None);
        assert_eq!(status.behind_default, 0);
        assert_eq!(status.ahead_default, 0);
    }
}
