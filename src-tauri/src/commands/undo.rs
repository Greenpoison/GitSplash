use super::repo_path;
use crate::error::{AppError, AppResult};
use crate::git;
use crate::state::AppState;
use tauri::State;

/// The generic primitive undo/redo is built on: move HEAD to an exact sha
/// captured at the time of the original action, rather than reflog
/// shorthand like HEAD@{1} — that stays correct even if something else
/// happened in between.
#[tauri::command]
pub async fn reset_to(state: State<'_, AppState>, repo_id: String, sha: String, mode: String) -> AppResult<()> {
    let repo = repo_path(&state, &repo_id).await?;
    git::refs::reset_to(&repo, &sha, &mode).await.map_err(AppError::Git)
}

#[tauri::command]
pub async fn discard_and_reset_to(state: State<'_, AppState>, repo_id: String, target_ref: String) -> AppResult<()> {
    let repo = repo_path(&state, &repo_id).await?;
    git::refs::discard_and_reset_to(&repo, &target_ref).await.map_err(AppError::Git)
}

#[tauri::command]
pub async fn get_head_sha(state: State<'_, AppState>, repo_id: String) -> AppResult<Option<String>> {
    let repo = repo_path(&state, &repo_id).await?;
    Ok(git::refs::get_head_sha(&repo).await)
}

#[tauri::command]
pub async fn resolve_ref(state: State<'_, AppState>, repo_id: String, rev: String) -> AppResult<String> {
    let repo = repo_path(&state, &repo_id).await?;
    git::refs::resolve_ref(&repo, &rev).await.map_err(AppError::Git)
}
