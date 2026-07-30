pub mod accounts;
pub mod branches;
pub mod changes;
pub mod conflicts;
pub mod git_ops;
pub mod groups;
pub mod history;
pub mod open;
pub mod pr;
pub mod repos;
pub mod secrets;
pub mod settings;
pub mod undo;

use crate::db;
use crate::error::{AppError, AppResult};
use crate::state::AppState;
use std::path::PathBuf;
use tauri::State;

pub async fn repo_path(state: &State<'_, AppState>, repo_id: &str) -> AppResult<PathBuf> {
    let path = {
        let conn = state.db.lock().unwrap();
        db::get_repo(&conn, repo_id)?
            .ok_or_else(|| AppError::NotFound(format!("repo {repo_id} not found")))?
            .path
    };
    Ok(PathBuf::from(path))
}
