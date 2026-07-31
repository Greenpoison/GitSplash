use super::diff::{parse_diff, FileDiff};
use super::process::run_git;
use serde::{Deserialize, Serialize};
use std::path::Path;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CompareFile {
    pub path: String,
    pub orig_path: Option<String>,
    /// "added" | "modified" | "deleted" | "renamed" | "copied"
    pub status: String,
}

fn status_name(code: char) -> &'static str {
    match code {
        'A' => "added",
        'D' => "deleted",
        'R' => "renamed",
        'C' => "copied",
        _ => "modified",
    }
}

/// Lists files that differ between `branch` and `base`, using three-dot
/// (`base...branch`) semantics — i.e. what `branch` would bring in if
/// merged into `base` right now, diffed against their merge-base rather
/// than a raw tip-to-tip comparison.
pub async fn compare_branches(repo_path: &Path, base: &str, branch: &str) -> Result<Vec<CompareFile>, String> {
    let range = format!("{base}...{branch}");
    let output = run_git(repo_path, &["diff", "--no-color", "--name-status", "-M", &range])
        .await
        .map_err(|e| format!("failed to run git diff: {e}"))?;
    if !output.success {
        return Err(if output.stderr.trim().is_empty() {
            "git diff failed".to_string()
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
            files.push(CompareFile { path: new_path, orig_path: Some(orig), status: status.to_string() });
        } else {
            let path = parts.next().unwrap_or("").to_string();
            files.push(CompareFile { path, orig_path: None, status: status.to_string() });
        }
    }
    Ok(files)
}

/// Same idea as `diff::get_file_diff`, but between two refs instead of the
/// working tree/index — reuses the same hunk parser so the result renders
/// through the existing DiffHunkView on the frontend unchanged.
pub async fn get_compare_file_diff(
    repo_path: &Path,
    base: &str,
    branch: &str,
    rel_path: &str,
) -> Result<FileDiff, String> {
    let range = format!("{base}...{branch}");
    let output = run_git(repo_path, &["diff", "--no-color", &range, "--", rel_path])
        .await
        .map_err(|e| format!("failed to run git diff: {e}"))?;
    if !output.success {
        return Err(if output.stderr.trim().is_empty() {
            "git diff failed".to_string()
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

/// Every file that exists in `branch`'s tree — used to browse files
/// unaffected by the diff too, not just the changed ones.
pub async fn list_branch_files(repo_path: &Path, branch: &str) -> Result<Vec<String>, String> {
    let output = run_git(repo_path, &["ls-tree", "-r", "--name-only", branch])
        .await
        .map_err(|e| format!("failed to run git ls-tree: {e}"))?;
    if !output.success {
        return Err(if output.stderr.trim().is_empty() {
            "git ls-tree failed".to_string()
        } else {
            output.stderr.trim().to_string()
        });
    }
    Ok(output.stdout.lines().map(|l| l.to_string()).collect())
}

/// A file's content as it exists in `branch`'s tree — not the working
/// directory, so this works without checking the branch out.
pub async fn read_branch_file(repo_path: &Path, branch: &str, rel_path: &str) -> Result<Option<String>, String> {
    let output = run_git(repo_path, &["show", &format!("{branch}:{rel_path}")])
        .await
        .map_err(|e| format!("failed to run git show: {e}"))?;
    if !output.success {
        // Most likely the file doesn't exist on this branch (e.g. added
        // only on the current side) — not a real error, just "no content".
        return Ok(None);
    }
    Ok(Some(output.stdout))
}
