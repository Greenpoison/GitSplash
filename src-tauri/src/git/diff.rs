use super::process::run_git;
use serde::{Deserialize, Serialize};
use std::path::Path;
use std::process::Stdio;
use tokio::io::AsyncWriteExt;
use tokio::process::Command;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DiffLine {
    pub kind: String, // "context" | "add" | "del"
    pub content: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DiffHunk {
    pub header: String,
    pub lines: Vec<DiffLine>,
    /// Verbatim hunk text (header + body) — round-tripped back to us when
    /// staging/unstaging/discarding just this hunk, so we can rebuild an
    /// exact patch without trusting any row/index that could go stale.
    pub raw: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FileDiff {
    pub is_binary: bool,
    pub hunks: Vec<DiffHunk>,
}

fn classify(line: &str) -> DiffLine {
    if let Some(rest) = line.strip_prefix('+') {
        DiffLine { kind: "add".to_string(), content: rest.to_string() }
    } else if let Some(rest) = line.strip_prefix('-') {
        DiffLine { kind: "del".to_string(), content: rest.to_string() }
    } else {
        DiffLine {
            kind: "context".to_string(),
            content: line.strip_prefix(' ').unwrap_or(line).to_string(),
        }
    }
}

pub(crate) fn parse_diff(raw_output: &str) -> (String, Vec<DiffHunk>) {
    let lines: Vec<&str> = raw_output.lines().collect();
    let split_at = lines.iter().position(|l| l.starts_with("@@ ")).unwrap_or(lines.len());
    let file_header = lines[..split_at].join("\n");

    let mut hunks = Vec::new();
    let mut i = split_at;
    while i < lines.len() {
        let header = lines[i].to_string();
        let mut body_lines = Vec::new();
        let mut raw_lines = vec![lines[i]];
        i += 1;
        while i < lines.len() && !lines[i].starts_with("@@ ") {
            body_lines.push(classify(lines[i]));
            raw_lines.push(lines[i]);
            i += 1;
        }
        hunks.push(DiffHunk {
            header,
            lines: body_lines,
            raw: raw_lines.join("\n"),
        });
    }
    (file_header, hunks)
}

/// Synthesizes a diff for an untracked file (git itself won't diff
/// something outside the index) — every line renders as added. Hunk-level
/// staging is intentionally not offered for these; only whole-file `git
/// add` makes sense for a file with no prior tracked version to hunk against.
pub async fn get_untracked_file_diff(repo_path: &Path, rel_path: &str) -> Result<FileDiff, String> {
    let full_path = repo_path.join(rel_path);
    let bytes = tokio::fs::read(&full_path)
        .await
        .map_err(|e| format!("failed to read {rel_path}: {e}"))?;
    if bytes.iter().take(8000).any(|b| *b == 0) {
        return Ok(FileDiff { is_binary: true, hunks: vec![] });
    }
    let content = String::from_utf8_lossy(&bytes);
    let lines: Vec<DiffLine> = content
        .lines()
        .map(|l| DiffLine { kind: "add".to_string(), content: l.to_string() })
        .collect();
    let count = lines.len();
    Ok(FileDiff {
        is_binary: false,
        hunks: vec![DiffHunk {
            header: format!("@@ -0,0 +1,{count} @@"),
            lines,
            raw: String::new(), // no patch application supported for untracked files
        }],
    })
}

pub async fn get_file_diff(repo_path: &Path, rel_path: &str, staged: bool) -> Result<(String, FileDiff), String> {
    let mut args = vec!["diff", "--no-color"];
    if staged {
        args.push("--cached");
    }
    args.push("--");
    args.push(rel_path);
    let output = run_git(repo_path, &args)
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
        return Ok((output.stdout, FileDiff { is_binary: true, hunks: vec![] }));
    }
    let (file_header, hunks) = parse_diff(&output.stdout);
    Ok((file_header, FileDiff { is_binary: false, hunks }))
}

async fn apply_patch(repo_path: &Path, patch: &str, reverse: bool, cached: bool) -> Result<(), String> {
    let mut args = vec!["apply"];
    if reverse {
        args.push("--reverse");
    }
    if cached {
        args.push("--cached");
    }
    args.push("-");

    let mut child = Command::new("git")
        .arg("-C")
        .arg(repo_path)
        .args(&args)
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|e| format!("failed to run git apply: {e}"))?;

    child
        .stdin
        .take()
        .expect("stdin was piped")
        .write_all(patch.as_bytes())
        .await
        .map_err(|e| format!("failed to write patch: {e}"))?;

    let output = child
        .wait_with_output()
        .await
        .map_err(|e| format!("failed waiting on git apply: {e}"))?;
    if !output.status.success() {
        return Err(String::from_utf8_lossy(&output.stderr).trim().to_string());
    }
    Ok(())
}

/// Re-fetches the current diff and finds the hunk whose raw text still
/// matches exactly, so we only ever apply a patch built from live state —
/// never one that could have gone stale between the UI showing it and the
/// user clicking a button.
async fn build_patch_for_hunk(
    repo_path: &Path,
    rel_path: &str,
    hunk_raw: &str,
    staged: bool,
) -> Result<String, String> {
    let (file_header, diff) = get_file_diff(repo_path, rel_path, staged).await?;
    if diff.is_binary {
        return Err("cannot patch a binary file by hunk".to_string());
    }
    let hunk = diff
        .hunks
        .iter()
        .find(|h| h.raw == hunk_raw)
        .ok_or_else(|| "that hunk no longer matches the current diff — refresh and try again".to_string())?;
    Ok(format!("{file_header}\n{}\n", hunk.raw))
}

pub async fn stage_hunk(repo_path: &Path, rel_path: &str, hunk_raw: &str) -> Result<(), String> {
    let patch = build_patch_for_hunk(repo_path, rel_path, hunk_raw, false).await?;
    apply_patch(repo_path, &patch, false, true).await
}

pub async fn unstage_hunk(repo_path: &Path, rel_path: &str, hunk_raw: &str) -> Result<(), String> {
    let patch = build_patch_for_hunk(repo_path, rel_path, hunk_raw, true).await?;
    apply_patch(repo_path, &patch, true, true).await
}

/// Destructive: discards the hunk from the working tree.
pub async fn discard_hunk(repo_path: &Path, rel_path: &str, hunk_raw: &str) -> Result<(), String> {
    let patch = build_patch_for_hunk(repo_path, rel_path, hunk_raw, false).await?;
    apply_patch(repo_path, &patch, true, false).await
}
