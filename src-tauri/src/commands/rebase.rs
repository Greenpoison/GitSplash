use super::repo_path;
use crate::error::{AppError, AppResult};
use crate::git;
use crate::git::log::CommitNode;
use crate::git::rebase::{RebaseInProgress, RebasePlanItem, RebaseStepResult};
use crate::state::AppState;
use tauri::State;

#[tauri::command]
pub async fn get_rebase_candidates(
    state: State<'_, AppState>,
    repo_id: String,
    onto: String,
) -> AppResult<Vec<CommitNode>> {
    let path = repo_path(&state, &repo_id).await?;
    git::log::get_range_commits(&path, &format!("{onto}..HEAD"))
        .await
        .map_err(AppError::Git)
}

#[tauri::command]
pub async fn get_in_progress_rebase(
    state: State<'_, AppState>,
    repo_id: String,
) -> AppResult<Option<RebaseInProgress>> {
    let path = repo_path(&state, &repo_id).await?;
    git::rebase::get_in_progress_rebase(&path).await.map_err(AppError::Git)
}

#[tauri::command]
pub async fn start_rebase(
    state: State<'_, AppState>,
    repo_id: String,
    onto: String,
    plan: Vec<RebasePlanItem>,
) -> AppResult<RebaseStepResult> {
    let path = repo_path(&state, &repo_id).await?;
    git::rebase::start_rebase(&path, &onto, plan).await.map_err(AppError::Git)
}

#[tauri::command]
pub async fn continue_rebase(state: State<'_, AppState>, repo_id: String) -> AppResult<RebaseStepResult> {
    let path = repo_path(&state, &repo_id).await?;
    git::rebase::continue_rebase(&path).await.map_err(AppError::Git)
}

#[tauri::command]
pub async fn abort_rebase(state: State<'_, AppState>, repo_id: String) -> AppResult<()> {
    let path = repo_path(&state, &repo_id).await?;
    git::rebase::abort_rebase(&path).await.map_err(AppError::Git)
}
