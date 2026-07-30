use crate::db;
use crate::error::{AppError, AppResult};
use crate::state::AppState;
use tauri::State;

/// Opens a repo in the user's configured git GUI (if set in Settings) or
/// falls back to revealing the folder in File Explorer.
#[tauri::command]
pub fn open_repo_external(state: State<'_, AppState>, repo_id: String) -> AppResult<()> {
    let conn = state.db.lock().unwrap();
    let repo = db::get_repo(&conn, &repo_id)?
        .ok_or_else(|| AppError::NotFound(format!("repo {repo_id} not found")))?;
    let settings = db::get_settings(&conn)?;
    drop(conn);

    match settings.git_gui_path {
        Some(gui_path) if !gui_path.trim().is_empty() => {
            std::process::Command::new(gui_path)
                .arg(&repo.path)
                .spawn()
                .map_err(|e| AppError::Io(e))?;
        }
        _ => {
            std::process::Command::new("explorer")
                .arg(&repo.path)
                .spawn()
                .map_err(|e| AppError::Io(e))?;
        }
    }
    Ok(())
}
