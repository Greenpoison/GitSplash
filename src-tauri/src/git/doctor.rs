use super::process::run_git;
use super::status::get_status;
use serde::{Deserialize, Serialize};
use std::path::Path;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct HealthIssue {
    pub id: String,
    /// "warning" | "info"
    pub severity: String,
    pub title: String,
    pub detail: String,
}

const LARGE_FILE_THRESHOLD_BYTES: u64 = 5 * 1024 * 1024;
const MAX_LARGE_FILES_REPORTED: usize = 10;

fn parse_large_files(stdout: &str, threshold: u64) -> Vec<(String, u64)> {
    let mut large = Vec::new();
    for line in stdout.lines() {
        let Some((meta, path)) = line.split_once('\t') else {
            continue;
        };
        let mut parts = meta.split_whitespace();
        parts.next(); // mode
        parts.next(); // type
        parts.next(); // hash
        let Some(size) = parts.next().and_then(|s| s.parse::<u64>().ok()) else {
            continue;
        };
        if size > threshold {
            large.push((path.to_string(), size));
        }
    }
    large.sort_by(|a, b| b.1.cmp(&a.1));
    large
}

/// A handful of quick, cheap checks for the mistakes beginners most often
/// hit without realizing — run on demand rather than on every status poll,
/// since listing tracked-file sizes isn't free on a large repo.
pub async fn run_health_check(repo_id: &str, repo_path: &Path) -> Result<Vec<HealthIssue>, String> {
    let mut issues = Vec::new();

    let status = get_status(repo_id, repo_path).await;
    if let Some(err) = status.error {
        return Err(err);
    }

    if status.branch.is_none() {
        issues.push(HealthIssue {
            id: "detached-head".to_string(),
            severity: "warning".to_string(),
            title: "You're in a detached HEAD state".to_string(),
            detail: "You're not on any named branch right now — commits made here can become \
                     hard to find later. Create a branch if you want to keep them."
                .to_string(),
        });
    } else if !status.has_upstream {
        issues.push(HealthIssue {
            id: "no-upstream".to_string(),
            severity: "info".to_string(),
            title: "This branch isn't published".to_string(),
            detail: "It has no upstream on the remote yet — use the Push button to publish it."
                .to_string(),
        });
    }

    if repo_path.join(".git").join("MERGE_HEAD").exists() {
        issues.push(HealthIssue {
            id: "merge-in-progress".to_string(),
            severity: "warning".to_string(),
            title: "A merge is still in progress".to_string(),
            detail: "Resolve any conflicts and commit to finish it, or abort it and try again."
                .to_string(),
        });
    }

    if !repo_path.join(".gitignore").exists() {
        issues.push(HealthIssue {
            id: "no-gitignore".to_string(),
            severity: "info".to_string(),
            title: "No .gitignore file".to_string(),
            detail: "Without one, build output and editor/OS files are easy to accidentally \
                     commit. The .gitignore assistant in the Changes tab can generate one."
                .to_string(),
        });
    }

    if !repo_path.join(".gitattributes").exists() {
        issues.push(HealthIssue {
            id: "no-gitattributes".to_string(),
            severity: "info".to_string(),
            title: "No .gitattributes file".to_string(),
            detail: "Without one, line-ending handling depends on each collaborator's local \
                     git config, which can make git status show a file as \"modified\" with an \
                     empty diff — nothing is actually wrong, but it's confusing. A \
                     `.gitattributes` with `* text=auto` makes line-ending behavior consistent \
                     for everyone regardless of their own settings."
                .to_string(),
        });
    }

    let output = run_git(repo_path, &["ls-tree", "-r", "-l", "HEAD"])
        .await
        .map_err(|e| format!("failed to run git ls-tree: {e}"))?;
    // A brand-new repo with no commits yet has no HEAD to list — not a real
    // error, just nothing to report on this check.
    if output.success {
        let large = parse_large_files(&output.stdout, LARGE_FILE_THRESHOLD_BYTES);
        if !large.is_empty() {
            let mb = LARGE_FILE_THRESHOLD_BYTES / (1024 * 1024);
            let mut detail = format!(
                "{} tracked file{} over {mb}MB, which can make clones and fetches slow:\n",
                large.len(),
                if large.len() == 1 { "" } else { "s" },
            );
            for (path, size) in large.iter().take(MAX_LARGE_FILES_REPORTED) {
                detail.push_str(&format!("\n{path} ({:.1}MB)", *size as f64 / (1024.0 * 1024.0)));
            }
            if large.len() > MAX_LARGE_FILES_REPORTED {
                detail.push_str(&format!("\n…and {} more", large.len() - MAX_LARGE_FILES_REPORTED));
            }
            issues.push(HealthIssue {
                id: "large-files".to_string(),
                severity: "warning".to_string(),
                title: "Large files are tracked in this repo".to_string(),
                detail,
            });
        }
    }

    Ok(issues)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn flags_files_over_the_threshold() {
        let stdout = "100644 blob 8a1218a1024e12e69c9e19f9b0d5a6b8b4e6e5c1     123\tsrc/main.rs\n\
             100644 blob 3b1218a1024e12e69c9e19f9b0d5a6b8b4e6e5c2 6291456\tassets/video.mp4";
        let large = parse_large_files(stdout, LARGE_FILE_THRESHOLD_BYTES);
        assert_eq!(large.len(), 1);
        assert_eq!(large[0].0, "assets/video.mp4");
        assert_eq!(large[0].1, 6291456);
    }

    #[test]
    fn sorts_largest_first() {
        let stdout = "100644 blob aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa 6000000\tsmaller.bin\n\
             100644 blob bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb 9000000\tbigger.bin";
        let large = parse_large_files(stdout, LARGE_FILE_THRESHOLD_BYTES);
        assert_eq!(large[0].0, "bigger.bin");
        assert_eq!(large[1].0, "smaller.bin");
    }

    #[test]
    fn ignores_files_at_or_under_the_threshold() {
        let stdout = "100644 blob aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa 100\ttiny.txt";
        assert!(parse_large_files(stdout, LARGE_FILE_THRESHOLD_BYTES).is_empty());
    }

    #[test]
    fn ignores_unparseable_lines() {
        assert!(parse_large_files("not a valid ls-tree line", LARGE_FILE_THRESHOLD_BYTES).is_empty());
        assert!(parse_large_files("", LARGE_FILE_THRESHOLD_BYTES).is_empty());
    }
}
