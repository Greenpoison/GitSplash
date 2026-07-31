use super::repo_path;
use crate::error::{AppError, AppResult};
use crate::git;
use crate::git::branch::MergeResult;
use crate::git::log::{BranchInfo, CommitNode};
use crate::state::AppState;
use tauri::State;

#[tauri::command]
pub async fn list_branches(state: State<'_, AppState>, repo_id: String) -> AppResult<Vec<BranchInfo>> {
    let path = repo_path(&state, &repo_id).await?;
    git::log::list_branches(&path).await.map_err(AppError::Git)
}

#[tauri::command]
pub async fn get_commit_graph(
    state: State<'_, AppState>,
    repo_id: String,
    limit: u32,
) -> AppResult<Vec<CommitNode>> {
    let path = repo_path(&state, &repo_id).await?;
    git::log::get_commit_graph(&path, limit).await.map_err(AppError::Git)
}

#[tauri::command]
pub async fn checkout_branch(state: State<'_, AppState>, repo_id: String, branch: String) -> AppResult<()> {
    let path = repo_path(&state, &repo_id).await?;
    git::branch::checkout_branch(&path, &branch).await.map_err(AppError::Git)
}

#[tauri::command]
pub async fn create_branch(
    state: State<'_, AppState>,
    repo_id: String,
    name: String,
    base: Option<String>,
) -> AppResult<()> {
    let path = repo_path(&state, &repo_id).await?;
    git::branch::create_branch(&path, &name, base.as_deref()).await.map_err(AppError::Git)
}

#[tauri::command]
pub async fn delete_branch(
    state: State<'_, AppState>,
    repo_id: String,
    name: String,
    force: bool,
) -> AppResult<()> {
    let path = repo_path(&state, &repo_id).await?;
    git::branch::delete_branch(&path, &name, force).await.map_err(AppError::Git)
}

#[tauri::command]
pub async fn checkout_previous_branch(state: State<'_, AppState>, repo_id: String) -> AppResult<String> {
    let path = repo_path(&state, &repo_id).await?;
    git::branch::checkout_previous_branch(&path).await.map_err(AppError::Git)
}

#[tauri::command]
pub async fn merge_branch(
    state: State<'_, AppState>,
    repo_id: String,
    from_branch: String,
) -> AppResult<MergeResult> {
    let path = repo_path(&state, &repo_id).await?;
    git::branch::merge_branch(&path, &from_branch).await.map_err(AppError::Git)
}
