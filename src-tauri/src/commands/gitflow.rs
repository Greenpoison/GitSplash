use super::repo_path;
use crate::error::{AppError, AppResult};
use crate::git;
use crate::git::gitflow::{GitflowFinishResult, GitflowKind};
use crate::state::AppState;
use tauri::State;

#[tauri::command]
pub async fn start_gitflow_branch(
    state: State<'_, AppState>,
    repo_id: String,
    kind: GitflowKind,
    name: String,
    base_branch: String,
) -> AppResult<()> {
    let path = repo_path(&state, &repo_id).await?;
    git::gitflow::start_gitflow_branch(&path, kind, &name, &base_branch)
        .await
        .map_err(AppError::Git)
}

#[tauri::command]
pub async fn finish_gitflow_branch(
    state: State<'_, AppState>,
    repo_id: String,
    kind: GitflowKind,
    name: String,
    targets: Vec<String>,
    tag: Option<String>,
    delete_branch: bool,
) -> AppResult<GitflowFinishResult> {
    let path = repo_path(&state, &repo_id).await?;
    git::gitflow::finish_gitflow_branch(&path, kind, &name, &targets, tag.as_deref(), delete_branch)
        .await
        .map_err(AppError::Git)
}
