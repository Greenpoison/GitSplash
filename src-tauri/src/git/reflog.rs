use super::process::run_git;
use serde::{Deserialize, Serialize};
use std::path::Path;

const FIELD_SEP: char = '\u{1f}';
const RECORD_SEP: char = '\u{1e}';

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ReflogEntry {
    pub hash: String,
    /// The reflog selector (e.g. "HEAD@{0}") — usable directly as a ref for
    /// checking out or resetting to this entry.
    pub selector: String,
    /// Git's own reflog subject — e.g. "commit: fix bug", "checkout: moving
    /// from main to feature/x", "reset: moving to HEAD~2", "pull: Fast-forward".
    /// Already reasonably readable on its own; not translated further.
    pub action: String,
    pub date: String,
}

fn parse_reflog_records(stdout: &str) -> Vec<ReflogEntry> {
    let mut entries = Vec::new();
    for record in stdout.split(RECORD_SEP) {
        let record = record.trim();
        if record.is_empty() {
            continue;
        }
        let fields: Vec<&str> = record.split(FIELD_SEP).collect();
        if fields.len() < 4 {
            continue;
        }
        entries.push(ReflogEntry {
            hash: fields[0].to_string(),
            selector: fields[1].to_string(),
            action: fields[2].to_string(),
            date: fields[3].to_string(),
        });
    }
    entries
}

/// HEAD's reflog: every commit it has ever pointed to on this machine,
/// across every branch, survives here even after a branch is deleted, a
/// commit is reset away, or history is rewritten — git only garbage-collects
/// reflog entries after ~90 days (unreachable) by default. This is what
/// makes "I think I lost my work" almost always recoverable.
pub async fn get_reflog(repo_path: &Path, limit: u32) -> Result<Vec<ReflogEntry>, String> {
    let limit_arg = format!("-n{limit}");
    let format = format!("%H{FIELD_SEP}%gd{FIELD_SEP}%gs{FIELD_SEP}%ad{RECORD_SEP}");
    let output = run_git(
        repo_path,
        &[
            "log",
            "--walk-reflogs",
            "--date=iso-strict",
            &format!("--pretty=format:{format}"),
            &limit_arg,
        ],
    )
    .await
    .map_err(|e| format!("failed to run git log: {e}"))?;

    if !output.success {
        return Err(if output.stderr.trim().is_empty() {
            "git reflog failed".to_string()
        } else {
            output.stderr.trim().to_string()
        });
    }

    Ok(parse_reflog_records(&output.stdout))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn record(hash: &str, selector: &str, action: &str, date: &str) -> String {
        format!("{hash}{FIELD_SEP}{selector}{FIELD_SEP}{action}{FIELD_SEP}{date}{RECORD_SEP}")
    }

    #[test]
    fn parses_a_single_reflog_record() {
        let stdout = record("abc123", "HEAD@{0}", "commit: fix bug", "2026-01-01T00:00:00+00:00");
        let entries = parse_reflog_records(&stdout);
        assert_eq!(entries.len(), 1);
        assert_eq!(entries[0].hash, "abc123");
        assert_eq!(entries[0].selector, "HEAD@{0}");
        assert_eq!(entries[0].action, "commit: fix bug");
        assert_eq!(entries[0].date, "2026-01-01T00:00:00+00:00");
    }

    #[test]
    fn parses_multiple_records_in_order() {
        let stdout = format!(
            "{}{}",
            record("a", "HEAD@{0}", "checkout: moving from main to feature/x", "2026-01-02T00:00:00+00:00"),
            record("b", "HEAD@{1}", "commit: initial", "2026-01-01T00:00:00+00:00"),
        );
        let entries = parse_reflog_records(&stdout);
        assert_eq!(entries.len(), 2);
        assert_eq!(entries[0].hash, "a");
        assert_eq!(entries[1].hash, "b");
    }

    #[test]
    fn skips_incomplete_or_empty_records() {
        let stdout = format!("  {RECORD_SEP}too{FIELD_SEP}few{RECORD_SEP}");
        assert!(parse_reflog_records(&stdout).is_empty());
    }
}
