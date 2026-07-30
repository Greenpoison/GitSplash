use crate::db;
use crate::error::AppResult;
use crate::models::Settings;
use crate::state::AppState;
use tauri::State;

#[tauri::command]
pub fn get_settings(state: State<'_, AppState>) -> AppResult<Settings> {
    let conn = state.db.lock().unwrap();
    Ok(db::get_settings(&conn)?)
}

#[tauri::command]
pub fn save_settings(state: State<'_, AppState>, settings: Settings) -> AppResult<()> {
    let conn = state.db.lock().unwrap();
    db::save_settings(&conn, &settings)?;
    Ok(())
}
