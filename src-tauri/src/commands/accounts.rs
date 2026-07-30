use crate::db;
use crate::error::{AppError, AppResult};
use crate::git;
use crate::models::{Account, Repo};
use crate::ssh;
use crate::state::AppState;
use crate::util::{new_id, now_iso, slugify};
use std::path::PathBuf;
use tauri::State;

#[tauri::command]
pub fn list_accounts(state: State<'_, AppState>) -> AppResult<Vec<Account>> {
    let conn = state.db.lock().unwrap();
    Ok(db::list_accounts(&conn)?)
}

#[tauri::command]
pub async fn create_account(
    state: State<'_, AppState>,
    name: String,
    host_alias: String,
    github_username: Option<String>,
    hostname: Option<String>,
) -> AppResult<Account> {
    let hostname = hostname.unwrap_or_else(|| "github.com".to_string());
    let ssh_dir = ssh::config::ssh_dir().map_err(AppError::Ssh)?;
    let key_path = ssh_dir.join(format!("id_ed25519_{}", slugify(&host_alias)));

    ssh::keygen::generate_ed25519_key(&key_path, &format!("gitsplash-auth-{host_alias}"))
        .await
        .map_err(AppError::Ssh)?;
    ssh::config::upsert_host_block(&host_alias, &hostname, &key_path).map_err(AppError::Ssh)?;

    let account = Account {
        id: new_id(),
        name,
        host_alias,
        github_username,
        ssh_key_path: key_path.to_string_lossy().to_string(),
        signing_key_path: None,
        created_at: now_iso(),
    };

    let conn = state.db.lock().unwrap();
    db::insert_account(&conn, &account)?;
    Ok(account)
}

#[tauri::command]
pub async fn generate_signing_key(state: State<'_, AppState>, account_id: String) -> AppResult<Account> {
    let mut account = {
        let conn = state.db.lock().unwrap();
        db::get_account(&conn, &account_id)?
            .ok_or_else(|| AppError::NotFound(format!("account {account_id} not found")))?
    };

    let ssh_dir = ssh::config::ssh_dir().map_err(AppError::Ssh)?;
    let key_path = ssh_dir.join(format!("id_ed25519_{}_signing", slugify(&account.host_alias)));
    ssh::keygen::generate_ed25519_key(&key_path, &format!("gitsplash-signing-{}", account.host_alias))
        .await
        .map_err(AppError::Ssh)?;

    account.signing_key_path = Some(key_path.to_string_lossy().to_string());
    let conn = state.db.lock().unwrap();
    db::update_account(&conn, &account)?;
    Ok(account)
}

#[tauri::command]
pub fn get_public_key(state: State<'_, AppState>, account_id: String, key_kind: String) -> AppResult<String> {
    let conn = state.db.lock().unwrap();
    let account = db::get_account(&conn, &account_id)?
        .ok_or_else(|| AppError::NotFound(format!("account {account_id} not found")))?;
    let path = match key_kind.as_str() {
        "signing" => account
            .signing_key_path
            .ok_or_else(|| AppError::InvalidInput("no signing key generated for this account yet".to_string()))?,
        _ => account.ssh_key_path,
    };
    ssh::keygen::read_public_key(&PathBuf::from(path)).map_err(AppError::Ssh)
}

#[tauri::command]
pub fn delete_account(state: State<'_, AppState>, id: String) -> AppResult<()> {
    let conn = state.db.lock().unwrap();
    if let Some(account) = db::get_account(&conn, &id)? {
        // Best-effort: leaves key files on disk untouched (deleting SSH
        // keypairs is destructive and out of scope for an account removal).
        ssh::config::remove_host_block(&account.host_alias).ok();
    }
    db::delete_account(&conn, &id)?;
    Ok(())
}

#[tauri::command]
pub async fn assign_repo_account(
    state: State<'_, AppState>,
    repo_id: String,
    account_id: Option<String>,
) -> AppResult<Repo> {
    let (repo_path, account) = {
        let conn = state.db.lock().unwrap();
        let mut repo = db::get_repo(&conn, &repo_id)?
            .ok_or_else(|| AppError::NotFound(format!("repo {repo_id} not found")))?;
        repo.account_id = account_id.clone();
        db::update_repo(&conn, &repo)?;
        let account = match &account_id {
            Some(id) => Some(
                db::get_account(&conn, id)?
                    .ok_or_else(|| AppError::NotFound(format!("account {id} not found")))?,
            ),
            None => None,
        };
        (repo.path, account)
    };

    let repo_path_buf = PathBuf::from(&repo_path);

    match &account {
        Some(account) => {
            if let Some(current_url) = git::remote::get_remote_url(&repo_path_buf, "origin").await {
                if let Some(github_path) = git::remote::extract_github_path(&current_url) {
                    let new_url = git::remote::build_aliased_url(&account.host_alias, &github_path);
                    git::remote::set_remote_url(&repo_path_buf, "origin", &new_url)
                        .await
                        .map_err(AppError::Git)?;
                }
            }
            if let Some(signing_key) = &account.signing_key_path {
                git::config::set_signing_config(&repo_path_buf, signing_key)
                    .await
                    .map_err(AppError::Git)?;
            }
        }
        None => {
            git::config::clear_signing_config(&repo_path_buf).await.ok();
        }
    }

    let conn = state.db.lock().unwrap();
    Ok(db::get_repo(&conn, &repo_id)?
        .ok_or_else(|| AppError::NotFound(format!("repo {repo_id} not found")))?)
}
