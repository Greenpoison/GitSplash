use super::repo_path;
use crate::error::{AppError, AppResult};
use crate::git;
use crate::git::submodule::SubmoduleInfo;
use crate::state::AppState;
use tauri::State;

#[tauri::command]
pub async fn list_submodules(state: State<'_, AppState>, repo_id: String) -> AppResult<Vec<SubmoduleInfo>> {
    let path = repo_path(&state, &repo_id).await?;
    git::submodule::list_submodules(&path).await.map_err(AppError::Git)
}

#[tauri::command]
pub async fn update_submodules(
    state: State<'_, AppState>,
    repo_id: String,
    paths: Vec<String>,
) -> AppResult<()> {
    let path = repo_path(&state, &repo_id).await?;
    git::submodule::update_submodules(&path, &paths).await.map_err(AppError::Git)
}
