use super::repo_path;
use crate::error::{AppError, AppResult};
use crate::git;
use crate::git::stash::StashEntry;
use crate::state::AppState;
use tauri::State;

#[tauri::command]
pub async fn stash_push(
    state: State<'_, AppState>,
    repo_id: String,
    message: Option<String>,
    include_untracked: bool,
) -> AppResult<()> {
    let path = repo_path(&state, &repo_id).await?;
    git::stash::stash_push(&path, message.as_deref(), include_untracked)
        .await
        .map_err(AppError::Git)
}

#[tauri::command]
pub async fn list_stashes(state: State<'_, AppState>, repo_id: String) -> AppResult<Vec<StashEntry>> {
    let path = repo_path(&state, &repo_id).await?;
    git::stash::list_stashes(&path).await.map_err(AppError::Git)
}

#[tauri::command]
pub async fn stash_pop(state: State<'_, AppState>, repo_id: String, index: u32) -> AppResult<()> {
    let path = repo_path(&state, &repo_id).await?;
    git::stash::stash_pop(&path, index).await.map_err(AppError::Git)
}

#[tauri::command]
pub async fn stash_apply(state: State<'_, AppState>, repo_id: String, index: u32) -> AppResult<()> {
    let path = repo_path(&state, &repo_id).await?;
    git::stash::stash_apply(&path, index).await.map_err(AppError::Git)
}

#[tauri::command]
pub async fn stash_drop(state: State<'_, AppState>, repo_id: String, index: u32) -> AppResult<()> {
    let path = repo_path(&state, &repo_id).await?;
    git::stash::stash_drop(&path, index).await.map_err(AppError::Git)
}
