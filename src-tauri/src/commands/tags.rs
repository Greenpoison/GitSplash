use super::repo_path;
use crate::error::{AppError, AppResult};
use crate::git;
use crate::git::log::CommitNode;
use crate::git::tags::{RemoteTag, TagInfo};
use crate::state::AppState;
use tauri::State;

#[tauri::command]
pub async fn list_tags(state: State<'_, AppState>, repo_id: String) -> AppResult<Vec<TagInfo>> {
    let path = repo_path(&state, &repo_id).await?;
    git::tags::list_tags(&path).await.map_err(AppError::Git)
}

#[tauri::command]
pub async fn list_remote_tags(state: State<'_, AppState>, repo_id: String) -> AppResult<Vec<RemoteTag>> {
    let path = repo_path(&state, &repo_id).await?;
    git::tags::list_remote_tags(&path).await.map_err(AppError::Git)
}

#[tauri::command]
pub async fn create_tag(
    state: State<'_, AppState>,
    repo_id: String,
    name: String,
    target: String,
    message: Option<String>,
    force: bool,
) -> AppResult<()> {
    let path = repo_path(&state, &repo_id).await?;
    git::tags::create_tag(&path, &name, &target, message.as_deref(), force)
        .await
        .map_err(AppError::Git)
}

#[tauri::command]
pub async fn delete_tag(state: State<'_, AppState>, repo_id: String, name: String) -> AppResult<()> {
    let path = repo_path(&state, &repo_id).await?;
    git::tags::delete_tag(&path, &name).await.map_err(AppError::Git)
}

#[tauri::command]
pub async fn push_tag(state: State<'_, AppState>, repo_id: String, name: String, force: bool) -> AppResult<()> {
    let path = repo_path(&state, &repo_id).await?;
    git::tags::push_tag(&path, &name, force).await.map_err(AppError::Git)
}

#[tauri::command]
pub async fn push_all_tags(state: State<'_, AppState>, repo_id: String) -> AppResult<()> {
    let path = repo_path(&state, &repo_id).await?;
    git::tags::push_all_tags(&path).await.map_err(AppError::Git)
}

#[tauri::command]
pub async fn delete_remote_tag(state: State<'_, AppState>, repo_id: String, name: String) -> AppResult<()> {
    let path = repo_path(&state, &repo_id).await?;
    git::tags::delete_remote_tag(&path, &name).await.map_err(AppError::Git)
}

#[tauri::command]
pub async fn fetch_tags(state: State<'_, AppState>, repo_id: String) -> AppResult<()> {
    let path = repo_path(&state, &repo_id).await?;
    git::tags::fetch_tags(&path).await.map_err(AppError::Git)
}

#[tauri::command]
pub async fn get_commit(state: State<'_, AppState>, repo_id: String, rev: String) -> AppResult<Option<CommitNode>> {
    let path = repo_path(&state, &repo_id).await?;
    git::log::get_commit(&path, &rev).await.map_err(AppError::Git)
}
