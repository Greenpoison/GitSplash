use super::repo_path;
use crate::error::{AppError, AppResult};
use crate::git;
use crate::git::changes::FileChange;
use crate::git::diff::FileDiff;
use crate::state::AppState;
use tauri::State;

#[tauri::command]
pub async fn get_file_changes(state: State<'_, AppState>, repo_id: String) -> AppResult<Vec<FileChange>> {
    let path = repo_path(&state, &repo_id).await?;
    git::changes::get_file_changes(&path).await.map_err(AppError::Git)
}

#[tauri::command]
pub async fn get_file_diff(
    state: State<'_, AppState>,
    repo_id: String,
    path: String,
    staged: bool,
    is_untracked: bool,
) -> AppResult<FileDiff> {
    let repo = repo_path(&state, &repo_id).await?;
    if is_untracked {
        return git::diff::get_untracked_file_diff(&repo, &path).await.map_err(AppError::Git);
    }
    let (_, diff) = git::diff::get_file_diff(&repo, &path, staged).await.map_err(AppError::Git)?;
    Ok(diff)
}

#[tauri::command]
pub async fn stage_file(state: State<'_, AppState>, repo_id: String, path: String) -> AppResult<()> {
    let repo = repo_path(&state, &repo_id).await?;
    git::commit::stage_file(&repo, &path).await.map_err(AppError::Git)
}

#[tauri::command]
pub async fn unstage_file(state: State<'_, AppState>, repo_id: String, path: String) -> AppResult<()> {
    let repo = repo_path(&state, &repo_id).await?;
    git::commit::unstage_file(&repo, &path).await.map_err(AppError::Git)
}

#[tauri::command]
pub async fn discard_file(
    state: State<'_, AppState>,
    repo_id: String,
    path: String,
    is_untracked: bool,
) -> AppResult<()> {
    let repo = repo_path(&state, &repo_id).await?;
    git::commit::discard_file(&repo, &path, is_untracked).await.map_err(AppError::Git)
}

#[tauri::command]
pub async fn stage_all(state: State<'_, AppState>, repo_id: String) -> AppResult<()> {
    let repo = repo_path(&state, &repo_id).await?;
    git::commit::stage_all(&repo).await.map_err(AppError::Git)
}

#[tauri::command]
pub async fn unstage_all(state: State<'_, AppState>, repo_id: String) -> AppResult<()> {
    let repo = repo_path(&state, &repo_id).await?;
    git::commit::unstage_all(&repo).await.map_err(AppError::Git)
}

#[tauri::command]
pub async fn stage_hunk(state: State<'_, AppState>, repo_id: String, path: String, hunk_raw: String) -> AppResult<()> {
    let repo = repo_path(&state, &repo_id).await?;
    git::diff::stage_hunk(&repo, &path, &hunk_raw).await.map_err(AppError::Git)
}

#[tauri::command]
pub async fn unstage_hunk(state: State<'_, AppState>, repo_id: String, path: String, hunk_raw: String) -> AppResult<()> {
    let repo = repo_path(&state, &repo_id).await?;
    git::diff::unstage_hunk(&repo, &path, &hunk_raw).await.map_err(AppError::Git)
}

#[tauri::command]
pub async fn discard_hunk(state: State<'_, AppState>, repo_id: String, path: String, hunk_raw: String) -> AppResult<()> {
    let repo = repo_path(&state, &repo_id).await?;
    git::diff::discard_hunk(&repo, &path, &hunk_raw).await.map_err(AppError::Git)
}

#[tauri::command]
pub async fn commit_changes(
    state: State<'_, AppState>,
    repo_id: String,
    message: String,
) -> AppResult<Option<String>> {
    let repo = repo_path(&state, &repo_id).await?;
    git::commit::commit(&repo, &message).await.map_err(AppError::Git)
}
