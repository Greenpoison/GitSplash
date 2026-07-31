mod commands;
mod db;
mod error;
mod gh;
mod git;
mod gpg;
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
            commands::repos::clone_repo,
            commands::repos::remove_repo,
            commands::repos::rename_repo,
            commands::repos::get_repo_status,
            commands::repos::get_repo_statuses,
            commands::groups::list_groups,
            commands::groups::create_group,
            commands::groups::rename_group,
            commands::groups::set_group_color,
            commands::groups::delete_group,
            commands::groups::set_repo_groups,
            commands::accounts::list_accounts,
            commands::accounts::create_account,
            commands::accounts::create_account_via_browser,
            commands::accounts::generate_signing_key,
            commands::accounts::get_public_key,
            commands::accounts::delete_account,
            commands::accounts::assign_repo_account,
            commands::accounts::set_account_gpg_signing,
            commands::accounts::set_account_ssh_signing,
            commands::gpg::list_gpg_secret_keys,
            commands::gpg::get_gpg_public_key,
            commands::git_ops::batch_update_group,
            commands::branches::list_branches,
            commands::branches::get_commit_graph,
            commands::branches::checkout_branch,
            commands::branches::checkout_previous_branch,
            commands::branches::merge_branch,
            commands::rebase::get_rebase_candidates,
            commands::rebase::get_in_progress_rebase,
            commands::rebase::start_rebase,
            commands::rebase::continue_rebase,
            commands::rebase::abort_rebase,
            commands::cherry_pick::get_cherry_pick_candidates,
            commands::cherry_pick::get_in_progress_cherry_pick,
            commands::cherry_pick::start_cherry_pick,
            commands::cherry_pick::continue_cherry_pick,
            commands::cherry_pick::abort_cherry_pick,
            commands::changes::get_file_changes,
            commands::changes::get_file_diff,
            commands::changes::stage_file,
            commands::changes::unstage_file,
            commands::changes::discard_file,
            commands::changes::stage_all,
            commands::changes::unstage_all,
            commands::changes::stage_hunk,
            commands::changes::unstage_hunk,
            commands::changes::discard_hunk,
            commands::changes::commit_changes,
            commands::conflicts::get_conflict_sections,
            commands::conflicts::write_resolved_file,
            commands::conflicts::keep_ours,
            commands::conflicts::keep_theirs,
            commands::history::list_tracked_files,
            commands::history::get_file_history,
            commands::history::get_blame,
            commands::history::read_file_text,
            commands::history::write_file_text,
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
            commands::undo::reset_to,
            commands::undo::get_head_sha,
            commands::worktree::list_worktrees,
            commands::worktree::add_worktree,
            commands::worktree::remove_worktree,
            commands::worktree::prune_worktrees,
            commands::submodule::list_submodules,
            commands::submodule::update_submodules,
            commands::gitflow::start_gitflow_branch,
            commands::gitflow::finish_gitflow_branch,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
