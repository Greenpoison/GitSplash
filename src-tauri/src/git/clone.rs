use super::progress::stream_progress;
use crate::util::no_window_tokio;
use std::path::Path;
use std::process::Stdio;
use tauri::AppHandle;
use tokio::process::Command;

fn git_err(prefix: &str, stderr: &str) -> String {
    if stderr.trim().is_empty() {
        prefix.to_string()
    } else {
        format!("{prefix}: {}", stderr.trim())
    }
}

/// Clones `url` into `dest`, which must not already exist. Unlike every
/// other git/ module, this can't shell out via `progress::run_git_with_progress`'s
/// `-C <repo_path>` pattern, since the destination doesn't exist yet — runs
/// plain `git clone <url> <dest>` instead, streaming its own stderr with the
/// shared `stream_progress` helper.
///
/// Streams progress as "clone-progress" events tagged with `clone_id`, so
/// the frontend can match events back to the specific clone that's still
/// running in the background after its dialog has closed.
///
/// `auth_header`, when given, is passed as a one-shot `-c http.extraheader=`
/// override — scoped to this single git invocation only, never written to
/// the resulting repo's `.git/config` — so a plain `https://` URL can be
/// authenticated with a specific account's token. Without this, GitSplash
/// has no way to know which of possibly several accounts should handle a
/// URL that carries no account-specific info at all (unlike an SSH URL
/// through one of GitSplash's own host aliases, which already encodes
/// that). Harmless to pass for an `ssh://`/`git@` URL too — git only
/// applies an http.* config value to HTTP(S) requests.
pub async fn clone_repo(
    app: &AppHandle,
    clone_id: &str,
    url: &str,
    dest: &Path,
    auth_header: Option<&str>,
) -> Result<(), String> {
    if dest.exists() {
        return Err(format!("{} already exists", dest.display()));
    }
    if let Some(parent) = dest.parent() {
        std::fs::create_dir_all(parent)
            .map_err(|e| format!("failed to create {}: {e}", parent.display()))?;
    }

    let mut cmd = Command::new("git");
    no_window_tokio(&mut cmd);
    if let Some(header) = auth_header {
        cmd.arg("-c").arg(format!("http.extraheader={header}"));
    }
    let mut child = cmd
        .arg("clone")
        .arg("--progress")
        // `--` stops option parsing before `url` — without it, a pasted
        // string like `--upload-pack=...` is parsed as a flag instead of a
        // URL (the well-known CVE-2017-1000117 pattern), which can run an
        // arbitrary local command.
        .arg("--")
        .arg(url)
        .arg(dest)
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|e| format!("failed to run git clone: {e}"))?;

    let stderr = child.stderr.take().expect("stderr was piped");
    let full_stderr = stream_progress(stderr, app, "clone-progress", clone_id).await;
    let status = child.wait().await.map_err(|e| format!("failed to run git clone: {e}"))?;

    if !status.success() {
        return Err(git_err("git clone failed", &full_stderr));
    }
    Ok(())
}
