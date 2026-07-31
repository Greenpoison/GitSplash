use super::repo_path;
use crate::error::{AppError, AppResult};
use crate::git;
use crate::git::compare::CompareFile;
use crate::git::diff::FileDiff;
use crate::state::AppState;
use tauri::State;

#[tauri::command]
pub async fn get_commit_files(state: State<'_, AppState>, repo_id: String, hash: String) -> AppResult<Vec<CompareFile>> {
    let path = repo_path(&state, &repo_id).await?;
    git::commit_detail::get_commit_files(&path, &hash).await.map_err(AppError::Git)
}

#[tauri::command]
pub async fn get_commit_file_diff(
    state: State<'_, AppState>,
    repo_id: String,
    hash: String,
    path: String,
) -> AppResult<FileDiff> {
    let repo_dir = repo_path(&state, &repo_id).await?;
    git::commit_detail::get_commit_file_diff(&repo_dir, &hash, &path)
        .await
        .map_err(AppError::Git)
}
