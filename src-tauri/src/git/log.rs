use super::process::run_git;
use serde::{Deserialize, Serialize};
use std::path::Path;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CommitNode {
    pub hash: String,
    pub parents: Vec<String>,
    pub refs: Vec<String>,
    pub subject: String,
    pub author: String,
    pub date: String,
}

const FIELD_SEP: char = '\u{1f}';
const RECORD_SEP: char = '\u{1e}';

fn log_format() -> String {
    format!("%H{FIELD_SEP}%P{FIELD_SEP}%D{FIELD_SEP}%s{FIELD_SEP}%an{FIELD_SEP}%ad{RECORD_SEP}")
}

fn parse_log_records(stdout: &str) -> Vec<CommitNode> {
    let mut nodes = Vec::new();
    for record in stdout.split(RECORD_SEP) {
        let record = record.trim();
        if record.is_empty() {
            continue;
        }
        let fields: Vec<&str> = record.split(FIELD_SEP).collect();
        if fields.len() < 6 {
            continue;
        }
        let parents = fields[1]
            .split_whitespace()
            .map(|s| s.to_string())
            .collect();
        let refs = fields[2]
            .split(',')
            .map(|s| s.trim().to_string())
            .filter(|s| !s.is_empty())
            .collect();
        nodes.push(CommitNode {
            hash: fields[0].to_string(),
            parents,
            refs,
            subject: fields[3].to_string(),
            author: fields[4].to_string(),
            date: fields[5].to_string(),
        });
    }
    nodes
}

/// Returns recent commit topology across local branches (hash, parents,
/// ref decorations) so the frontend can lay out a lane graph. Lane
/// positioning is left to the UI layer; Rust only supplies raw topology.
pub async fn get_commit_graph(repo_path: &Path, limit: u32) -> Result<Vec<CommitNode>, String> {
    let limit_arg = format!("-n{limit}");
    let output = run_git(
        repo_path,
        &[
            "log",
            "--branches",
            "--topo-order",
            "--date=iso-strict",
            &format!("--pretty=format:{}", log_format()),
            &limit_arg,
        ],
    )
    .await
    .map_err(|e| format!("failed to run git log: {e}"))?;

    if !output.success {
        return Err(if output.stderr.trim().is_empty() {
            "git log failed".to_string()
        } else {
            output.stderr.trim().to_string()
        });
    }
    Ok(parse_log_records(&output.stdout))
}

/// Commits reachable from `range_expr` (e.g. `"main..HEAD"`), oldest first —
/// the order an interactive rebase plan is built and displayed in, since the
/// oldest commit in the range is applied first.
pub async fn get_range_commits(repo_path: &Path, range_expr: &str) -> Result<Vec<CommitNode>, String> {
    let output = run_git(
        repo_path,
        &[
            "log",
            "--topo-order",
            "--reverse",
            "--date=iso-strict",
            &format!("--pretty=format:{}", log_format()),
            range_expr,
        ],
    )
    .await
    .map_err(|e| format!("failed to run git log: {e}"))?;

    if !output.success {
        return Err(if output.stderr.trim().is_empty() {
            "git log failed".to_string()
        } else {
            output.stderr.trim().to_string()
        });
    }
    Ok(parse_log_records(&output.stdout))
}

/// History of a single file, following renames across its lifetime.
pub async fn get_file_history(repo_path: &Path, rel_path: &str, limit: u32) -> Result<Vec<CommitNode>, String> {
    let limit_arg = format!("-n{limit}");
    let output = run_git(
        repo_path,
        &[
            "log",
            "--follow",
            "--date=iso-strict",
            &format!("--pretty=format:{}", log_format()),
            &limit_arg,
            "--",
            rel_path,
        ],
    )
    .await
    .map_err(|e| format!("failed to run git log: {e}"))?;

    if !output.success {
        return Err(if output.stderr.trim().is_empty() {
            "git log failed".to_string()
        } else {
            output.stderr.trim().to_string()
        });
    }
    Ok(parse_log_records(&output.stdout))
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BranchInfo {
    pub name: String,
    pub is_current: bool,
    pub upstream: Option<String>,
}

pub async fn list_branches(repo_path: &Path) -> Result<Vec<BranchInfo>, String> {
    let format = format!("%(HEAD){FIELD_SEP}%(refname:short){FIELD_SEP}%(upstream:short){RECORD_SEP}");
    let output = run_git(
        repo_path,
        &["for-each-ref", "refs/heads", &format!("--format={format}")],
    )
    .await
    .map_err(|e| format!("failed to list branches: {e}"))?;

    if !output.success {
        return Err(if output.stderr.trim().is_empty() {
            "git for-each-ref failed".to_string()
        } else {
            output.stderr.trim().to_string()
        });
    }

    let mut branches = Vec::new();
    for record in output.stdout.split(RECORD_SEP) {
        let record = record.trim();
        if record.is_empty() {
            continue;
        }
        let fields: Vec<&str> = record.split(FIELD_SEP).collect();
        if fields.len() < 3 {
            continue;
        }
        branches.push(BranchInfo {
            is_current: fields[0] == "*",
            name: fields[1].to_string(),
            upstream: if fields[2].is_empty() {
                None
            } else {
                Some(fields[2].to_string())
            },
        });
    }
    Ok(branches)
}
