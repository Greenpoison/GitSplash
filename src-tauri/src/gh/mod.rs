use serde::{Deserialize, Serialize};
use std::path::Path;
use std::process::Stdio;
use std::time::Duration;
use tauri::{AppHandle, Emitter};
use tokio::io::{AsyncBufReadExt, BufReader};
use tokio::process::Command;
use tokio::time::timeout;

/// Fetches the stored token for a specific gh-authenticated GitHub username
/// without touching gh's globally "active" account — this is what lets
/// concurrent operations across two different GitHub identities be safe.
async fn token_for_user(hostname: &str, username: &str) -> Result<String, String> {
    let output = Command::new("gh")
        .args(["auth", "token", "--hostname", hostname, "--user", username])
        .output()
        .await
        .map_err(|e| format!("failed to run gh: {e}"))?;
    if !output.status.success() {
        return Err(format!(
            "no stored gh credential for '{username}' — run `gh auth login` as that account first ({})",
            String::from_utf8_lossy(&output.stderr).trim()
        ));
    }
    Ok(String::from_utf8_lossy(&output.stdout).trim().to_string())
}

async fn run_gh(
    repo_path: &Path,
    hostname: &str,
    github_username: Option<&str>,
    args: &[&str],
) -> Result<String, String> {
    let mut cmd = Command::new("gh");
    cmd.current_dir(repo_path).args(args);
    if let Some(username) = github_username {
        let token = token_for_user(hostname, username).await?;
        cmd.env("GH_TOKEN", token).env("GH_HOST", hostname);
    }
    let output = cmd
        .output()
        .await
        .map_err(|e| format!("failed to run gh: {e}"))?;
    if !output.status.success() {
        return Err(String::from_utf8_lossy(&output.stderr).trim().to_string());
    }
    Ok(String::from_utf8_lossy(&output.stdout).into_owned())
}

pub async fn is_gh_installed() -> bool {
    Command::new("gh")
        .arg("--version")
        .output()
        .await
        .map(|o| o.status.success())
        .unwrap_or(false)
}

pub async fn is_user_authenticated(hostname: &str, username: &str) -> bool {
    token_for_user(hostname, username).await.is_ok()
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GhAuthProgress {
    pub line: String,
}

/// Drives `gh auth login --web`, a device-authorization flow: gh prints a
/// one-time code and a github.com/login/device URL, then long-polls until
/// the user approves it in their browser. Every line gh prints is streamed
/// to the frontend as a "gh-auth-progress" event (the one-time code is in
/// there), and the device URL is opened automatically. Stdin is closed
/// deliberately — gh detects the non-interactive context and skips its
/// "press Enter to open browser" prompt rather than hanging on it.
pub async fn login_with_browser(app: &AppHandle, hostname: &str) -> Result<(), String> {
    let mut child = Command::new("gh")
        .args([
            "auth",
            "login",
            "--hostname",
            hostname,
            "--web",
            "--git-protocol",
            "ssh",
            "--skip-ssh-key",
            // gh's default OAuth scopes don't include this, but the
            // ssh-key upload endpoint we call right after login requires it.
            "--scopes",
            "admin:public_key",
        ])
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|e| format!("failed to run gh: {e}"))?;

    let stdout = child.stdout.take().expect("stdout was piped");
    let stderr = child.stderr.take().expect("stderr was piped");

    let stdout_app = app.clone();
    let stdout_task = tokio::spawn(async move {
        let mut lines = BufReader::new(stdout).lines();
        while let Ok(Some(line)) = lines.next_line().await {
            handle_login_line(&stdout_app, &line);
        }
    });
    let stderr_app = app.clone();
    let stderr_task = tokio::spawn(async move {
        let mut lines = BufReader::new(stderr).lines();
        while let Ok(Some(line)) = lines.next_line().await {
            handle_login_line(&stderr_app, &line);
        }
    });

    // The device code is normally approved within a minute or two; 5
    // minutes covers someone who steps away, without leaving a gh process
    // polling GitHub forever if they never come back.
    let wait_result = timeout(Duration::from_secs(300), child.wait()).await;
    let _ = stdout_task.await;
    let _ = stderr_task.await;

    match wait_result {
        Ok(Ok(status)) if status.success() => Ok(()),
        Ok(Ok(status)) => Err(format!("gh auth login exited with {status}")),
        Ok(Err(e)) => Err(format!("failed waiting on gh: {e}")),
        Err(_) => {
            let _ = child.start_kill();
            Err("timed out waiting for browser authorization".to_string())
        }
    }
}

fn handle_login_line(app: &AppHandle, line: &str) {
    let _ = app.emit("gh-auth-progress", GhAuthProgress { line: line.to_string() });
    if let Some(url) = line.split("Open this URL to continue in your web browser: ").nth(1) {
        std::process::Command::new("explorer").arg(url.trim()).spawn().ok();
    }
}

pub async fn get_authenticated_username(hostname: &str) -> Result<String, String> {
    let output = Command::new("gh")
        .args(["api", "user", "--hostname", hostname, "--jq", ".login"])
        .output()
        .await
        .map_err(|e| format!("failed to run gh: {e}"))?;
    if !output.status.success() {
        return Err(format!(
            "could not determine the logged-in username: {}",
            String::from_utf8_lossy(&output.stderr).trim()
        ));
    }
    Ok(String::from_utf8_lossy(&output.stdout).trim().to_string())
}

/// Uploads a public key to the given account's GitHub "SSH and GPG keys"
/// page via the API — the whole reason to prefer this over manual copy/paste.
pub async fn upload_ssh_key(
    hostname: &str,
    username: &str,
    public_key_path: &Path,
    title: &str,
    key_type: &str, // "authentication" | "signing"
) -> Result<(), String> {
    let token = token_for_user(hostname, username).await?;
    let output = Command::new("gh")
        .args([
            "ssh-key",
            "add",
            &public_key_path.to_string_lossy(),
            "--title",
            title,
            "--type",
            key_type,
        ])
        .env("GH_TOKEN", token)
        .env("GH_HOST", hostname)
        .output()
        .await
        .map_err(|e| format!("failed to run gh: {e}"))?;
    if !output.status.success() {
        return Err(String::from_utf8_lossy(&output.stderr).trim().to_string());
    }
    Ok(())
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PullRequestSummary {
    pub number: u32,
    pub title: String,
    pub url: String,
    pub state: String,
    pub is_draft: bool,
    pub head_ref_name: String,
    pub base_ref_name: String,
}

const PR_LIST_FIELDS: &str = "number,title,url,state,isDraft,headRefName,baseRefName";

pub async fn list_pull_requests(
    repo_path: &Path,
    hostname: &str,
    github_username: Option<&str>,
) -> Result<Vec<PullRequestSummary>, String> {
    let stdout = run_gh(
        repo_path,
        hostname,
        github_username,
        &["pr", "list", "--json", PR_LIST_FIELDS, "--limit", "50"],
    )
    .await?;
    parse_pr_list(&stdout)
}

fn parse_pr_list(stdout: &str) -> Result<Vec<PullRequestSummary>, String> {
    #[derive(Deserialize)]
    #[serde(rename_all = "camelCase")]
    struct Raw {
        number: u32,
        title: String,
        url: String,
        state: String,
        is_draft: bool,
        head_ref_name: String,
        base_ref_name: String,
    }
    let raw: Vec<Raw> = serde_json::from_str(stdout).map_err(|e| format!("failed to parse gh output: {e}"))?;
    Ok(raw
        .into_iter()
        .map(|r| PullRequestSummary {
            number: r.number,
            title: r.title,
            url: r.url,
            state: r.state,
            is_draft: r.is_draft,
            head_ref_name: r.head_ref_name,
            base_ref_name: r.base_ref_name,
        })
        .collect())
}

pub async fn create_pull_request(
    repo_path: &Path,
    hostname: &str,
    github_username: Option<&str>,
    title: &str,
    body: &str,
    base: &str,
    draft: bool,
) -> Result<String, String> {
    let mut args = vec!["pr", "create", "--title", title, "--body", body, "--base", base];
    if draft {
        args.push("--draft");
    }
    run_gh(repo_path, hostname, github_username, &args).await
}

pub async fn merge_pull_request(
    repo_path: &Path,
    hostname: &str,
    github_username: Option<&str>,
    number: u32,
    method: &str, // "merge" | "squash" | "rebase"
) -> Result<String, String> {
    let number_str = number.to_string();
    let method_flag = match method {
        "squash" => "--squash",
        "rebase" => "--rebase",
        _ => "--merge",
    };
    run_gh(
        repo_path,
        hostname,
        github_username,
        &["pr", "merge", &number_str, method_flag, "--delete-branch=false"],
    )
    .await
}
