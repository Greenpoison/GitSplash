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
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init())
        .setup(|app| {
            let app_data_dir = app.path().app_data_dir()?;
            let conn = db::open(&app_data_dir)?;
            app.manage(AppState {
                db: Mutex::new(conn),
            });
            util::cleanup_stale_updater_temp_dirs(&app.package_info().name);
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::repos::list_repos,
            commands::repos::add_repo,
            commands::repos::clone_repo,
            commands::repos::init_repo,
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
            commands::accounts::set_account_ssh_over_https,
            commands::gpg::list_gpg_secret_keys,
            commands::gpg::get_gpg_public_key,
            commands::git_ops::batch_update_group,
            commands::git_ops::fetch_repo,
            commands::git_ops::push_repo,
            commands::git_ops::batch_push_group,
            commands::branches::list_branches,
            commands::branches::get_commit_graph,
            commands::branches::checkout_branch,
            commands::branches::create_branch,
            commands::branches::create_branch_at,
            commands::branches::delete_branch,
            commands::branches::checkout_previous_branch,
            commands::branches::merge_branch,
            commands::tags::list_tags,
            commands::tags::list_remote_tags,
            commands::tags::create_tag,
            commands::tags::delete_tag,
            commands::tags::push_tag,
            commands::tags::push_all_tags,
            commands::tags::delete_remote_tag,
            commands::tags::fetch_tags,
            commands::tags::get_commit,
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
            commands::changes::untrack_paths,
            commands::changes::skip_worktree,
            commands::changes::unskip_worktree,
            commands::changes::list_skip_worktree_files,
            commands::changes::stage_all,
            commands::changes::unstage_all,
            commands::changes::stage_hunk,
            commands::changes::unstage_hunk,
            commands::changes::discard_hunk,
            commands::changes::commit_changes,
            commands::changes::amend_commit,
            commands::stash::stash_push,
            commands::stash::list_stashes,
            commands::stash::stash_pop,
            commands::stash::stash_apply,
            commands::stash::stash_drop,
            commands::compare::compare_branches,
            commands::compare::get_compare_file_diff,
            commands::compare::list_branch_files,
            commands::compare::read_branch_file,
            commands::commit_detail::get_commit_files,
            commands::commit_detail::get_commit_file_diff,
            commands::conflicts::get_conflict_sections,
            commands::conflicts::write_resolved_file,
            commands::conflicts::keep_ours,
            commands::conflicts::keep_theirs,
            commands::history::list_tracked_files,
            commands::history::get_file_history,
            commands::history::get_blame,
            commands::history::search_commits,
            commands::history::get_reflog,
            commands::doctor::run_health_check,
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
            commands::pr::get_pull_request_detail,
            commands::pr::get_pull_request_templates,
            commands::open::open_repo_external,
            commands::undo::reset_to,
            commands::undo::discard_and_reset_to,
            commands::undo::get_head_sha,
            commands::undo::resolve_ref,
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
