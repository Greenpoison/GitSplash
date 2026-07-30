use super::repo_path;
use crate::error::{AppError, AppResult};
use crate::git;
use crate::git::blame::BlameLine;
use crate::git::files::FileTextContent;
use crate::git::log::CommitNode;
use crate::state::AppState;
use tauri::State;

#[tauri::command]
pub async fn list_tracked_files(state: State<'_, AppState>, repo_id: String) -> AppResult<Vec<String>> {
    let path = repo_path(&state, &repo_id).await?;
    git::files::list_tracked_files(&path).await.map_err(AppError::Git)
}

#[tauri::command]
pub async fn read_file_text(state: State<'_, AppState>, repo_id: String, path: String) -> AppResult<FileTextContent> {
    let repo = repo_path(&state, &repo_id).await?;
    git::files::read_file_text(&repo, &path).await.map_err(AppError::Git)
}

#[tauri::command]
pub async fn write_file_text(
    state: State<'_, AppState>,
    repo_id: String,
    path: String,
    content: String,
) -> AppResult<()> {
    let repo = repo_path(&state, &repo_id).await?;
    git::files::write_file_text(&repo, &path, &content).await.map_err(AppError::Git)
}

#[tauri::command]
pub async fn get_file_history(
    state: State<'_, AppState>,
    repo_id: String,
    path: String,
    limit: u32,
) -> AppResult<Vec<CommitNode>> {
    let repo = repo_path(&state, &repo_id).await?;
    git::log::get_file_history(&repo, &path, limit).await.map_err(AppError::Git)
}

#[tauri::command]
pub async fn get_blame(state: State<'_, AppState>, repo_id: String, path: String) -> AppResult<Vec<BlameLine>> {
    let repo = repo_path(&state, &repo_id).await?;
    git::blame::get_blame(&repo, &path).await.map_err(AppError::Git)
}
