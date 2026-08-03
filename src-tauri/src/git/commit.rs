use super::path_safety::safe_repo_path;
use super::process::run_git;
use super::refs::get_head_sha;
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

/// Removes paths from git's index without touching them on disk — the fix
/// for "this was committed by accident" (e.g. node_modules/, .env). `-r` so
/// a directory prefix works the same as a single file. Files still show up
/// as untracked afterward, matching whatever .gitignore rule was added to
/// keep them from being re-added.
pub async fn untrack_paths(repo_path: &Path, rel_paths: &[String]) -> Result<(), String> {
    if rel_paths.is_empty() {
        return Ok(());
    }
    let mut args = vec!["rm", "--cached", "-r", "--"];
    args.extend(rel_paths.iter().map(|p| p.as_str()));
    let output = run_git(repo_path, &args).await.map_err(|e| e.to_string())?;
    if !output.success {
        return Err(git_err("could not untrack", &output.stderr));
    }
    Ok(())
}

/// Tells git to stop reporting changes to already-tracked files as
/// "modified" — without removing them from the index, deleting them, or
/// touching .gitignore (which has no effect on already-tracked files at
/// all). The fix for regenerated build output that's already committed and
/// you don't want to untrack outright. Purely local to this index — never
/// committed, never shared with a collaborator or a fresh clone.
pub async fn skip_worktree(repo_path: &Path, rel_paths: &[String]) -> Result<(), String> {
    if rel_paths.is_empty() {
        return Ok(());
    }
    let mut args = vec!["update-index", "--skip-worktree", "--"];
    args.extend(rel_paths.iter().map(|p| p.as_str()));
    let output = run_git(repo_path, &args).await.map_err(|e| e.to_string())?;
    if !output.success {
        return Err(git_err("could not mark as skip-worktree", &output.stderr));
    }
    Ok(())
}

/// Reverses `skip_worktree` — git goes back to reporting changes to this
/// file normally. Doesn't touch the file's content or its place in the
/// index, only the flag.
pub async fn unskip_worktree(repo_path: &Path, rel_paths: &[String]) -> Result<(), String> {
    if rel_paths.is_empty() {
        return Ok(());
    }
    let mut args = vec!["update-index", "--no-skip-worktree", "--"];
    args.extend(rel_paths.iter().map(|p| p.as_str()));
    let output = run_git(repo_path, &args).await.map_err(|e| e.to_string())?;
    if !output.success {
        return Err(git_err("could not clear skip-worktree", &output.stderr));
    }
    Ok(())
}

/// `git ls-files -v` tags every tracked path with a status letter; a
/// skip-worktree'd file is tagged with a capital "S" specifically (not to
/// be confused with the *lowercase* variants of other tags, which mean
/// "assume-unchanged" instead — a different, less safe bit this app never
/// sets).
fn parse_skip_worktree_paths(stdout: &str) -> Vec<String> {
    stdout
        .lines()
        .filter_map(|line| line.strip_prefix("S "))
        .map(|s| s.to_string())
        .collect()
}

pub async fn list_skip_worktree_files(repo_path: &Path) -> Result<Vec<String>, String> {
    let output = run_git(repo_path, &["ls-files", "-v"]).await.map_err(|e| e.to_string())?;
    if !output.success {
        return Err(git_err("could not list files", &output.stderr));
    }
    Ok(parse_skip_worktree_paths(&output.stdout))
}

/// Destructive: discards unstaged changes to a tracked file, or deletes an
/// untracked file outright (there's nothing in git history to restore it
/// from either way — the caller is expected to have confirmed with the user).
pub async fn discard_file(repo_path: &Path, rel_path: &str, is_untracked: bool) -> Result<(), String> {
    if is_untracked {
        let full_path = safe_repo_path(repo_path, rel_path)?;
        std::fs::remove_file(full_path).map_err(|e| e.to_string())?;
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

/// Returns the HEAD sha from just before the commit — None only for a
/// repo's very first commit, where there's nothing to undo back to.
pub async fn commit(repo_path: &Path, message: &str) -> Result<Option<String>, String> {
    let previous_head_sha = get_head_sha(repo_path).await;
    let output = run_git(repo_path, &["commit", "-m", message])
        .await
        .map_err(|e| e.to_string())?;
    if !output.success {
        return Err(git_err("commit failed", &output.stderr));
    }
    Ok(previous_head_sha)
}

/// Replaces HEAD's commit with one that includes whatever's currently
/// staged (or none, if nothing new is staged) and the given message —
/// `git commit --amend` rewrites the commit object, so its old sha is
/// still returned for the caller to build an undo entry from (the old
/// commit isn't deleted, just no longer pointed to by anything).
pub async fn amend_commit(repo_path: &Path, message: &str) -> Result<Option<String>, String> {
    let previous_head_sha = get_head_sha(repo_path).await;
    let output = run_git(repo_path, &["commit", "--amend", "-m", message])
        .await
        .map_err(|e| e.to_string())?;
    if !output.success {
        return Err(git_err("amend failed", &output.stderr));
    }
    Ok(previous_head_sha)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn extracts_only_skip_worktree_tagged_paths() {
        let stdout = "S config/local.json\nH src/main.rs\nS build/output.txt\n? scratch.tmp\n";
        let paths = parse_skip_worktree_paths(stdout);
        assert_eq!(paths, vec!["config/local.json", "build/output.txt"]);
    }

    #[test]
    fn ignores_lowercase_assume_unchanged_tags() {
        // Lowercase tags mean assume-unchanged, a different bit this app
        // never sets — must not be confused with capital-S skip-worktree.
        let stdout = "h src/main.rs\ns build/output.txt\n";
        let paths = parse_skip_worktree_paths(stdout);
        assert!(paths.is_empty());
    }

    #[test]
    fn returns_nothing_for_a_clean_index() {
        let stdout = "H a.txt\nH b.txt\n";
        assert!(parse_skip_worktree_paths(stdout).is_empty());
    }
}
