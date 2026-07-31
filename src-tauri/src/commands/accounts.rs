use crate::db;
use crate::error::{AppError, AppResult};
use crate::gh;
use crate::git;
use crate::models::{Account, AccountUploadResult, Repo};
use crate::ssh;
use crate::state::AppState;
use crate::util::{new_id, now_iso, slugify};
use std::path::PathBuf;
use tauri::{AppHandle, State};

#[tauri::command]
pub fn list_accounts(state: State<'_, AppState>) -> AppResult<Vec<Account>> {
    let conn = state.db.lock().unwrap();
    Ok(db::list_accounts(&conn)?)
}

/// Generates a signing key and uploads it via gh if this account has a
/// known github_username. The local key generation is never skipped, but
/// the upload is best-effort — its result is returned (rather than swallowed)
/// so the caller can surface it as a warning, since a key that's generated
/// but not actually registered with GitHub leaves commits unverified with
/// no visible indication why.
async fn try_generate_signing_key(
    hostname: &str,
    github_username: Option<&str>,
    host_alias: &str,
) -> Option<(String, Option<String>)> {
    let ssh_dir = ssh::config::ssh_dir().ok()?;
    let key_path = ssh_dir.join(format!("id_ed25519_{}_signing", slugify(host_alias)));
    ssh::keygen::generate_ed25519_key(&key_path, &format!("gitsplash-signing-{host_alias}"))
        .await
        .ok()?;

    let mut upload_error = None;
    if let Some(username) = github_username {
        let pubkey_path = ssh::keygen::public_key_path(&key_path);
        if let Err(e) = gh::upload_ssh_key(
            hostname,
            username,
            &pubkey_path,
            &format!("GitSplash - {host_alias} (signing)"),
            "signing",
        )
        .await
        {
            upload_error = Some(e);
        }
    }

    Some((key_path.to_string_lossy().to_string(), upload_error))
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

    // Signing keys are opt-in via the "Generate signing key" button, not
    // generated automatically here — see generate_signing_key.
    let account = Account {
        id: new_id(),
        name,
        host_alias,
        hostname,
        github_username,
        ssh_key_path: key_path.to_string_lossy().to_string(),
        signing_key_path: None,
        signing_method: "ssh".to_string(),
        gpg_key_id: None,
        created_at: now_iso(),
    };

    let conn = state.db.lock().unwrap();
    db::insert_account(&conn, &account)?;
    Ok(account)
}

/// The recommended path: authorize in the browser via `gh auth login --web`
/// (streams progress, including the one-time code, as "gh-auth-progress"
/// events), then generate the auth key and upload it to that account via
/// the API — no manual copy/paste onto GitHub's SSH keys page at all.
#[tauri::command]
pub async fn create_account_via_browser(
    app: AppHandle,
    state: State<'_, AppState>,
    name: String,
    host_alias: String,
    hostname: Option<String>,
) -> AppResult<Account> {
    let hostname = hostname.unwrap_or_else(|| "github.com".to_string());

    gh::login_with_browser(&app, &hostname).await.map_err(AppError::Ssh)?;
    let username = gh::get_authenticated_username(&hostname).await.map_err(AppError::Ssh)?;

    let ssh_dir = ssh::config::ssh_dir().map_err(AppError::Ssh)?;
    let key_path = ssh_dir.join(format!("id_ed25519_{}", slugify(&host_alias)));
    ssh::keygen::generate_ed25519_key(&key_path, &format!("gitsplash-auth-{host_alias}"))
        .await
        .map_err(AppError::Ssh)?;
    ssh::config::upsert_host_block(&host_alias, &hostname, &key_path).map_err(AppError::Ssh)?;

    let pubkey_path = ssh::keygen::public_key_path(&key_path);
    if let Err(e) = gh::upload_ssh_key(&hostname, &username, &pubkey_path, &format!("GitSplash - {host_alias}"), "authentication").await {
        // Don't leave a half-created identity behind: no account record
        // exists yet at this point, so the key pair and config block are
        // just debris that would block a retry with "key already exists".
        std::fs::remove_file(&key_path).ok();
        std::fs::remove_file(&pubkey_path).ok();
        ssh::config::remove_host_block(&host_alias).ok();
        return Err(AppError::Ssh(e));
    }

    // Signing keys are opt-in via the "Generate signing key" button, not
    // generated automatically here — see generate_signing_key.
    let account = Account {
        id: new_id(),
        name,
        host_alias,
        hostname,
        github_username: Some(username),
        ssh_key_path: key_path.to_string_lossy().to_string(),
        signing_key_path: None,
        signing_method: "ssh".to_string(),
        gpg_key_id: None,
        created_at: now_iso(),
    };

    let conn = state.db.lock().unwrap();
    db::insert_account(&conn, &account)?;
    Ok(account)
}

/// Repos already assigned to this account — a signing method change needs
/// to be applied to all of them immediately, not just future assignments.
fn assigned_repo_paths(conn: &rusqlite::Connection, account_id: &str) -> AppResult<Vec<String>> {
    Ok(db::list_repos(conn)?
        .into_iter()
        .filter(|r| r.account_id.as_deref() == Some(account_id))
        .map(|r| r.path)
        .collect())
}

#[tauri::command]
pub async fn generate_signing_key(state: State<'_, AppState>, account_id: String) -> AppResult<AccountUploadResult> {
    let mut account = {
        let conn = state.db.lock().unwrap();
        db::get_account(&conn, &account_id)?
            .ok_or_else(|| AppError::NotFound(format!("account {account_id} not found")))?
    };

    let (signing_key_path, github_upload_error) = try_generate_signing_key(
        &account.hostname,
        account.github_username.as_deref(),
        &account.host_alias,
    )
    .await
    .ok_or_else(|| AppError::Ssh("failed to generate signing key — a key may already exist at that path".to_string()))?;

    account.signing_key_path = Some(signing_key_path.clone());
    account.signing_method = "ssh".to_string();
    let paths = {
        let conn = state.db.lock().unwrap();
        db::update_account(&conn, &account)?;
        assigned_repo_paths(&conn, &account_id)?
    };

    for repo_path in paths {
        git::config::set_signing_config(&PathBuf::from(repo_path), &signing_key_path)
            .await
            .ok();
    }

    Ok(AccountUploadResult { account, github_upload_error })
}

/// Switches an account to sign with an existing local GPG key instead of
/// its SSH signing key, applying the change to every repo already assigned
/// to it. Also uploads the public key to GitHub if the account has a known
/// username — the local signing-method switch always applies regardless of
/// whether that upload succeeds, since the public key can always be copied
/// over by hand via the "GPG public key" button either way, but the result
/// is still returned so the caller can warn rather than fail silently.
#[tauri::command]
pub async fn set_account_gpg_signing(
    state: State<'_, AppState>,
    account_id: String,
    gpg_key_id: String,
) -> AppResult<AccountUploadResult> {
    let mut account = {
        let conn = state.db.lock().unwrap();
        db::get_account(&conn, &account_id)?
            .ok_or_else(|| AppError::NotFound(format!("account {account_id} not found")))?
    };

    account.signing_method = "gpg".to_string();
    account.gpg_key_id = Some(gpg_key_id.clone());
    let paths = {
        let conn = state.db.lock().unwrap();
        db::update_account(&conn, &account)?;
        assigned_repo_paths(&conn, &account_id)?
    };

    for repo_path in paths {
        git::config::set_gpg_signing_config(&PathBuf::from(repo_path), &gpg_key_id)
            .await
            .ok();
    }

    let mut github_upload_error = None;
    if let Some(username) = &account.github_username {
        match crate::gpg::export_public_key(&gpg_key_id).await {
            Ok(armored) => {
                if let Err(e) = gh::upload_gpg_key(
                    &account.hostname,
                    username,
                    &armored,
                    &format!("GitSplash - {}", account.host_alias),
                )
                .await
                {
                    github_upload_error = Some(e);
                }
            }
            Err(e) => github_upload_error = Some(format!("failed to export public key: {e}")),
        }
    }

    Ok(AccountUploadResult { account, github_upload_error })
}

/// Switches back to SSH signing. Re-applies the account's SSH signing key
/// if it has one; otherwise just clears the GPG config, since there's
/// nothing to sign with until a signing key is generated.
#[tauri::command]
pub async fn set_account_ssh_signing(state: State<'_, AppState>, account_id: String) -> AppResult<Account> {
    let mut account = {
        let conn = state.db.lock().unwrap();
        db::get_account(&conn, &account_id)?
            .ok_or_else(|| AppError::NotFound(format!("account {account_id} not found")))?
    };

    account.signing_method = "ssh".to_string();
    let signing_key_path = account.signing_key_path.clone();
    let paths = {
        let conn = state.db.lock().unwrap();
        db::update_account(&conn, &account)?;
        assigned_repo_paths(&conn, &account_id)?
    };

    for repo_path in paths {
        let repo_path_buf = PathBuf::from(repo_path);
        match &signing_key_path {
            Some(key_path) => {
                git::config::set_signing_config(&repo_path_buf, key_path).await.ok();
            }
            None => {
                git::config::clear_signing_config(&repo_path_buf).await.ok();
            }
        }
    }

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
            if account.signing_method == "gpg" {
                if let Some(gpg_key_id) = &account.gpg_key_id {
                    git::config::set_gpg_signing_config(&repo_path_buf, gpg_key_id)
                        .await
                        .map_err(AppError::Git)?;
                }
            } else if let Some(signing_key) = &account.signing_key_path {
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
