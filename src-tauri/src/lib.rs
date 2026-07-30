mod commands;
mod db;
mod error;
mod gh;
mod git;
mod models;
mod secrets;
mod ssh;
mod state;
mod util;

use state::AppState;
use std::sync::Mutex;
use tauri::Manager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .setup(|app| {
            let app_data_dir = app.path().app_data_dir()?;
            let conn = db::open(&app_data_dir)?;
            app.manage(AppState {
                db: Mutex::new(conn),
            });
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::repos::list_repos,
            commands::repos::add_repo,
            commands::repos::remove_repo,
            commands::repos::rename_repo,
            commands::repos::get_repo_status,
            commands::repos::get_repo_statuses,
            commands::groups::list_groups,
            commands::groups::create_group,
            commands::groups::rename_group,
            commands::groups::delete_group,
            commands::groups::set_repo_groups,
            commands::accounts::list_accounts,
            commands::accounts::create_account,
            commands::accounts::generate_signing_key,
            commands::accounts::get_public_key,
            commands::accounts::delete_account,
            commands::accounts::assign_repo_account,
            commands::git_ops::batch_update_group,
            commands::branches::list_branches,
            commands::branches::get_commit_graph,
            commands::branches::checkout_branch,
            commands::branches::checkout_previous_branch,
            commands::branches::merge_branch,
            commands::settings::get_settings,
            commands::settings::save_settings,
            commands::secrets::scan_repo_secrets,
            commands::secrets::export_secrets_bundle,
            commands::pr::is_gh_available,
            commands::pr::is_account_gh_authenticated,
            commands::pr::list_pull_requests,
            commands::pr::create_pull_request,
            commands::pr::merge_pull_request,
            commands::open::open_repo_external,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
