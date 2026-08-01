use super::process::run_git;
use super::status::get_status;
use serde::{Deserialize, Serialize};
use std::path::Path;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PushOutcome {
    pub pushed: bool,
    /// True when this push also published the branch for the first time
    /// (`git push -u origin <branch>`) because it had no upstream yet.
    pub set_upstream: bool,
    /// True specifically when the remote has commits the local branch
    /// doesn't — the caller can suggest fetch & pull rather than just
    /// showing a raw git error.
    pub rejected: bool,
    pub message: Option<String>,
}

/// Pushes the current branch, publishing it with `-u origin <branch>` the
/// first time it has no upstream. `force` uses `--force-with-lease` (never
/// a bare `--force`) so a push can't silently clobber commits someone else
/// pushed since our last fetch.
pub async fn push(repo_id: &str, repo_path: &Path, force: bool) -> PushOutcome {
    let status = get_status(repo_id, repo_path).await;
    if let Some(err) = status.error {
        return PushOutcome { pushed: false, set_upstream: false, rejected: false, message: Some(err) };
    }
    let Some(branch) = status.branch else {
        return PushOutcome {
            pushed: false,
            set_upstream: false,
            rejected: false,
            message: Some("detached HEAD — nothing to push".to_string()),
        };
    };

    let set_upstream = !status.has_upstream;
    let mut args: Vec<&str> = vec!["push"];
    if force {
        args.push("--force-with-lease");
    }
    if set_upstream {
        args.extend(["-u", "origin", branch.as_str()]);
    }

    let output = match run_git(repo_path, &args).await {
        Ok(o) => o,
        Err(e) => {
            return PushOutcome {
                pushed: false,
                set_upstream,
                rejected: false,
                message: Some(format!("failed to run git push: {e}")),
            }
        }
    };

    if output.success {
        return PushOutcome { pushed: true, set_upstream, rejected: false, message: None };
    }

    let stderr = output.stderr.trim();
    let rejected = stderr.contains("[rejected]")
        || stderr.contains("non-fast-forward")
        || stderr.contains("fetch first");
    PushOutcome {
        pushed: false,
        set_upstream,
        rejected,
        message: Some(if stderr.is_empty() { "git push failed".to_string() } else { stderr.to_string() }),
    }
}
