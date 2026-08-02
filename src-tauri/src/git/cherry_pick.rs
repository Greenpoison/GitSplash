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

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CherryPickStepResult {
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
pub struct CherryPickInProgress {
    pub current_step: usize,
    pub total_steps: usize,
    pub conflicted_files: Vec<String>,
}

/// Persisted at `.git/gitsplash-cherry-pick-state.json` while a multi-commit
/// cherry-pick is mid-flight (stopped on a conflict) — unlike rebase, this
/// applies directly onto whatever branch is checked out (no detached HEAD),
/// so `previous_head_sha` is kept purely so abort can hard-reset back past
/// any commits that were *already* successfully applied before the one that
/// conflicted.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct CherryPickState {
    previous_head_sha: String,
    shas: Vec<String>,
    current_index: usize,
}

fn state_file_path(repo_path: &Path) -> PathBuf {
    repo_path.join(".git").join("gitsplash-cherry-pick-state.json")
}

/// Rebase and cherry-pick both drive git's cherry-pick sequencer and persist
/// their own state file — running one while the other is mid-flight would
/// step on the same `CHERRY_PICK_HEAD`, so each checks for the other's file.
fn rebase_state_file_path(repo_path: &Path) -> PathBuf {
    repo_path.join(".git").join("gitsplash-rebase-state.json")
}

async fn persist_state(repo_path: &Path, state: &CherryPickState) -> Result<(), String> {
    let json = serde_json::to_string_pretty(state).map_err(|e| e.to_string())?;
    tokio::fs::write(state_file_path(repo_path), json)
        .await
        .map_err(|e| format!("failed to save cherry-pick state: {e}"))
}

async fn load_state(repo_path: &Path) -> Result<Option<CherryPickState>, String> {
    match tokio::fs::read_to_string(state_file_path(repo_path)).await {
        Ok(content) => serde_json::from_str(&content)
            .map(Some)
            .map_err(|e| format!("failed to read cherry-pick state: {e}")),
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(None),
        Err(e) => Err(format!("failed to read cherry-pick state: {e}")),
    }
}

async fn remove_state_file(repo_path: &Path) {
    let _ = tokio::fs::remove_file(state_file_path(repo_path)).await;
}

/// Cherry-picks the current step (or resumes into it via `--continue`), then
/// walks the rest of the list. Stops and persists state on the first
/// conflict; otherwise runs to completion in place on the current branch —
/// there's no branch ref to move, unlike rebase.
async fn run_plan(repo_path: &Path, state: &mut CherryPickState) -> Result<CherryPickStepResult, String> {
    let total = state.shas.len();
    while state.current_index < total {
        let sha = state.shas[state.current_index].clone();

        // diff3 markers give the conflict resolver UI the common-ancestor
        // version of each hunk, not just ours/theirs.
        let pick_out = run_git(repo_path, &["-c", "merge.conflictStyle=diff3", "cherry-pick", &sha])
            .await
            .map_err(|e| format!("failed to run git cherry-pick: {e}"))?;

        if !pick_out.success {
            persist_state(repo_path, state).await?;
            let conflicted = get_conflicted_files(repo_path).await.unwrap_or_default();
            if !conflicted.is_empty() {
                return Ok(CherryPickStepResult {
                    status: "conflict".to_string(),
                    conflicted_files: conflicted,
                    message: Some(format!(
                        "cherry-pick stopped at step {}/{} — resolve the listed files, then continue",
                        state.current_index + 1,
                        total
                    )),
                    previous_head_sha: None,
                    new_head_sha: None,
                    step: state.current_index,
                    total_steps: total,
                });
            }
            return Err(git_err("cherry-pick step failed", &pick_out.stderr));
        }

        state.current_index += 1;
    }

    let new_head_sha = get_head_sha(repo_path)
        .await
        .ok_or_else(|| "could not resolve new HEAD after cherry-pick".to_string())?;
    remove_state_file(repo_path).await;
    Ok(CherryPickStepResult {
        status: "done".to_string(),
        conflicted_files: Vec::new(),
        message: None,
        previous_head_sha: Some(state.previous_head_sha.clone()),
        new_head_sha: Some(new_head_sha),
        step: total,
        total_steps: total,
    })
}

pub async fn start_cherry_pick(repo_path: &Path, shas: Vec<String>) -> Result<CherryPickStepResult, String> {
    if shas.is_empty() {
        return Err("nothing selected to cherry-pick".to_string());
    }

    if state_file_path(repo_path).exists() {
        return Err("a cherry-pick is already in progress — continue or abort it first".to_string());
    }
    if rebase_state_file_path(repo_path).exists() {
        return Err("a rebase is in progress on this repo — finish or abort it before cherry-picking".to_string());
    }

    let status_out = run_git(repo_path, &["status", "--porcelain=2"])
        .await
        .map_err(|e| format!("failed to run git status: {e}"))?;
    if !status_out.success {
        return Err(git_err("git status failed", &status_out.stderr));
    }
    let dirty = status_out.stdout.lines().any(|l| !l.starts_with('#') && !l.trim().is_empty());
    if dirty {
        return Err("working tree has uncommitted changes — commit or stash them before cherry-picking".to_string());
    }

    let previous_head_sha = get_head_sha(repo_path)
        .await
        .ok_or_else(|| "could not resolve current HEAD".to_string())?;

    let mut state = CherryPickState {
        previous_head_sha,
        shas,
        current_index: 0,
    };

    run_plan(repo_path, &mut state).await
}

/// Resumes after the user has resolved the conflicted files from the last
/// stopped step (staged via the existing conflict-resolution commands).
pub async fn continue_cherry_pick(repo_path: &Path) -> Result<CherryPickStepResult, String> {
    let mut state = load_state(repo_path)
        .await?
        .ok_or_else(|| "no cherry-pick in progress".to_string())?;

    let conflicted = get_conflicted_files(repo_path).await.unwrap_or_default();
    if !conflicted.is_empty() {
        return Err("resolve the remaining conflicted files before continuing".to_string());
    }

    // GIT_EDITOR=true: cherry-pick --continue otherwise opens $GIT_EDITOR to
    // let you tweak the commit message, which would hang with no terminal
    // attached. `true` (the no-op unix command) just accepts the default.
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
    state.current_index += 1;

    run_plan(repo_path, &mut state).await
}

/// Unwinds the whole operation, not just the currently-conflicted step —
/// unlike rebase (which works on a detached HEAD and just switches back),
/// cherry-pick applies directly onto the current branch, so any commits
/// already picked before the one that conflicted need undoing too.
pub async fn abort_cherry_pick(repo_path: &Path) -> Result<(), String> {
    let state = load_state(repo_path)
        .await?
        .ok_or_else(|| "no cherry-pick in progress".to_string())?;

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

    let reset_out = run_git(repo_path, &["reset", "--hard", &state.previous_head_sha])
        .await
        .map_err(|e| format!("failed to run git reset: {e}"))?;
    if !reset_out.success {
        return Err(git_err("failed to reset back to the pre-cherry-pick state", &reset_out.stderr));
    }

    remove_state_file(repo_path).await;
    Ok(())
}

pub async fn get_in_progress_cherry_pick(repo_path: &Path) -> Result<Option<CherryPickInProgress>, String> {
    let Some(state) = load_state(repo_path).await? else {
        return Ok(None);
    };
    let conflicted = get_conflicted_files(repo_path).await.unwrap_or_default();
    Ok(Some(CherryPickInProgress {
        current_step: state.current_index,
        total_steps: state.shas.len(),
        conflicted_files: conflicted,
    }))
}
