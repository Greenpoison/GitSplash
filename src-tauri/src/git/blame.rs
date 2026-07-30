use super::process::run_git;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::path::Path;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BlameLine {
    pub line_number: u32,
    pub commit_hash: String,
    pub author: String,
    pub author_time: String, // unix seconds, as a string (frontend formats it)
    pub summary: String,
    pub content: String,
}

#[derive(Default, Clone)]
struct CommitMeta {
    author: String,
    author_time: String,
    summary: String,
}

/// Parses `git blame --porcelain` output. Full metadata (author, time,
/// summary) only appears the first time a commit is mentioned; every later
/// line attributed to that same commit repeats just the short header, so
/// this caches metadata per-sha as it's discovered.
fn parse_blame(stdout: &str) -> Vec<BlameLine> {
    let mut lines_out = Vec::new();
    let mut meta: HashMap<String, CommitMeta> = HashMap::new();
    let mut current_sha = String::new();
    let mut current_final_line: u32 = 0;

    for line in stdout.lines() {
        if let Some(rest) = line.strip_prefix('\t') {
            let m = meta.entry(current_sha.clone()).or_default();
            lines_out.push(BlameLine {
                line_number: current_final_line,
                commit_hash: current_sha.clone(),
                author: m.author.clone(),
                author_time: m.author_time.clone(),
                summary: m.summary.clone(),
                content: rest.to_string(),
            });
            continue;
        }

        let mut parts = line.split_whitespace();
        let first = parts.next().unwrap_or("");
        if first.len() == 40 && first.chars().all(|c| c.is_ascii_hexdigit()) {
            // Header: "<sha> <orig-line> <final-line> [<group-count>]"
            current_sha = first.to_string();
            current_final_line = parts.nth(1).and_then(|s| s.parse().ok()).unwrap_or(current_final_line);
            continue;
        }

        if let Some(author) = line.strip_prefix("author ") {
            meta.entry(current_sha.clone()).or_default().author = author.to_string();
        } else if let Some(t) = line.strip_prefix("author-time ") {
            meta.entry(current_sha.clone()).or_default().author_time = t.to_string();
        } else if let Some(s) = line.strip_prefix("summary ") {
            meta.entry(current_sha.clone()).or_default().summary = s.to_string();
        }
    }
    lines_out
}

pub async fn get_blame(repo_path: &Path, rel_path: &str) -> Result<Vec<BlameLine>, String> {
    let output = run_git(repo_path, &["blame", "--porcelain", "--", rel_path])
        .await
        .map_err(|e| format!("failed to run git blame: {e}"))?;
    if !output.success {
        return Err(if output.stderr.trim().is_empty() {
            "git blame failed".to_string()
        } else {
            output.stderr.trim().to_string()
        });
    }
    Ok(parse_blame(&output.stdout))
}
