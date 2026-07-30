use super::repo_path;
use crate::error::{AppError, AppResult};
use crate::git;
use crate::git::worktree::WorktreeInfo;
use crate::state::AppState;
use tauri::State;

#[tauri::command]
pub async fn list_worktrees(state: State<'_, AppState>, repo_id: String) -> AppResult<Vec<WorktreeInfo>> {
    let path = repo_path(&state, &repo_id).await?;
    git::worktree::list_worktrees(&path).await.map_err(AppError::Git)
}

#[tauri::command]
pub async fn add_worktree(
    state: State<'_, AppState>,
    repo_id: String,
    target_path: String,
    branch: String,
    create_branch: bool,
) -> AppResult<()> {
    let path = repo_path(&state, &repo_id).await?;
    git::worktree::add_worktree(&path, &target_path, &branch, create_branch)
        .await
        .map_err(AppError::Git)
}

#[tauri::command]
pub async fn remove_worktree(
    state: State<'_, AppState>,
    repo_id: String,
    target_path: String,
    force: bool,
) -> AppResult<()> {
    let path = repo_path(&state, &repo_id).await?;
    git::worktree::remove_worktree(&path, &target_path, force).await.map_err(AppError::Git)
}

#[tauri::command]
pub async fn prune_worktrees(state: State<'_, AppState>, repo_id: String) -> AppResult<()> {
    let path = repo_path(&state, &repo_id).await?;
    git::worktree::prune_worktrees(&path).await.map_err(AppError::Git)
}
