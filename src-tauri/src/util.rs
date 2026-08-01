pub fn new_id() -> String {
    uuid::Uuid::new_v4().to_string()
}

pub fn now_iso() -> String {
    chrono::Utc::now().to_rfc3339()
}

/// Turns a host alias like "github.com-personal" into a filesystem-safe
/// slug for key filenames, e.g. "github-com-personal".
pub fn slugify(s: &str) -> String {
    s.chars()
        .map(|c| if c.is_ascii_alphanumeric() { c } else { '-' })
        .collect()
}

/// Windows briefly flashes a console window for every child process spawned
/// from a GUI app that has no console of its own — every git/gh/ssh-keygen
/// invocation otherwise. Suppresses that. No-op on other platforms.
#[cfg(windows)]
const CREATE_NO_WINDOW: u32 = 0x0800_0000;

#[cfg(windows)]
pub fn no_window_tokio(cmd: &mut tokio::process::Command) {
    cmd.creation_flags(CREATE_NO_WINDOW);
}
#[cfg(not(windows))]
pub fn no_window_tokio(_cmd: &mut tokio::process::Command) {}

#[cfg(windows)]
pub fn no_window_std(cmd: &mut std::process::Command) {
    use std::os::windows::process::CommandExt;
    cmd.creation_flags(CREATE_NO_WINDOW);
}
#[cfg(not(windows))]
pub fn no_window_std(_cmd: &mut std::process::Command) {}

/// The updater plugin downloads each installer into its own
/// `<app-name>-<version>-updater-<random>` folder under the OS temp dir, and
/// deliberately never cleans it up itself — on Windows it launches the
/// installer via `ShellExecuteW` and then calls `std::process::exit(0)`
/// immediately after, which skips Rust destructors entirely (including the
/// `TempPath`/`TempDir` guards that would otherwise delete it), and the
/// directory itself is `.keep()`'d so it survives even a normal drop. Left
/// alone, one ~5MB leftover directory accumulates per update, forever.
/// Called once at startup so old ones get swept up in the update after the
/// one that left them behind; the directory an in-progress update just
/// created doesn't exist yet at that point, so there's no race with it.
pub fn cleanup_stale_updater_temp_dirs(app_name: &str) {
    cleanup_stale_updater_temp_dirs_in(app_name, &std::env::temp_dir());
}

fn cleanup_stale_updater_temp_dirs_in(app_name: &str, dir: &std::path::Path) {
    let prefix = format!("{app_name}-");
    let Ok(entries) = std::fs::read_dir(dir) else {
        return;
    };
    for entry in entries.flatten() {
        let name = entry.file_name();
        let Some(name) = name.to_str() else { continue };
        if name.starts_with(&prefix) && name.contains("-updater-") {
            let _ = std::fs::remove_dir_all(entry.path());
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;

    #[test]
    fn removes_only_this_apps_updater_dirs() {
        let base = std::env::temp_dir().join(format!("gitsplash-util-test-{}", new_id()));
        let stale = base.join("gitsplash-1.0.0-updater-abc123");
        let other_app = base.join("otherapp-1.0.0-updater-abc123");
        let unrelated = base.join("gitsplash-cache");
        fs::create_dir_all(&stale).unwrap();
        fs::create_dir_all(&other_app).unwrap();
        fs::create_dir_all(&unrelated).unwrap();

        cleanup_stale_updater_temp_dirs_in("gitsplash", &base);

        assert!(!stale.exists());
        assert!(other_app.exists());
        assert!(unrelated.exists());

        fs::remove_dir_all(&base).ok();
    }

    #[test]
    fn does_nothing_when_the_directory_does_not_exist() {
        let missing = std::env::temp_dir().join(format!("gitsplash-does-not-exist-{}", new_id()));
        cleanup_stale_updater_temp_dirs_in("gitsplash", &missing);
    }
}
