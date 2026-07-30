use crate::db;
use crate::error::{AppError, AppResult};
use crate::gh;
use crate::gh::PullRequestSummary;
use crate::state::AppState;
use std::path::PathBuf;
use tauri::State;

async fn repo_context(state: &State<'_, AppState>, repo_id: &str) -> AppResult<(PathBuf, Option<String>)> {
    let conn = state.db.lock().unwrap();
    let repo = db::get_repo(&conn, repo_id)?
        .ok_or_else(|| AppError::NotFound(format!("repo {repo_id} not found")))?;
    let github_username = match &repo.account_id {
        Some(account_id) => db::get_account(&conn, account_id)?.and_then(|a| a.github_username),
        None => None,
    };
    Ok((PathBuf::from(repo.path), github_username))
}

#[tauri::command]
pub async fn is_gh_available() -> bool {
    gh::is_gh_installed().await
}

#[tauri::command]
pub async fn is_account_gh_authenticated(state: State<'_, AppState>, account_id: String) -> AppResult<bool> {
    let username = {
        let conn = state.db.lock().unwrap();
        db::get_account(&conn, &account_id)?
            .ok_or_else(|| AppError::NotFound(format!("account {account_id} not found")))?
            .github_username
    };
    match username {
        Some(username) => Ok(gh::is_user_authenticated(&username).await),
        None => Ok(false),
    }
}

#[tauri::command]
pub async fn list_pull_requests(
    state: State<'_, AppState>,
    repo_id: String,
) -> AppResult<Vec<PullRequestSummary>> {
    let (path, username) = repo_context(&state, &repo_id).await?;
    gh::list_pull_requests(&path, username.as_deref())
        .await
        .map_err(AppError::Git)
}

#[tauri::command]
pub async fn create_pull_request(
    state: State<'_, AppState>,
    repo_id: String,
    title: String,
    body: String,
    base: String,
    draft: bool,
) -> AppResult<String> {
    let (path, username) = repo_context(&state, &repo_id).await?;
    gh::create_pull_request(&path, username.as_deref(), &title, &body, &base, draft)
        .await
        .map_err(AppError::Git)
}

#[tauri::command]
pub async fn merge_pull_request(
    state: State<'_, AppState>,
    repo_id: String,
    number: u32,
    method: String,
) -> AppResult<String> {
    let (path, username) = repo_context(&state, &repo_id).await?;
    gh::merge_pull_request(&path, username.as_deref(), number, &method)
        .await
        .map_err(AppError::Git)
}
