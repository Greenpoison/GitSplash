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

/// Resolves any commit-ish (branch, tag, short hash, `HEAD~2`, ...) to its
/// full commit sha — used to capture "where a ref pointed" right before a
/// destructive operation (e.g. deleting a branch), so undo can recreate it
/// exactly rather than relying on the ref still existing somewhere.
pub async fn resolve_ref(repo_path: &Path, rev: &str) -> Result<String, String> {
    let output = run_git(repo_path, &["rev-parse", rev])
        .await
        .map_err(|e| format!("failed to run git rev-parse: {e}"))?;
    if !output.success {
        return Err(if output.stderr.trim().is_empty() {
            format!("could not resolve {rev}")
        } else {
            output.stderr.trim().to_string()
        });
    }
    Ok(output.stdout.trim().to_string())
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

/// Discards every uncommitted change and moves the branch to exactly match
/// `target_ref` (typically its upstream) — for an explicit, user-confirmed
/// "throw away my local changes and take the remote's version" action.
/// Unlike `reset_to`, this deliberately does not refuse on a dirty working
/// tree: discarding it is the entire point here, not an accidental side
/// effect a caller stumbled into.
///
/// `reset --hard` alone only rewrites tracked files — it never touches
/// untracked ones, so a repo with untracked files/directories would stay
/// dirty (and keep blocking future pulls) even after this "supposedly"
/// discarded everything. Follow up with `clean -fd` to remove those too,
/// matching what the confirmation dialog actually promises the user
/// ("every uncommitted change... is permanently discarded"). Gitignored
/// files are deliberately left alone (no `-x`) — those are typically build
/// output the user wants to keep, not "changes".
pub async fn discard_and_reset_to(repo_path: &Path, target_ref: &str) -> Result<(), String> {
    let output = run_git(repo_path, &["reset", "--hard", target_ref])
        .await
        .map_err(|e| format!("failed to run git reset: {e}"))?;
    if !output.success {
        return Err(if output.stderr.trim().is_empty() {
            "git reset failed".to_string()
        } else {
            output.stderr.trim().to_string()
        });
    }

    let clean_output = run_git(repo_path, &["clean", "-fd"])
        .await
        .map_err(|e| format!("failed to run git clean: {e}"))?;
    if !clean_output.success {
        return Err(if clean_output.stderr.trim().is_empty() {
            "git clean failed".to_string()
        } else {
            clean_output.stderr.trim().to_string()
        });
    }
    Ok(())
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

    fn status_porcelain(repo: &Path) -> String {
        let out = StdCommand::new("git")
            .arg("-C")
            .arg(repo)
            .args(["status", "--porcelain"])
            .output()
            .unwrap();
        String::from_utf8(out.stdout).unwrap()
    }

    /// Bug being fixed: "Discard & overwrite" is supposed to leave the repo
    /// clean, matching its own confirmation text ("every uncommitted change
    /// here is permanently discarded"). But `reset --hard` alone never
    /// touches untracked files, so a repo with an untracked file/directory
    /// stayed dirty afterward — which in turn kept `fetch_and_maybe_pull`
    /// skipping the pull step on every later attempt, since it refuses to
    /// pull onto a dirty tree.
    #[tokio::test]
    async fn removes_untracked_files_left_behind_by_reset_hard() {
        let repo = init_repo();
        std::fs::write(repo.path().join("tracked.txt"), "base\n").unwrap();
        git(repo.path(), &["add", "-A"]);
        git(repo.path(), &["commit", "-q", "-m", "base"]);

        // Simulate untracked content sitting in the tree, e.g. left over
        // from some other operation — a plain file and an untracked
        // directory, since directories need `clean -fd` where `reset --hard`
        // alone does nothing at all.
        std::fs::write(repo.path().join("untracked.txt"), "scratch\n").unwrap();
        std::fs::create_dir_all(repo.path().join("untracked_dir")).unwrap();
        std::fs::write(repo.path().join("untracked_dir").join("inner.txt"), "x\n").unwrap();

        discard_and_reset_to(repo.path(), "HEAD").await.unwrap();

        assert!(
            status_porcelain(repo.path()).trim().is_empty(),
            "repo should be fully clean after discard_and_reset_to, still dirty: {}",
            status_porcelain(repo.path())
        );
        assert!(!repo.path().join("untracked.txt").exists());
        assert!(!repo.path().join("untracked_dir").exists());
    }

    /// Gitignored files are deliberately spared — "discard" means throwing
    /// away uncommitted *changes*, not sweeping up build output the user
    /// almost certainly wants to keep (e.g. `target/`, `node_modules/`).
    #[tokio::test]
    async fn leaves_gitignored_files_alone() {
        let repo = init_repo();
        std::fs::write(repo.path().join(".gitignore"), "ignored.txt\n").unwrap();
        git(repo.path(), &["add", "-A"]);
        git(repo.path(), &["commit", "-q", "-m", "base"]);

        std::fs::write(repo.path().join("ignored.txt"), "keep me\n").unwrap();

        discard_and_reset_to(repo.path(), "HEAD").await.unwrap();

        assert!(repo.path().join("ignored.txt").exists());
    }
}
