use super::process::{run_git, run_git_with_env};
use super::refs::get_head_sha;
use super::status::get_conflicted_files;
use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};

fn git_err(prefix: &str, stderr: &str) -> String {
    if stderr.trim().is_empty() {
        prefix.to_string()
    } else {
        format!("{prefix}: {}", stderr.trim())
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum RebaseAction {
    Pick,
    Reword,
    Squash,
    Fixup,
    Drop,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RebasePlanItem {
    pub sha: String,
    pub action: RebaseAction,
    /// Reword: the new message. Squash/Fixup: an optional combined message
    /// overriding the default (previous + this, or just previous for fixup).
    pub message: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RebaseStepResult {
    pub status: String, // "done" | "conflict"
    pub conflicted_files: Vec<String>,
    pub message: Option<String>,
    pub previous_head_sha: Option<String>,
    pub new_head_sha: Option<String>,
    pub step: usize,
    pub total_steps: usize,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RebaseInProgress {
    pub original_branch: String,
    pub current_step: usize,
    pub total_steps: usize,
    pub conflicted_files: Vec<String>,
}

/// Persisted at `.git/gitsplash-rebase-state.json` while a rebase is
/// mid-flight (i.e. stopped on a conflict) so it survives an app restart —
/// the original branch ref is never touched until the whole plan finishes,
/// so an abort at any point is just "discard the detached work, switch back".
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct RebaseState {
    original_branch: String,
    previous_head_sha: String,
    plan: Vec<RebasePlanItem>,
    current_index: usize,
}

fn state_file_path(repo_path: &Path) -> PathBuf {
    repo_path.join(".git").join("gitsplash-rebase-state.json")
}

/// Rebase and cherry-pick both drive git's cherry-pick sequencer and persist
/// their own state file — running one while the other is mid-flight would
/// step on the same `CHERRY_PICK_HEAD`, so each checks for the other's file.
/// `pub(crate)` so `branch::merge_branch` can guard against the same clash.
pub(crate) fn cherry_pick_state_file_path(repo_path: &Path) -> PathBuf {
    repo_path.join(".git").join("gitsplash-cherry-pick-state.json")
}

pub(crate) fn rebase_state_file_path(repo_path: &Path) -> PathBuf {
    state_file_path(repo_path)
}

async fn persist_state(repo_path: &Path, state: &RebaseState) -> Result<(), String> {
    let json = serde_json::to_string_pretty(state).map_err(|e| e.to_string())?;
    tokio::fs::write(state_file_path(repo_path), json)
        .await
        .map_err(|e| format!("failed to save rebase state: {e}"))
}

async fn load_state(repo_path: &Path) -> Result<Option<RebaseState>, String> {
    match tokio::fs::read_to_string(state_file_path(repo_path)).await {
        Ok(content) => serde_json::from_str(&content)
            .map(Some)
            .map_err(|e| format!("failed to read rebase state: {e}")),
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(None),
        Err(e) => Err(format!("failed to read rebase state: {e}")),
    }
}

async fn remove_state_file(repo_path: &Path) {
    let _ = tokio::fs::remove_file(state_file_path(repo_path)).await;
}

/// Rejects plans that can't possibly execute: squashing/fixing up into a
/// commit that doesn't exist (either it's the first item, or everything
/// before it was dropped), or dropping every single commit.
fn validate_plan(plan: &[RebasePlanItem]) -> Result<(), String> {
    let mut has_kept = false;
    for item in plan {
        match item.action {
            RebaseAction::Drop => {}
            RebaseAction::Pick | RebaseAction::Reword => has_kept = true,
            RebaseAction::Squash | RebaseAction::Fixup => {
                if !has_kept {
                    return Err(
                        "cannot squash or fixup the first commit in the plan — there's nothing before it to combine into"
                            .to_string(),
                    );
                }
                has_kept = true;
            }
        }
    }
    if !has_kept {
        return Err("the rebase plan drops every commit — nothing would remain".to_string());
    }
    Ok(())
}

async fn get_commit_message(repo_path: &Path, rev: &str) -> Result<String, String> {
    let output = run_git(repo_path, &["log", "-1", "--format=%B", rev])
        .await
        .map_err(|e| format!("failed to read commit message: {e}"))?;
    if !output.success {
        return Err(git_err("failed to read commit message", &output.stderr));
    }
    Ok(output.stdout.trim_end().to_string())
}

async fn amend_message(repo_path: &Path, message: &str) -> Result<(), String> {
    let output = run_git(repo_path, &["commit", "--amend", "-m", message])
        .await
        .map_err(|e| format!("failed to run git commit --amend: {e}"))?;
    if !output.success {
        return Err(git_err("failed to reword commit", &output.stderr));
    }
    Ok(())
}

/// Applies the non-pick part of a step, once its commit is already sitting
/// at HEAD (either from a clean cherry-pick or from `--continue` after a
/// conflict) — reword just amends the message; squash/fixup fold HEAD back
/// into the commit below it and recommit as one.
async fn finish_step(repo_path: &Path, item: &RebasePlanItem) -> Result<(), String> {
    match item.action {
        RebaseAction::Pick => {
            if let Some(msg) = item.message.as_deref().filter(|m| !m.trim().is_empty()) {
                amend_message(repo_path, msg).await?;
            }
            Ok(())
        }
        RebaseAction::Reword => {
            let msg = item
                .message
                .as_deref()
                .filter(|m| !m.trim().is_empty())
                .ok_or_else(|| "reword requires a non-empty message".to_string())?;
            amend_message(repo_path, msg).await
        }
        RebaseAction::Squash | RebaseAction::Fixup => {
            let combined = match item.message.as_deref().filter(|m| !m.trim().is_empty()) {
                Some(m) => m.to_string(),
                None => {
                    let prev_msg = get_commit_message(repo_path, "HEAD~1").await?;
                    if item.action == RebaseAction::Squash {
                        let this_msg = get_commit_message(repo_path, "HEAD").await?;
                        format!("{prev_msg}\n\n{this_msg}")
                    } else {
                        prev_msg
                    }
                }
            };
            let reset_out = run_git(repo_path, &["reset", "--soft", "HEAD~2"])
                .await
                .map_err(|e| format!("failed to run git reset: {e}"))?;
            if !reset_out.success {
                return Err(git_err("failed to combine commits", &reset_out.stderr));
            }
            let commit_out = run_git(repo_path, &["commit", "-m", &combined])
                .await
                .map_err(|e| format!("failed to run git commit: {e}"))?;
            if !commit_out.success {
                return Err(git_err("failed to commit combined change", &commit_out.stderr));
            }
            Ok(())
        }
        RebaseAction::Drop => Ok(()),
    }
}

/// Cherry-picks (or continues cherry-picking) the current step, then walks
/// the rest of the plan. Stops and persists state on the first conflict;
/// otherwise runs to completion and moves the original branch ref onto the
/// final commit.
async fn run_plan(repo_path: &Path, state: &mut RebaseState) -> Result<RebaseStepResult, String> {
    let total = state.plan.len();
    while state.current_index < total {
        let item = state.plan[state.current_index].clone();
        if item.action == RebaseAction::Drop {
            state.current_index += 1;
            continue;
        }

        // diff3 markers give the conflict resolver UI the common-ancestor
        // version of each hunk, not just ours/theirs.
        let pick_out = run_git(repo_path, &["-c", "merge.conflictStyle=diff3", "cherry-pick", &item.sha])
            .await
            .map_err(|e| format!("failed to run git cherry-pick: {e}"))?;

        if !pick_out.success {
            persist_state(repo_path, state).await?;
            let conflicted = get_conflicted_files(repo_path).await.unwrap_or_default();
            if !conflicted.is_empty() {
                return Ok(RebaseStepResult {
                    status: "conflict".to_string(),
                    conflicted_files: conflicted,
                    message: Some(format!(
                        "rebase stopped at step {}/{} — resolve the listed files, then continue",
                        state.current_index + 1,
                        total
                    )),
                    previous_head_sha: None,
                    new_head_sha: None,
                    step: state.current_index,
                    total_steps: total,
                });
            }
            return Err(git_err("rebase step failed", &pick_out.stderr));
        }

        finish_step(repo_path, &item).await?;
        state.current_index += 1;
    }

    let new_head_sha = get_head_sha(repo_path)
        .await
        .ok_or_else(|| "could not resolve new HEAD after rebase".to_string())?;
    let update_out = run_git(repo_path, &["checkout", "-B", &state.original_branch, &new_head_sha])
        .await
        .map_err(|e| format!("failed to move branch: {e}"))?;
    if !update_out.success {
        persist_state(repo_path, state).await?;
        return Err(git_err(
            "rebase finished but moving the branch back failed — the rebase state was kept so you can retry",
            &update_out.stderr,
        ));
    }

    remove_state_file(repo_path).await;
    Ok(RebaseStepResult {
        status: "done".to_string(),
        conflicted_files: Vec::new(),
        message: None,
        previous_head_sha: Some(state.previous_head_sha.clone()),
        new_head_sha: Some(new_head_sha),
        step: total,
        total_steps: total,
    })
}

pub async fn start_rebase(repo_path: &Path, onto: &str, plan: Vec<RebasePlanItem>) -> Result<RebaseStepResult, String> {
    if plan.is_empty() {
        return Err("nothing to rebase".to_string());
    }
    validate_plan(&plan)?;

    if state_file_path(repo_path).exists() {
        return Err("a rebase is already in progress — continue or abort it first".to_string());
    }
    if cherry_pick_state_file_path(repo_path).exists() {
        return Err("a cherry-pick is in progress on this repo — finish or abort it before rebasing".to_string());
    }

    let status_out = run_git(repo_path, &["status", "--porcelain=2"])
        .await
        .map_err(|e| format!("failed to run git status: {e}"))?;
    if !status_out.success {
        return Err(git_err("git status failed", &status_out.stderr));
    }
    let dirty = status_out.stdout.lines().any(|l| !l.starts_with('#') && !l.trim().is_empty());
    if dirty {
        return Err("working tree has uncommitted changes — commit or stash them before rebasing".to_string());
    }

    let branch_out = run_git(repo_path, &["branch", "--show-current"])
        .await
        .map_err(|e| format!("failed to run git branch: {e}"))?;
    let original_branch = branch_out.stdout.trim().to_string();
    if original_branch.is_empty() {
        return Err("cannot start an interactive rebase in a detached HEAD state".to_string());
    }

    let previous_head_sha = get_head_sha(repo_path)
        .await
        .ok_or_else(|| "could not resolve current HEAD".to_string())?;

    let checkout_out = run_git(repo_path, &["checkout", "--detach", onto])
        .await
        .map_err(|e| format!("failed to run git checkout: {e}"))?;
    if !checkout_out.success {
        return Err(git_err("could not check out the rebase target", &checkout_out.stderr));
    }

    let mut state = RebaseState {
        original_branch,
        previous_head_sha,
        plan,
        current_index: 0,
    };

    run_plan(repo_path, &mut state).await
}

/// Resumes after the user has resolved the conflicted files from the last
/// stopped step (staged via the existing conflict-resolution commands).
pub async fn continue_rebase(repo_path: &Path) -> Result<RebaseStepResult, String> {
    let mut state = load_state(repo_path)
        .await?
        .ok_or_else(|| "no rebase in progress".to_string())?;

    let conflicted = get_conflicted_files(repo_path).await.unwrap_or_default();
    if !conflicted.is_empty() {
        return Err("resolve the remaining conflicted files before continuing".to_string());
    }

    // Only try to continue a cherry-pick if one is actually pending — if
    // every step already applied and it was just the final branch move that
    // failed (see run_plan), there's nothing to continue; fall straight
    // through to run_plan, which retries the branch move.
    if state.current_index < state.plan.len() {
        // GIT_EDITOR=true: cherry-pick --continue otherwise opens $GIT_EDITOR
        // to let you tweak the commit message, which would hang with no
        // terminal attached. `true` (the no-op unix command) just accepts
        // the default.
        let continue_out = run_git_with_env(
            repo_path,
            &["cherry-pick", "--continue"],
            &[("GIT_EDITOR", "true")],
        )
        .await
        .map_err(|e| format!("failed to run git cherry-pick --continue: {e}"))?;
        if !continue_out.success {
            return Err(git_err("could not continue the cherry-pick", &continue_out.stderr));
        }

        let item = state.plan[state.current_index].clone();
        finish_step(repo_path, &item).await?;
        state.current_index += 1;
    }

    run_plan(repo_path, &mut state).await
}

/// Safe at any point: the original branch ref is never moved until the plan
/// finishes, so aborting is just discarding the detached in-progress work
/// and switching back to the branch as it was.
pub async fn abort_rebase(repo_path: &Path) -> Result<(), String> {
    let state = load_state(repo_path)
        .await?
        .ok_or_else(|| "no rebase in progress".to_string())?;

    let cp_head = run_git(repo_path, &["rev-parse", "-q", "--verify", "CHERRY_PICK_HEAD"])
        .await
        .map_err(|e| e.to_string())?;
    if cp_head.success && !cp_head.stdout.trim().is_empty() {
        let abort_out = run_git(repo_path, &["cherry-pick", "--abort"])
            .await
            .map_err(|e| format!("failed to run git cherry-pick --abort: {e}"))?;
        if !abort_out.success {
            return Err(git_err("failed to abort the in-progress cherry-pick", &abort_out.stderr));
        }
    }

    let checkout_out = run_git(repo_path, &["checkout", &state.original_branch])
        .await
        .map_err(|e| format!("failed to run git checkout: {e}"))?;
    if !checkout_out.success {
        return Err(git_err("failed to switch back to the original branch", &checkout_out.stderr));
    }

    remove_state_file(repo_path).await;
    Ok(())
}

pub async fn get_in_progress_rebase(repo_path: &Path) -> Result<Option<RebaseInProgress>, String> {
    let Some(state) = load_state(repo_path).await? else {
        return Ok(None);
    };
    let conflicted = get_conflicted_files(repo_path).await.unwrap_or_default();
    Ok(Some(RebaseInProgress {
        original_branch: state.original_branch,
        current_step: state.current_index,
        total_steps: state.plan.len(),
        conflicted_files: conflicted,
    }))
}
