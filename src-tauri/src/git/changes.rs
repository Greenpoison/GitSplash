use super::process::run_git;
use serde::{Deserialize, Serialize};
use std::path::Path;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FileChange {
    pub path: String,
    pub orig_path: Option<String>,
    /// '.' means "no change on this side". Index = staged, worktree = unstaged.
    pub index_status: char,
    pub worktree_status: char,
    pub is_untracked: bool,
    pub is_conflicted: bool,
}

/// Lists every changed file in the working tree (staged, unstaged,
/// untracked, and conflicted) via porcelain v2, which is why other status
/// reads in this app pick it too — one format covers all four categories.
pub async fn get_file_changes(repo_path: &Path) -> Result<Vec<FileChange>, String> {
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

    let mut changes = Vec::new();
    for line in output.stdout.lines() {
        if let Some(rest) = line.strip_prefix("1 ") {
            let mut parts = rest.split_whitespace();
            let xy = parts.next().unwrap_or("..");
            let path = rest.splitn(8, ' ').nth(7).unwrap_or("").to_string();
            changes.push(FileChange {
                path,
                orig_path: None,
                index_status: xy.chars().next().unwrap_or('.'),
                worktree_status: xy.chars().nth(1).unwrap_or('.'),
                is_untracked: false,
                is_conflicted: false,
            });
        } else if let Some(rest) = line.strip_prefix("2 ") {
            let mut parts = rest.split_whitespace();
            let xy = parts.next().unwrap_or("..");
            let tail = rest.splitn(9, ' ').nth(8).unwrap_or("");
            let (path, orig) = tail.split_once('\t').unwrap_or((tail, ""));
            changes.push(FileChange {
                path: path.to_string(),
                orig_path: if orig.is_empty() { None } else { Some(orig.to_string()) },
                index_status: xy.chars().next().unwrap_or('.'),
                worktree_status: xy.chars().nth(1).unwrap_or('.'),
                is_untracked: false,
                is_conflicted: false,
            });
        } else if let Some(rest) = line.strip_prefix("u ") {
            let mut parts = rest.split_whitespace();
            let xy = parts.next().unwrap_or("..");
            let path = rest.splitn(10, ' ').nth(9).unwrap_or("").to_string();
            changes.push(FileChange {
                path,
                orig_path: None,
                index_status: xy.chars().next().unwrap_or('.'),
                worktree_status: xy.chars().nth(1).unwrap_or('.'),
                is_untracked: false,
                is_conflicted: true,
            });
        } else if let Some(path) = line.strip_prefix("? ") {
            changes.push(FileChange {
                path: path.to_string(),
                orig_path: None,
                index_status: '.',
                worktree_status: '?',
                is_untracked: true,
                is_conflicted: false,
            });
        }
    }
    Ok(changes)
}
