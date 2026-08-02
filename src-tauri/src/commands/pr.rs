use crate::db;
use crate::error::{AppError, AppResult};
use crate::gh;
use crate::gh::{PullRequestDetail, PullRequestSummary};
use crate::git::pr_template::{find_pull_request_templates, PrTemplate};
use crate::state::AppState;
use std::path::PathBuf;
use tauri::State;

struct RepoContext {
    path: PathBuf,
    hostname: String,
    github_username: Option<String>,
}

async fn repo_context(state: &State<'_, AppState>, repo_id: &str) -> AppResult<RepoContext> {
    let conn = state.db.lock().unwrap();
    let repo = db::get_repo(&conn, repo_id)?
        .ok_or_else(|| AppError::NotFound(format!("repo {repo_id} not found")))?;
    let account = match &repo.account_id {
        Some(account_id) => db::get_account(&conn, account_id)?,
        None => None,
    };
    Ok(RepoContext {
        path: PathBuf::from(repo.path),
        hostname: account.as_ref().map(|a| a.hostname.clone()).unwrap_or_else(|| "github.com".to_string()),
        github_username: account.and_then(|a| a.github_username),
    })
}

#[tauri::command]
pub async fn is_gh_available() -> bool {
    gh::is_gh_installed().await
}

#[tauri::command]
pub async fn is_account_gh_authenticated(state: State<'_, AppState>, account_id: String) -> AppResult<bool> {
    let account = {
        let conn = state.db.lock().unwrap();
        db::get_account(&conn, &account_id)?
            .ok_or_else(|| AppError::NotFound(format!("account {account_id} not found")))?
    };
    match account.github_username {
        Some(username) => Ok(gh::is_user_authenticated(&account.hostname, &username).await),
        None => Ok(false),
    }
}

#[tauri::command]
pub async fn list_pull_requests(
    state: State<'_, AppState>,
    repo_id: String,
) -> AppResult<Vec<PullRequestSummary>> {
    let ctx = repo_context(&state, &repo_id).await?;
    gh::list_pull_requests(&ctx.path, &ctx.hostname, ctx.github_username.as_deref())
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
    let ctx = repo_context(&state, &repo_id).await?;
    gh::create_pull_request(&ctx.path, &ctx.hostname, ctx.github_username.as_deref(), &title, &body, &base, draft)
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
    let ctx = repo_context(&state, &repo_id).await?;
    gh::merge_pull_request(&ctx.path, &ctx.hostname, ctx.github_username.as_deref(), number, &method)
        .await
        .map_err(AppError::Git)
}

#[tauri::command]
pub async fn get_pull_request_templates(
    state: State<'_, AppState>,
    repo_id: String,
) -> AppResult<Vec<PrTemplate>> {
    let ctx = repo_context(&state, &repo_id).await?;
    Ok(find_pull_request_templates(&ctx.path).await)
}

#[tauri::command]
pub async fn get_pull_request_detail(
    state: State<'_, AppState>,
    repo_id: String,
    number: u32,
) -> AppResult<PullRequestDetail> {
    let ctx = repo_context(&state, &repo_id).await?;
    gh::get_pull_request_detail(&ctx.path, &ctx.hostname, ctx.github_username.as_deref(), number)
        .await
        .map_err(AppError::Git)
}
