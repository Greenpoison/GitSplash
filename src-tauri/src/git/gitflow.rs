use super::branch::{merge_branch, resolve_freshest_base};
use super::process::run_git;
use serde::{Deserialize, Serialize};
use std::path::Path;

fn git_err(prefix: &str, stderr: &str) -> String {
    if stderr.trim().is_empty() {
        prefix.to_string()
    } else {
        format!("{prefix}: {}", stderr.trim())
    }
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum GitflowKind {
    Feature,
    Release,
    Hotfix,
}

impl GitflowKind {
    fn prefix(self) -> &'static str {
        match self {
            GitflowKind::Feature => "feature",
            GitflowKind::Release => "release",
            GitflowKind::Hotfix => "hotfix",
        }
    }
}

pub fn branch_name(kind: GitflowKind, name: &str) -> String {
    format!("{}/{name}", kind.prefix())
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GitflowFinishResult {
    pub success: bool,
    pub completed_steps: Vec<String>,
    pub conflicted_files: Vec<String>,
    pub message: Option<String>,
}

/// Creates `<prefix>/<name>` off `base_branch` and checks it out — the
/// entirety of "starting" a gitflow branch, since it's just a naming
/// convention layered on the existing checkout primitive.
pub async fn start_gitflow_branch(repo_path: &Path, kind: GitflowKind, name: &str, base_branch: &str) -> Result<(), String> {
    let branch = branch_name(kind, name);
    let resolved_base = resolve_freshest_base(repo_path, base_branch).await;
    // `--` stops option parsing before the start-point — `resolved_base` can
    // come from a branch's upstream ref, not just something the local user
    // chose, so a value starting with `-` shouldn't be parsed as a flag.
    let output = run_git(repo_path, &["switch", "-c", &branch, "--no-track", "--", &resolved_base])
        .await
        .map_err(|e| format!("failed to run git switch: {e}"))?;
    if !output.success {
        return Err(git_err(&format!("could not create {branch}"), &output.stderr));
    }
    Ok(())
}

/// Merges `<prefix>/<name>` into each of `targets` in order (feature: just
/// develop; release/hotfix: typically main then develop), optionally tags
/// the branch and deletes it once merged everywhere. Stops at the first
/// conflicting merge rather than trying to resume automatically — resolve
/// it with the normal conflict tools, commit, then merge into any remaining
/// targets with the regular Merge button.
pub async fn finish_gitflow_branch(
    repo_path: &Path,
    kind: GitflowKind,
    name: &str,
    targets: &[String],
    tag: Option<&str>,
    delete_branch: bool,
) -> Result<GitflowFinishResult, String> {
    let branch = branch_name(kind, name);
    let mut completed = Vec::new();

    for target in targets {
        let checkout_out = run_git(repo_path, &["switch", target])
            .await
            .map_err(|e| format!("failed to run git switch: {e}"))?;
        if !checkout_out.success {
            return Err(git_err(&format!("could not switch to {target}"), &checkout_out.stderr));
        }

        let merge_result = merge_branch(repo_path, &branch, true).await?;
        if !merge_result.success {
            return Ok(GitflowFinishResult {
                success: false,
                completed_steps: completed,
                conflicted_files: merge_result.conflicted_files,
                message: Some(format!(
                    "stopped merging {branch} into {target} — resolve the conflicts, commit, \
                     then merge {branch} into any remaining targets with the regular Merge button"
                )),
            });
        }
        completed.push(format!("merged into {target}"));
    }

    if let Some(tag_name) = tag.filter(|t| !t.trim().is_empty()) {
        let tag_out = run_git(repo_path, &["tag", tag_name])
            .await
            .map_err(|e| format!("failed to run git tag: {e}"))?;
        if tag_out.success {
            completed.push(format!("tagged {tag_name}"));
        } else {
            completed.push(format!("could not create tag {tag_name}: {}", tag_out.stderr.trim()));
        }
    }

    if delete_branch {
        let del_out = run_git(repo_path, &["branch", "-d", &branch])
            .await
            .map_err(|e| format!("failed to run git branch -d: {e}"))?;
        if del_out.success {
            completed.push(format!("deleted {branch}"));
        } else {
            // Not fatal — the merges already succeeded, which is the part
            // that matters; leftover branch is harmless and easy to clean
            // up by hand.
            completed.push(format!("could not delete {branch}: {}", del_out.stderr.trim()));
        }
    }

    Ok(GitflowFinishResult {
        success: true,
        completed_steps: completed,
        conflicted_files: Vec::new(),
        message: None,
    })
}
