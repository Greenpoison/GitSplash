use crate::db;
use crate::error::{AppError, AppResult};
use crate::secrets::export::export_secrets_zip;
use crate::secrets::scan::{scan_repo_for_secrets, SecretFile};
use crate::state::AppState;
use std::path::PathBuf;
use tauri::State;

#[tauri::command]
pub fn scan_repo_secrets(state: State<'_, AppState>, repo_id: String) -> AppResult<Vec<SecretFile>> {
    let path = {
        let conn = state.db.lock().unwrap();
        db::get_repo(&conn, &repo_id)?
            .ok_or_else(|| AppError::NotFound(format!("repo {repo_id} not found")))?
            .path
    };
    Ok(scan_repo_for_secrets(&PathBuf::from(path)))
}

#[tauri::command]
pub fn export_secrets_bundle(
    state: State<'_, AppState>,
    repo_id: String,
    files: Vec<String>,
    dest_zip_path: String,
    password: Option<String>,
) -> AppResult<()> {
    let repo_root = {
        let conn = state.db.lock().unwrap();
        db::get_repo(&conn, &repo_id)?
            .ok_or_else(|| AppError::NotFound(format!("repo {repo_id} not found")))?
            .path
    };
    export_secrets_zip(
        &files,
        &PathBuf::from(repo_root),
        &PathBuf::from(dest_zip_path),
        password.as_deref().filter(|p| !p.is_empty()),
    )
    .map_err(AppError::InvalidInput)
}
