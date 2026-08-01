use super::compare::{apply_numstat, parse_numstat, CompareFile};
use super::diff::{parse_diff, FileDiff};
use super::process::run_git;
use std::path::Path;

fn status_name(code: char) -> &'static str {
    match code {
        'A' => "added",
        'D' => "deleted",
        'R' => "renamed",
        'C' => "copied",
        _ => "modified",
    }
}

/// Files touched by a single commit, diffed against its first parent (or
/// the empty tree for a root commit, via `--root`) — same status shape as
/// branch comparison, so the frontend reuses the same rendering.
pub async fn get_commit_files(repo_path: &Path, hash: &str) -> Result<Vec<CompareFile>, String> {
    let output = run_git(
        repo_path,
        &["diff-tree", "--no-commit-id", "--name-status", "-r", "-M", "--root", hash],
    )
    .await
    .map_err(|e| format!("failed to run git diff-tree: {e}"))?;
    if !output.success {
        return Err(if output.stderr.trim().is_empty() {
            "git diff-tree failed".to_string()
        } else {
            output.stderr.trim().to_string()
        });
    }

    let mut files = Vec::new();
    for line in output.stdout.lines() {
        let mut parts = line.split('\t');
        let code = match parts.next() {
            Some(c) if !c.is_empty() => c,
            _ => continue,
        };
        let status = status_name(code.chars().next().unwrap());
        if status == "renamed" || status == "copied" {
            let orig = parts.next().unwrap_or("").to_string();
            let new_path = parts.next().unwrap_or("").to_string();
            files.push(CompareFile {
                path: new_path,
                orig_path: Some(orig),
                status: status.to_string(),
                insertions: None,
                deletions: None,
            });
        } else {
            let path = parts.next().unwrap_or("").to_string();
            files.push(CompareFile { path, orig_path: None, status: status.to_string(), insertions: None, deletions: None });
        }
    }

    if let Ok(numstat_output) =
        run_git(repo_path, &["diff-tree", "--no-commit-id", "--numstat", "-r", "-M", "--root", hash]).await
    {
        if numstat_output.success {
            apply_numstat(&mut files, &parse_numstat(&numstat_output.stdout));
        }
    }

    Ok(files)
}

/// A single file's diff within one commit — `git show` against a commit
/// (rather than `git diff` against a range) handles root commits for free,
/// diffing against the empty tree instead of needing a parent to exist.
pub async fn get_commit_file_diff(repo_path: &Path, hash: &str, rel_path: &str) -> Result<FileDiff, String> {
    let output = run_git(repo_path, &["show", "--no-color", "-M", hash, "--", rel_path])
        .await
        .map_err(|e| format!("failed to run git show: {e}"))?;
    if !output.success {
        return Err(if output.stderr.trim().is_empty() {
            "git show failed".to_string()
        } else {
            output.stderr.trim().to_string()
        });
    }
    if output.stdout.contains("Binary files ") || output.stdout.contains("GIT binary patch") {
        return Ok(FileDiff { is_binary: true, hunks: vec![] });
    }
    let (_, hunks) = parse_diff(&output.stdout);
    Ok(FileDiff { is_binary: false, hunks })
}
