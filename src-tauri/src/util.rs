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
