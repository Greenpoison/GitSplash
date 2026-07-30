use super::repo_path;
use crate::error::{AppError, AppResult};
use crate::git;
use crate::git::cherry_pick::{CherryPickInProgress, CherryPickStepResult};
use crate::git::log::CommitNode;
use crate::state::AppState;
use tauri::State;

#[tauri::command]
pub async fn get_cherry_pick_candidates(
    state: State<'_, AppState>,
    repo_id: String,
    source_branch: String,
) -> AppResult<Vec<CommitNode>> {
    let path = repo_path(&state, &repo_id).await?;
    git::log::get_range_commits(&path, &format!("{source_branch} --not HEAD"))
        .await
        .map_err(AppError::Git)
}

#[tauri::command]
pub async fn get_in_progress_cherry_pick(
    state: State<'_, AppState>,
    repo_id: String,
) -> AppResult<Option<CherryPickInProgress>> {
    let path = repo_path(&state, &repo_id).await?;
    git::cherry_pick::get_in_progress_cherry_pick(&path).await.map_err(AppError::Git)
}

#[tauri::command]
pub async fn start_cherry_pick(
    state: State<'_, AppState>,
    repo_id: String,
    shas: Vec<String>,
) -> AppResult<CherryPickStepResult> {
    let path = repo_path(&state, &repo_id).await?;
    git::cherry_pick::start_cherry_pick(&path, shas).await.map_err(AppError::Git)
}

#[tauri::command]
pub async fn continue_cherry_pick(state: State<'_, AppState>, repo_id: String) -> AppResult<CherryPickStepResult> {
    let path = repo_path(&state, &repo_id).await?;
    git::cherry_pick::continue_cherry_pick(&path).await.map_err(AppError::Git)
}

#[tauri::command]
pub async fn abort_cherry_pick(state: State<'_, AppState>, repo_id: String) -> AppResult<()> {
    let path = repo_path(&state, &repo_id).await?;
    git::cherry_pick::abort_cherry_pick(&path).await.map_err(AppError::Git)
}
