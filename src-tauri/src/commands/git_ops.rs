use crate::db;
use crate::error::{AppError, AppResult};
use crate::git;
use crate::git::fetch::FetchOutcome;
use crate::git::push::PushOutcome;
use crate::models::{BatchEvent, BatchPhase};
use crate::state::AppState;
use crate::util::{new_id, now_iso};
use std::path::PathBuf;
use std::sync::Arc;
use tauri::{AppHandle, Emitter, Manager, State};
use tokio::sync::Semaphore;

/// Fetches (and optionally pulls) a single repo, independent of any group —
/// the per-repo counterpart to `batch_update_group`, for repos that aren't
/// in a group at all or when you just want to update one repo on its own.
#[tauri::command]
pub async fn fetch_repo(state: State<'_, AppState>, repo_id: String, pull: bool) -> AppResult<FetchOutcome> {
    let repo_path = {
        let conn = state.db.lock().unwrap();
        db::get_repo(&conn, &repo_id)?
            .ok_or_else(|| AppError::NotFound(format!("repo {repo_id} not found")))?
            .path
    };
    let outcome = git::fetch::fetch_and_maybe_pull(&repo_id, &PathBuf::from(repo_path), pull).await;
    if outcome.fetched {
        let conn = state.db.lock().unwrap();
        db::touch_last_fetched(&conn, &repo_id, &now_iso()).ok();
    }
    Ok(outcome)
}

/// Pushes the current branch to its remote, publishing it with `-u` the
/// first time it has no upstream yet.
#[tauri::command]
pub async fn push_repo(state: State<'_, AppState>, repo_id: String, force: bool) -> AppResult<PushOutcome> {
    let repo_path = {
        let conn = state.db.lock().unwrap();
        db::get_repo(&conn, &repo_id)?
            .ok_or_else(|| AppError::NotFound(format!("repo {repo_id} not found")))?
            .path
    };
    Ok(git::push::push(&repo_id, &PathBuf::from(repo_path), force).await)
}

/// Pushes every repo in a group's current branch, in parallel up to the
/// configured concurrency, streaming a BatchEvent per repo the same way
/// `batch_update_group` does. Repos with nothing to push still succeed
/// trivially — `git push` is a no-op when there's nothing new.
#[tauri::command]
pub async fn batch_push_group(app: AppHandle, state: State<'_, AppState>, group_id: String) -> AppResult<String> {
    let repos = {
        let conn = state.db.lock().unwrap();
        let repo_ids = db::repo_ids_for_group(&conn, &group_id)?;
        let mut repos = Vec::new();
        for id in repo_ids {
            if let Some(repo) = db::get_repo(&conn, &id)? {
                repos.push(repo);
            }
        }
        repos
    };
    let concurrency = {
        let conn = state.db.lock().unwrap();
        db::get_settings(&conn)?.batch_concurrency.max(1) as usize
    };

    let run_id = new_id();
    let semaphore = Arc::new(Semaphore::new(concurrency));
    let mut handles = Vec::new();

    for repo in repos {
        let sem = semaphore.clone();
        let app = app.clone();
        let run_id = run_id.clone();
        handles.push(tauri::async_runtime::spawn(async move {
            let _permit = sem.acquire().await.expect("semaphore closed");
            let repo_path = PathBuf::from(&repo.path);

            let _ = app.emit(
                "batch-progress",
                BatchEvent {
                    run_id: run_id.clone(),
                    repo_id: repo.id.clone(),
                    repo_name: repo.display_name.clone(),
                    phase: BatchPhase::Started,
                    message: None,
                    pulled: false,
                },
            );

            let outcome = git::push::push(&repo.id, &repo_path, false).await;

            let phase = if outcome.pushed { BatchPhase::Success } else { BatchPhase::Failed };

            let _ = app.emit(
                "batch-progress",
                BatchEvent {
                    run_id,
                    repo_id: repo.id,
                    repo_name: repo.display_name,
                    phase,
                    message: outcome.message,
                    pulled: false,
                },
            );
        }));
    }

    futures::future::join_all(handles).await;
    Ok(run_id)
}

/// Runs fetch (and optionally pull) across every repo in a group, in
/// parallel up to the configured concurrency, streaming a BatchEvent per
/// repo per phase to the frontend. Returns the run_id used to correlate
/// those events. Repos outside this group are never touched.
#[tauri::command]
pub async fn batch_update_group(
    app: AppHandle,
    state: State<'_, AppState>,
    group_id: String,
    pull: bool,
) -> AppResult<String> {
    let (repos, concurrency) = {
        let conn = state.db.lock().unwrap();
        let repo_ids = db::repo_ids_for_group(&conn, &group_id)?;
        let mut repos = Vec::new();
        for id in repo_ids {
            if let Some(repo) = db::get_repo(&conn, &id)? {
                repos.push(repo);
            }
        }
        let settings = db::get_settings(&conn)?;
        (repos, settings.batch_concurrency.max(1) as usize)
    };

    let run_id = new_id();
    let semaphore = Arc::new(Semaphore::new(concurrency));
    let mut handles = Vec::new();

    for repo in repos {
        let sem = semaphore.clone();
        let app = app.clone();
        let run_id = run_id.clone();
        handles.push(tauri::async_runtime::spawn(async move {
            let _permit = sem.acquire().await.expect("semaphore closed");
            let repo_path = PathBuf::from(&repo.path);

            let _ = app.emit(
                "batch-progress",
                BatchEvent {
                    run_id: run_id.clone(),
                    repo_id: repo.id.clone(),
                    repo_name: repo.display_name.clone(),
                    phase: BatchPhase::Started,
                    message: None,
                    pulled: false,
                },
            );

            let outcome = git::fetch::fetch_and_maybe_pull(&repo.id, &repo_path, pull).await;

            if outcome.fetched {
                let state = app.state::<AppState>();
                let conn = state.db.lock().unwrap();
                db::touch_last_fetched(&conn, &repo.id, &now_iso()).ok();
            }

            let phase = if !outcome.fetched {
                BatchPhase::Failed
            } else if outcome.skipped_pull {
                BatchPhase::Skipped
            } else if pull && !outcome.pulled {
                BatchPhase::Failed
            } else {
                BatchPhase::Success
            };

            let _ = app.emit(
                "batch-progress",
                BatchEvent {
                    run_id,
                    repo_id: repo.id,
                    repo_name: repo.display_name,
                    phase,
                    message: outcome.message,
                    pulled: outcome.pulled,
                },
            );
        }));
    }

    futures::future::join_all(handles).await;
    Ok(run_id)
}
