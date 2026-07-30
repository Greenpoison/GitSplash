use crate::db;
use crate::error::AppResult;
use crate::models::Group;
use crate::state::AppState;
use crate::util::{new_id, now_iso};
use tauri::State;

#[tauri::command]
pub fn list_groups(state: State<'_, AppState>) -> AppResult<Vec<Group>> {
    let conn = state.db.lock().unwrap();
    Ok(db::list_groups(&conn)?)
}

#[tauri::command]
pub fn create_group(state: State<'_, AppState>, name: String) -> AppResult<Group> {
    let conn = state.db.lock().unwrap();
    let group = Group {
        id: new_id(),
        name,
        created_at: now_iso(),
    };
    db::insert_group(&conn, &group)?;
    Ok(group)
}

#[tauri::command]
pub fn rename_group(state: State<'_, AppState>, id: String, name: String) -> AppResult<()> {
    let conn = state.db.lock().unwrap();
    db::rename_group(&conn, &id, &name)?;
    Ok(())
}

#[tauri::command]
pub fn delete_group(state: State<'_, AppState>, id: String) -> AppResult<()> {
    let conn = state.db.lock().unwrap();
    db::delete_group(&conn, &id)?;
    Ok(())
}

#[tauri::command]
pub fn set_repo_groups(
    state: State<'_, AppState>,
    repo_id: String,
    group_ids: Vec<String>,
) -> AppResult<()> {
    let conn = state.db.lock().unwrap();
    db::set_repo_groups(&conn, &repo_id, &group_ids)?;
    Ok(())
}
