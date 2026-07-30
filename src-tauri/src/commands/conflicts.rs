use super::repo_path;
use crate::error::{AppError, AppResult};
use crate::git;
use crate::git::conflict::ConflictFile;
use crate::state::AppState;
use tauri::State;

#[tauri::command]
pub async fn get_conflict_sections(state: State<'_, AppState>, repo_id: String, path: String) -> AppResult<ConflictFile> {
    let repo = repo_path(&state, &repo_id).await?;
    git::conflict::get_conflict_sections(&repo, &path).await.map_err(AppError::Git)
}

#[tauri::command]
pub async fn write_resolved_file(
    state: State<'_, AppState>,
    repo_id: String,
    path: String,
    content: String,
) -> AppResult<()> {
    let repo = repo_path(&state, &repo_id).await?;
    git::conflict::write_resolved_file(&repo, &path, &content).await.map_err(AppError::Git)
}

#[tauri::command]
pub async fn keep_ours(state: State<'_, AppState>, repo_id: String, path: String) -> AppResult<()> {
    let repo = repo_path(&state, &repo_id).await?;
    git::conflict::keep_ours(&repo, &path).await.map_err(AppError::Git)
}

#[tauri::command]
pub async fn keep_theirs(state: State<'_, AppState>, repo_id: String, path: String) -> AppResult<()> {
    let repo = repo_path(&state, &repo_id).await?;
    git::conflict::keep_theirs(&repo, &path).await.map_err(AppError::Git)
}
