use super::repo_path;
use crate::error::{AppError, AppResult};
use crate::git;
use crate::git::doctor::HealthIssue;
use crate::state::AppState;
use tauri::State;

#[tauri::command]
pub async fn run_health_check(state: State<'_, AppState>, repo_id: String) -> AppResult<Vec<HealthIssue>> {
    let path = repo_path(&state, &repo_id).await?;
    git::doctor::run_health_check(&repo_id, &path).await.map_err(AppError::Git)
}
