use super::process::GitOutput;
use crate::util::no_window_tokio;
use serde::Serialize;
use std::path::Path;
use std::process::Stdio;
use tauri::{AppHandle, Emitter};
use tokio::io::AsyncReadExt;
use tokio::process::Command;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GitProgress {
    pub op_id: String,
    pub stage: String,
    pub percent: Option<u8>,
}

/// Recognizes the progress lines `--progress` writes to stderr for
/// clone/fetch/push. Each is only ever seen mid-stage here since
/// `stream_progress` below splits on `\r` as well as `\n`.
fn parse_progress_line(line: &str) -> Option<(&'static str, Option<u8>)> {
    let stage = if line.contains("Receiving objects") {
        "Receiving objects"
    } else if line.contains("Resolving deltas") {
        "Resolving deltas"
    } else if line.contains("Compressing objects") {
        "Compressing objects"
    } else if line.contains("Counting objects") {
        "Counting objects"
    } else if line.contains("Writing objects") {
        "Writing objects"
    } else {
        return None;
    };
    let percent = line
        .split(':')
        .nth(1)
        .and_then(|rest| rest.trim_start().split('%').next())
        .and_then(|n| n.trim().parse::<u8>().ok());
    Some((stage, percent))
}

/// Reads `stderr` in raw chunks rather than line-by-line: git overwrites its
/// progress percentage in place using `\r`, which a `\n`-only line reader
/// (e.g. `BufReader::lines()`) would buffer up and only surface once per
/// stage instead of continuously. Returns the full accumulated text so the
/// caller can still build a real error message if the operation fails —
/// piping stderr for progress would otherwise throw that context away.
///
/// Public (not just used via `run_git_with_progress` below) because
/// `git::clone::clone_repo` can't go through that helper — it can't use
/// `-C <repo_path>` since the clone destination doesn't exist yet — but
/// still wants the same byte-level stderr streaming.
pub async fn stream_progress(
    mut stderr: tokio::process::ChildStderr,
    app: &AppHandle,
    event: &'static str,
    op_id: &str,
) -> String {
    let mut full = String::new();
    let mut pending = String::new();
    let mut buf = [0u8; 4096];
    loop {
        let n = match stderr.read(&mut buf).await {
            Ok(0) | Err(_) => break,
            Ok(n) => n,
        };
        let chunk = String::from_utf8_lossy(&buf[..n]);
        full.push_str(&chunk);
        pending.push_str(&chunk);
        while let Some(idx) = pending.find(['\r', '\n']) {
            let line = pending[..idx].to_string();
            pending.drain(..=idx);
            if let Some((stage, percent)) = parse_progress_line(&line) {
                let _ = app.emit(
                    event,
                    GitProgress { op_id: op_id.to_string(), stage: stage.to_string(), percent },
                );
            }
        }
    }
    full
}

/// Like `process::run_git`, but streams `--progress` output from stderr as
/// `event` Tauri events (see `stream_progress`) instead of just capturing
/// it, so the frontend can show a live percentage for slow network
/// operations — fetch and push — the same way `git::clone::clone_repo`
/// does. Callers are responsible for passing `--progress` in `args`
/// themselves. Only used for commands whose stdout nothing reads (fetch,
/// push): stdout is discarded rather than captured.
pub async fn run_git_with_progress(
    repo_path: &Path,
    args: &[&str],
    app: &AppHandle,
    event: &'static str,
    op_id: &str,
) -> std::io::Result<GitOutput> {
    let mut cmd = Command::new("git");
    no_window_tokio(&mut cmd);
    let mut child = cmd
        .arg("-C")
        .arg(repo_path)
        .args(args)
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::piped())
        .spawn()?;

    let stderr = child.stderr.take().expect("stderr was piped");
    let full_stderr = stream_progress(stderr, app, event, op_id).await;
    let status = child.wait().await?;

    Ok(GitOutput { success: status.success(), stdout: String::new(), stderr: full_stderr })
}
