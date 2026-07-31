use super::repo_path;
use crate::error::{AppError, AppResult};
use crate::git;
use crate::git::compare::CompareFile;
use crate::git::diff::FileDiff;
use crate::state::AppState;
use tauri::State;

#[tauri::command]
pub async fn compare_branches(
    state: State<'_, AppState>,
    repo_id: String,
    base: String,
    branch: String,
) -> AppResult<Vec<CompareFile>> {
    let path = repo_path(&state, &repo_id).await?;
    git::compare::compare_branches(&path, &base, &branch).await.map_err(AppError::Git)
}

#[tauri::command]
pub async fn get_compare_file_diff(
    state: State<'_, AppState>,
    repo_id: String,
    base: String,
    branch: String,
    path: String,
) -> AppResult<FileDiff> {
    let repo_dir = repo_path(&state, &repo_id).await?;
    git::compare::get_compare_file_diff(&repo_dir, &base, &branch, &path)
        .await
        .map_err(AppError::Git)
}

#[tauri::command]
pub async fn list_branch_files(state: State<'_, AppState>, repo_id: String, branch: String) -> AppResult<Vec<String>> {
    let path = repo_path(&state, &repo_id).await?;
    git::compare::list_branch_files(&path, &branch).await.map_err(AppError::Git)
}

#[tauri::command]
pub async fn read_branch_file(
    state: State<'_, AppState>,
    repo_id: String,
    branch: String,
    path: String,
) -> AppResult<Option<String>> {
    let repo_dir = repo_path(&state, &repo_id).await?;
    git::compare::read_branch_file(&repo_dir, &branch, &path).await.map_err(AppError::Git)
}
