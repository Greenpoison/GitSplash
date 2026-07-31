use super::process::run_git;
use super::status::get_status;
use serde::{Deserialize, Serialize};
use std::path::Path;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FetchOutcome {
    /// True as soon as `git fetch` itself succeeds, regardless of what
    /// happens to the optional pull step afterwards.
    pub fetched: bool,
    pub pulled: bool,
    /// True when a pull was requested but deliberately not attempted
    /// (dirty tree, no upstream, or a diverged branch) rather than a hard
    /// failure of a git command.
    pub skipped_pull: bool,
    /// Human-readable detail for the non-happy-path cases; None means
    /// everything requested actually happened.
    pub message: Option<String>,
}

/// Fetches a repo and, if `pull` is requested, fast-forwards the current
/// branch onto its upstream. Never merges, stashes, or force-updates —
/// a dirty tree or a diverged branch simply causes the pull half to be
/// skipped/reported while the fetch result is preserved.
pub async fn fetch_and_maybe_pull(repo_id: &str, repo_path: &Path, pull: bool) -> FetchOutcome {
    let fetch_output = match run_git(repo_path, &["fetch", "--prune"]).await {
        Ok(o) => o,
        Err(e) => {
            return FetchOutcome {
                fetched: false,
                pulled: false,
                skipped_pull: false,
                message: Some(format!("failed to run git fetch: {e}")),
            }
        }
    };

    if !fetch_output.success {
        let message = if fetch_output.stderr.trim().is_empty() {
            "git fetch failed".to_string()
        } else {
            fetch_output.stderr.trim().to_string()
        };
        return FetchOutcome {
            fetched: false,
            pulled: false,
            skipped_pull: false,
            message: Some(message),
        };
    }

    if !pull {
        return FetchOutcome {
            fetched: true,
            pulled: false,
            skipped_pull: false,
            message: None,
        };
    }

    let status = get_status(repo_id, repo_path).await;
    if let Some(err) = status.error {
        return FetchOutcome {
            fetched: true,
            pulled: false,
            skipped_pull: true,
            message: Some(format!("could not check status before pull: {err}")),
        };
    }
    if !status.has_upstream {
        return FetchOutcome {
            fetched: true,
            pulled: false,
            skipped_pull: true,
            message: Some("skipped pull: branch has no upstream".to_string()),
        };
    }
    if status.is_dirty {
        return FetchOutcome {
            fetched: true,
            pulled: false,
            skipped_pull: true,
            message: Some("skipped pull: working tree is not clean".to_string()),
        };
    }

    let merge_output = match run_git(repo_path, &["merge", "--ff-only", "@{upstream}"]).await {
        Ok(o) => o,
        Err(e) => {
            return FetchOutcome {
                fetched: true,
                pulled: false,
                skipped_pull: false,
                message: Some(format!("failed to run git merge: {e}")),
            }
        }
    };

    if !merge_output.success {
        let message = if merge_output.stderr.trim().is_empty() {
            "pull failed: branch has diverged from upstream (not fast-forwardable)".to_string()
        } else {
            format!("pull failed: {}", merge_output.stderr.trim())
        };
        return FetchOutcome {
            fetched: true,
            pulled: false,
            skipped_pull: false,
            message: Some(message),
        };
    }

    FetchOutcome {
        fetched: true,
        pulled: true,
        skipped_pull: false,
        message: None,
    }
}
