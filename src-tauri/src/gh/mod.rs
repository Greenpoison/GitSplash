use crate::git::diff::{parse_multi_file_diff, DiffHunk};
use crate::util::{no_window_std, no_window_tokio};
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
///
/// `pub(crate)` (not private) so `commands::repos::clone_repo` can borrow an
/// account's token to authenticate a plain `https://` clone URL — see the
/// comment there for why a clone can't just rely on the account's SSH key
/// the way every other git operation on an assigned repo does.
pub(crate) async fn token_for_user(hostname: &str, username: &str) -> Result<String, String> {
    let mut cmd = Command::new("gh");
    no_window_tokio(&mut cmd);
    let output = cmd
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
    no_window_tokio(&mut cmd);
    // `gh pr create` normally prompts interactively (e.g. "push this branch
    // to a remote?") if it thinks it can — with a GUI app there's no visible
    // terminal for that prompt to appear on, so it would otherwise hang
    // indefinitely. Closing stdin makes gh detect the non-interactive
    // context and fail fast with a clear error instead.
    cmd.current_dir(repo_path).args(args).stdin(Stdio::null());
    if let Some(username) = github_username {
        let token = token_for_user(hostname, username).await?;
        cmd.env("GH_TOKEN", token).env("GH_HOST", hostname);
    }
    let output = timeout(Duration::from_secs(30), cmd.output())
        .await
        .map_err(|_| "gh timed out after 30s".to_string())?
        .map_err(|e| format!("failed to run gh: {e}"))?;
    if !output.status.success() {
        return Err(String::from_utf8_lossy(&output.stderr).trim().to_string());
    }
    Ok(String::from_utf8_lossy(&output.stdout).into_owned())
}

pub async fn is_gh_installed() -> bool {
    let mut cmd = Command::new("gh");
    no_window_tokio(&mut cmd);
    cmd.arg("--version")
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
    let mut cmd = Command::new("gh");
    no_window_tokio(&mut cmd);
    let mut child = cmd
        .args([
            "auth",
            "login",
            "--hostname",
            hostname,
            "--web",
            "--git-protocol",
            "ssh",
            "--skip-ssh-key",
            // gh's default OAuth scopes cover none of these, but the key
            // upload endpoints this app calls right after login (auth key,
            // signing key, and GPG key) each need their own scope — request
            // all three up front so a later upload never 404s/403s on scope.
            "--scopes",
            "admin:public_key,admin:ssh_signing_key,write:gpg_key",
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
        let mut cmd = std::process::Command::new("explorer");
        no_window_std(&mut cmd);
        cmd.arg(url.trim()).spawn().ok();
    }
}

pub async fn get_authenticated_username(hostname: &str) -> Result<String, String> {
    let mut cmd = Command::new("gh");
    no_window_tokio(&mut cmd);
    let output = cmd
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
    let mut cmd = Command::new("gh");
    no_window_tokio(&mut cmd);
    let output = cmd
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

/// Uploads an ASCII-armored GPG public key to the given account's GitHub
/// "SSH and GPG keys" page — same idea as `upload_ssh_key`, just via
/// `gh gpg-key add`, which (unlike `ssh-key add`) only takes a file path,
/// not stdin, so the key is written to a throwaway temp file first.
pub async fn upload_gpg_key(
    hostname: &str,
    username: &str,
    armored_public_key: &str,
    title: &str,
) -> Result<(), String> {
    let token = token_for_user(hostname, username).await?;

    let temp_path = std::env::temp_dir().join(format!("gitsplash-gpg-{}.asc", crate::util::new_id()));
    tokio::fs::write(&temp_path, armored_public_key)
        .await
        .map_err(|e| format!("failed to write temp key file: {e}"))?;

    let mut cmd = Command::new("gh");
    no_window_tokio(&mut cmd);
    let result = cmd
        .args(["gpg-key", "add", &temp_path.to_string_lossy(), "--title", title])
        .env("GH_TOKEN", token)
        .env("GH_HOST", hostname)
        .output()
        .await;

    let _ = tokio::fs::remove_file(&temp_path).await;

    let output = result.map_err(|e| format!("failed to run gh: {e}"))?;
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

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PrCheck {
    pub name: String,
    pub status: String,
    pub conclusion: Option<String>,
    pub details_url: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PrReview {
    pub author: String,
    pub state: String,
    pub body: String,
    pub submitted_at: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PrComment {
    pub author: String,
    pub body: String,
    pub created_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PrDiffFile {
    pub path: String,
    pub is_binary: bool,
    pub insertions: u32,
    pub deletions: u32,
    pub hunks: Vec<DiffHunk>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PullRequestDetail {
    pub number: u32,
    pub title: String,
    pub body: String,
    pub url: String,
    pub review_decision: Option<String>,
    pub checks: Vec<PrCheck>,
    pub reviews: Vec<PrReview>,
    pub comments: Vec<PrComment>,
    pub files: Vec<PrDiffFile>,
}

const PR_VIEW_FIELDS: &str =
    "number,title,body,url,reviewDecision,statusCheckRollup,reviews,comments";

/// GitHub's GraphQL-backed `statusCheckRollup` mixes two different shapes —
/// modern check runs use `name`/`status`/`conclusion`/`detailsUrl`, legacy
/// commit statuses use `context`/`state`/`targetUrl` — so every field here
/// is optional and normalized afterward rather than assuming one shape.
#[derive(Debug, Deserialize)]
struct RawCheck {
    name: Option<String>,
    context: Option<String>,
    status: Option<String>,
    state: Option<String>,
    conclusion: Option<String>,
    #[serde(rename = "detailsUrl")]
    details_url: Option<String>,
    #[serde(rename = "targetUrl")]
    target_url: Option<String>,
}

#[derive(Debug, Deserialize)]
struct RawAuthor {
    login: String,
}

#[derive(Debug, Deserialize)]
struct RawReview {
    author: Option<RawAuthor>,
    state: String,
    body: String,
    #[serde(rename = "submittedAt")]
    submitted_at: Option<String>,
}

#[derive(Debug, Deserialize)]
struct RawComment {
    author: Option<RawAuthor>,
    body: String,
    #[serde(rename = "createdAt")]
    created_at: String,
}

#[derive(Debug, Deserialize)]
struct RawPrView {
    number: u32,
    title: String,
    body: String,
    url: String,
    #[serde(rename = "reviewDecision")]
    review_decision: Option<String>,
    #[serde(default, rename = "statusCheckRollup")]
    status_check_rollup: Vec<RawCheck>,
    #[serde(default)]
    reviews: Vec<RawReview>,
    #[serde(default)]
    comments: Vec<RawComment>,
}

fn parse_pr_view(stdout: &str) -> Result<RawPrView, String> {
    serde_json::from_str(stdout).map_err(|e| format!("failed to parse gh output: {e}"))
}

fn normalize_check(c: RawCheck) -> PrCheck {
    PrCheck {
        name: c.name.or(c.context).unwrap_or_else(|| "check".to_string()),
        status: c.status.unwrap_or_else(|| "COMPLETED".to_string()),
        conclusion: c.conclusion.or(c.state),
        details_url: c.details_url.or(c.target_url),
    }
}

pub async fn get_pull_request_detail(
    repo_path: &Path,
    hostname: &str,
    github_username: Option<&str>,
    number: u32,
) -> Result<PullRequestDetail, String> {
    let number_str = number.to_string();
    let view_stdout = run_gh(
        repo_path,
        hostname,
        github_username,
        &["pr", "view", &number_str, "--json", PR_VIEW_FIELDS],
    )
    .await?;
    let raw = parse_pr_view(&view_stdout)?;

    // gh doesn't support filtering `pr diff` to one file, so this pulls the
    // whole patch in one call and splits it client-side (parse_multi_file_diff)
    // rather than one gh invocation per changed file.
    let diff_stdout = run_gh(
        repo_path,
        hostname,
        github_username,
        &["pr", "diff", &number_str, "--patch"],
    )
    .await
    .unwrap_or_default();
    let files = parse_multi_file_diff(&diff_stdout)
        .into_iter()
        .map(|(path, is_binary, hunks)| {
            let insertions = hunks.iter().flat_map(|h| &h.lines).filter(|l| l.kind == "add").count() as u32;
            let deletions = hunks.iter().flat_map(|h| &h.lines).filter(|l| l.kind == "del").count() as u32;
            PrDiffFile { path, is_binary, insertions, deletions, hunks }
        })
        .collect();

    Ok(PullRequestDetail {
        number: raw.number,
        title: raw.title,
        body: raw.body,
        url: raw.url,
        review_decision: raw.review_decision,
        checks: raw.status_check_rollup.into_iter().map(normalize_check).collect(),
        reviews: raw
            .reviews
            .into_iter()
            .map(|r| PrReview {
                author: r.author.map(|a| a.login).unwrap_or_else(|| "unknown".to_string()),
                state: r.state,
                body: r.body,
                submitted_at: r.submitted_at,
            })
            .collect(),
        comments: raw
            .comments
            .into_iter()
            .map(|c| PrComment {
                author: c.author.map(|a| a.login).unwrap_or_else(|| "unknown".to_string()),
                body: c.body,
                created_at: c.created_at,
            })
            .collect(),
        files,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn normalizes_a_modern_check_run() {
        let raw = RawCheck {
            name: Some("build".to_string()),
            context: None,
            status: Some("COMPLETED".to_string()),
            state: None,
            conclusion: Some("SUCCESS".to_string()),
            details_url: Some("https://example.com/run".to_string()),
            target_url: None,
        };
        let check = normalize_check(raw);
        assert_eq!(check.name, "build");
        assert_eq!(check.conclusion.as_deref(), Some("SUCCESS"));
        assert_eq!(check.details_url.as_deref(), Some("https://example.com/run"));
    }

    #[test]
    fn normalizes_a_legacy_status_context() {
        let raw = RawCheck {
            name: None,
            context: Some("ci/legacy".to_string()),
            status: None,
            state: Some("FAILURE".to_string()),
            conclusion: None,
            details_url: None,
            target_url: Some("https://example.com/status".to_string()),
        };
        let check = normalize_check(raw);
        assert_eq!(check.name, "ci/legacy");
        assert_eq!(check.status, "COMPLETED");
        assert_eq!(check.conclusion.as_deref(), Some("FAILURE"));
        assert_eq!(check.details_url.as_deref(), Some("https://example.com/status"));
    }

    #[test]
    fn parses_a_full_pr_view_payload() {
        let json = r#"{
            "number": 42,
            "title": "Add feature",
            "body": "Does the thing.",
            "url": "https://github.com/o/r/pull/42",
            "reviewDecision": "APPROVED",
            "statusCheckRollup": [
                {"name": "build", "status": "COMPLETED", "conclusion": "SUCCESS"}
            ],
            "reviews": [
                {"author": {"login": "alice"}, "state": "APPROVED", "body": "LGTM", "submittedAt": "2026-01-01T00:00:00Z"}
            ],
            "comments": [
                {"author": {"login": "bob"}, "body": "one nit", "createdAt": "2026-01-01T01:00:00Z"}
            ]
        }"#;
        let raw = parse_pr_view(json).unwrap();
        assert_eq!(raw.number, 42);
        assert_eq!(raw.review_decision.as_deref(), Some("APPROVED"));
        assert_eq!(raw.status_check_rollup.len(), 1);
        assert_eq!(raw.reviews.len(), 1);
        assert_eq!(raw.reviews[0].author.as_ref().unwrap().login, "alice");
        assert_eq!(raw.comments.len(), 1);
    }

    #[test]
    fn tolerates_missing_optional_pr_view_fields() {
        let json = r#"{
            "number": 1,
            "title": "x",
            "body": "",
            "url": "https://example.com",
            "reviewDecision": null
        }"#;
        let raw = parse_pr_view(json).unwrap();
        assert!(raw.status_check_rollup.is_empty());
        assert!(raw.reviews.is_empty());
        assert!(raw.comments.is_empty());
    }
}
