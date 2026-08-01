use crate::db;
use crate::error::{AppError, AppResult};
use crate::git;
use crate::models::{Repo, RepoGitStatus};
use crate::state::AppState;
use crate::util::{new_id, now_iso};
use std::path::Path;
use tauri::State;

#[tauri::command]
pub fn list_repos(state: State<'_, AppState>) -> AppResult<Vec<Repo>> {
    let conn = state.db.lock().unwrap();
    Ok(db::list_repos(&conn)?)
}

#[tauri::command]
pub fn add_repo(
    state: State<'_, AppState>,
    path: String,
    display_name: Option<String>,
) -> AppResult<Repo> {
    let repo_path = Path::new(&path);
    if !repo_path.join(".git").exists() {
        return Err(AppError::InvalidInput(format!(
            "{path} does not look like a git repository (no .git found)"
        )));
    }
    let canonical = repo_path
        .canonicalize()
        .map(|p| p.to_string_lossy().to_string())
        .unwrap_or(path.clone());

    let conn = state.db.lock().unwrap();
    if db::path_in_use(&conn, &canonical)? {
        return Err(AppError::InvalidInput(
            "this repo is already tracked".to_string(),
        ));
    }

    let name = display_name.unwrap_or_else(|| {
        Path::new(&canonical)
            .file_name()
            .map(|n| n.to_string_lossy().to_string())
            .unwrap_or_else(|| canonical.clone())
    });

    let repo = Repo {
        id: new_id(),
        path: canonical,
        display_name: name,
        account_id: None,
        last_fetched_at: None,
        created_at: now_iso(),
        group_ids: Vec::new(),
    };
    db::insert_repo(&conn, &repo)?;
    Ok(repo)
}

/// Clones `url` into `parent_dir/folder_name`, then registers it exactly
/// like `add_repo` does (same dedupe check, same display_name defaulting).
/// If `account_id` is given, best-effort assigns it afterward by reusing
/// `assign_repo_account` — that already handles rewriting the remote URL to
/// the account's SSH host alias, so a failed assignment doesn't lose the
/// otherwise-successful clone; the repo is just left unassigned for the
/// user to assign by hand via the existing per-repo dropdown.
#[tauri::command]
pub async fn clone_repo(
    state: State<'_, AppState>,
    url: String,
    parent_dir: String,
    folder_name: String,
    display_name: Option<String>,
    account_id: Option<String>,
) -> AppResult<Repo> {
    let dest = Path::new(&parent_dir).join(&folder_name);
    git::clone::clone_repo(&url, &dest).await.map_err(AppError::Git)?;

    let canonical = dest
        .canonicalize()
        .map(|p| p.to_string_lossy().to_string())
        .unwrap_or_else(|_| dest.to_string_lossy().to_string());

    {
        let conn = state.db.lock().unwrap();
        if db::path_in_use(&conn, &canonical)? {
            return Err(AppError::InvalidInput("this repo is already tracked".to_string()));
        }
    }

    let name = display_name.unwrap_or_else(|| folder_name.clone());
    let repo = Repo {
        id: new_id(),
        path: canonical,
        display_name: name,
        account_id: None,
        last_fetched_at: None,
        created_at: now_iso(),
        group_ids: Vec::new(),
    };

    {
        let conn = state.db.lock().unwrap();
        db::insert_repo(&conn, &repo)?;
    }

    if let Some(acc_id) = account_id {
        if let Ok(updated) = crate::commands::accounts::assign_repo_account(state, repo.id.clone(), Some(acc_id)).await {
            return Ok(updated);
        }
    }

    Ok(repo)
}

#[tauri::command]
pub async fn init_repo(
    state: State<'_, AppState>,
    parent_dir: String,
    folder_name: String,
    display_name: Option<String>,
    initial_branch: String,
) -> AppResult<Repo> {
    let dest = Path::new(&parent_dir).join(&folder_name);
    git::init::init_repo(&dest, &initial_branch).await.map_err(AppError::Git)?;

    let canonical = dest
        .canonicalize()
        .map(|p| p.to_string_lossy().to_string())
        .unwrap_or_else(|_| dest.to_string_lossy().to_string());

    {
        let conn = state.db.lock().unwrap();
        if db::path_in_use(&conn, &canonical)? {
            return Err(AppError::InvalidInput("this repo is already tracked".to_string()));
        }
    }

    let name = display_name.unwrap_or_else(|| folder_name.clone());
    let repo = Repo {
        id: new_id(),
        path: canonical,
        display_name: name,
        account_id: None,
        last_fetched_at: None,
        created_at: now_iso(),
        group_ids: Vec::new(),
    };

    let conn = state.db.lock().unwrap();
    db::insert_repo(&conn, &repo)?;
    Ok(repo)
}

#[tauri::command]
pub fn remove_repo(state: State<'_, AppState>, id: String) -> AppResult<()> {
    let conn = state.db.lock().unwrap();
    db::delete_repo(&conn, &id)?;
    Ok(())
}

#[tauri::command]
pub fn rename_repo(state: State<'_, AppState>, id: String, display_name: String) -> AppResult<Repo> {
    let conn = state.db.lock().unwrap();
    let mut repo = db::get_repo(&conn, &id)?
        .ok_or_else(|| AppError::NotFound(format!("repo {id} not found")))?;
    repo.display_name = display_name;
    db::update_repo(&conn, &repo)?;
    Ok(repo)
}

#[tauri::command]
pub async fn get_repo_status(state: State<'_, AppState>, id: String) -> AppResult<RepoGitStatus> {
    let path = {
        let conn = state.db.lock().unwrap();
        let repo = db::get_repo(&conn, &id)?.ok_or_else(|| AppError::NotFound(format!("repo {id} not found")))?;
        repo.path
    };
    Ok(git::status::get_status(&id, Path::new(&path)).await)
}

#[tauri::command]
pub async fn get_repo_statuses(
    state: State<'_, AppState>,
    ids: Vec<String>,
) -> AppResult<Vec<RepoGitStatus>> {
    let paths: Vec<(String, String)> = {
        let conn = state.db.lock().unwrap();
        ids.into_iter()
            .filter_map(|id| db::get_repo(&conn, &id).ok().flatten().map(|r| (id, r.path)))
            .collect()
    };
    let futures = paths
        .into_iter()
        .map(|(id, path)| async move { git::status::get_status(&id, Path::new(&path)).await });
    Ok(futures::future::join_all(futures).await)
}
