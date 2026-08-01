use super::process::run_git;
use serde::{Deserialize, Serialize};
use std::path::Path;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", tag = "kind")]
pub enum ConflictSegment {
    Plain {
        text: String,
    },
    Conflict {
        ours_label: String,
        theirs_label: String,
        ours: String,
        theirs: String,
        base: Option<String>,
    },
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ConflictFile {
    /// True when the file has no text conflict markers to parse — either
    /// it's binary, or git resolved it to one side without markers.
    /// The frontend falls back to whole-file "keep ours"/"keep theirs".
    pub is_binary: bool,
    pub segments: Vec<ConflictSegment>,
}

/// Splits on '\n' without trimming '\r', so CRLF files round-trip exactly —
/// rewriting a resolved file must never touch line endings on lines we
/// didn't actually change, or every unrelated line would show up dirty.
fn split_lines(content: &str) -> Vec<&str> {
    content.split('\n').collect()
}

fn parse_conflicts(content: &str) -> ConflictFile {
    let lines = split_lines(content);
    let mut segments = Vec::new();
    let mut plain_buf: Vec<&str> = Vec::new();
    let mut i = 0;

    while i < lines.len() {
        let trimmed = lines[i].trim_end_matches('\r');
        if trimmed.starts_with("<<<<<<< ") {
            if !plain_buf.is_empty() {
                segments.push(ConflictSegment::Plain { text: plain_buf.join("\n") });
                plain_buf.clear();
            }
            let ours_label = trimmed.trim_start_matches("<<<<<<< ").to_string();
            i += 1;

            let mut ours = Vec::new();
            while i < lines.len() {
                let t = lines[i].trim_end_matches('\r');
                if t.starts_with("=======") || t.starts_with("||||||| ") {
                    break;
                }
                ours.push(lines[i]);
                i += 1;
            }

            let mut base: Option<Vec<&str>> = None;
            if i < lines.len() && lines[i].trim_end_matches('\r').starts_with("||||||| ") {
                i += 1;
                let mut base_lines = Vec::new();
                while i < lines.len() && !lines[i].trim_end_matches('\r').starts_with("=======") {
                    base_lines.push(lines[i]);
                    i += 1;
                }
                base = Some(base_lines);
            }
            if i < lines.len() {
                i += 1; // consume "======="
            }

            let mut theirs = Vec::new();
            while i < lines.len() && !lines[i].trim_end_matches('\r').starts_with(">>>>>>> ") {
                theirs.push(lines[i]);
                i += 1;
            }
            let theirs_label = if i < lines.len() {
                lines[i].trim_end_matches('\r').trim_start_matches(">>>>>>> ").to_string()
            } else {
                String::new()
            };
            if i < lines.len() {
                i += 1; // consume ">>>>>>> ..."
            }

            segments.push(ConflictSegment::Conflict {
                ours_label,
                theirs_label,
                ours: ours.join("\n"),
                theirs: theirs.join("\n"),
                base: base.map(|b| b.join("\n")),
            });
        } else {
            plain_buf.push(lines[i]);
            i += 1;
        }
    }
    if !plain_buf.is_empty() {
        segments.push(ConflictSegment::Plain { text: plain_buf.join("\n") });
    }
    ConflictFile { is_binary: false, segments }
}

pub async fn get_conflict_sections(repo_path: &Path, rel_path: &str) -> Result<ConflictFile, String> {
    let full_path = repo_path.join(rel_path);
    let bytes = tokio::fs::read(&full_path)
        .await
        .map_err(|e| format!("failed to read {rel_path}: {e}"))?;
    match String::from_utf8(bytes) {
        Ok(content) => Ok(parse_conflicts(&content)),
        Err(_) => Ok(ConflictFile { is_binary: true, segments: vec![] }),
    }
}

pub async fn write_resolved_file(repo_path: &Path, rel_path: &str, content: &str) -> Result<(), String> {
    tokio::fs::write(repo_path.join(rel_path), content)
        .await
        .map_err(|e| format!("failed to write {rel_path}: {e}"))?;
    stage_resolved(repo_path, rel_path).await
}

async fn stage_resolved(repo_path: &Path, rel_path: &str) -> Result<(), String> {
    let output = run_git(repo_path, &["add", "--", rel_path])
        .await
        .map_err(|e| e.to_string())?;
    if !output.success {
        return Err(if output.stderr.trim().is_empty() {
            "failed to mark file resolved".to_string()
        } else {
            output.stderr.trim().to_string()
        });
    }
    Ok(())
}

async fn restore_side(repo_path: &Path, rel_path: &str, side: &str) -> Result<(), String> {
    let output = run_git(repo_path, &["restore", side, "--", rel_path])
        .await
        .map_err(|e| e.to_string())?;
    if !output.success {
        return Err(if output.stderr.trim().is_empty() {
            format!("failed to restore {side}")
        } else {
            output.stderr.trim().to_string()
        });
    }
    stage_resolved(repo_path, rel_path).await
}

pub async fn keep_ours(repo_path: &Path, rel_path: &str) -> Result<(), String> {
    restore_side(repo_path, rel_path, "--ours").await
}

pub async fn keep_theirs(repo_path: &Path, rel_path: &str) -> Result<(), String> {
    restore_side(repo_path, rel_path, "--theirs").await
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_a_single_conflict_with_surrounding_plain_text() {
        let content = "before\n<<<<<<< HEAD\nours line\n=======\ntheirs line\n>>>>>>> feature\nafter";
        let file = parse_conflicts(content);
        assert!(!file.is_binary);
        assert_eq!(file.segments.len(), 3);
        match &file.segments[0] {
            ConflictSegment::Plain { text } => assert_eq!(text, "before"),
            _ => panic!("expected plain segment"),
        }
        match &file.segments[1] {
            ConflictSegment::Conflict { ours_label, theirs_label, ours, theirs, base } => {
                assert_eq!(ours_label, "HEAD");
                assert_eq!(theirs_label, "feature");
                assert_eq!(ours, "ours line");
                assert_eq!(theirs, "theirs line");
                assert!(base.is_none());
            }
            _ => panic!("expected conflict segment"),
        }
        match &file.segments[2] {
            ConflictSegment::Plain { text } => assert_eq!(text, "after"),
            _ => panic!("expected plain segment"),
        }
    }

    #[test]
    fn parses_a_conflict_with_a_base_section() {
        let content = "<<<<<<< HEAD\nours\n||||||| base\noriginal\n=======\ntheirs\n>>>>>>> feature";
        let file = parse_conflicts(content);
        assert_eq!(file.segments.len(), 1);
        match &file.segments[0] {
            ConflictSegment::Conflict { base, .. } => {
                assert_eq!(base.as_deref(), Some("original"));
            }
            _ => panic!("expected conflict segment"),
        }
    }

    #[test]
    fn parses_multiple_conflicts_in_one_file() {
        let content = "<<<<<<< HEAD\na\n=======\nb\n>>>>>>> feature\nmiddle\n<<<<<<< HEAD\nc\n=======\nd\n>>>>>>> feature\n";
        let file = parse_conflicts(content);
        let conflict_count = file
            .segments
            .iter()
            .filter(|s| matches!(s, ConflictSegment::Conflict { .. }))
            .count();
        assert_eq!(conflict_count, 2);
    }

    #[test]
    fn treats_content_with_no_markers_as_all_plain() {
        let content = "just some\nordinary file content";
        let file = parse_conflicts(content);
        assert_eq!(file.segments.len(), 1);
        match &file.segments[0] {
            ConflictSegment::Plain { text } => assert_eq!(text, "just some\nordinary file content"),
            _ => panic!("expected plain segment"),
        }
    }
}
