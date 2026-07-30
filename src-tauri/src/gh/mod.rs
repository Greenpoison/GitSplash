use serde::{Deserialize, Serialize};
use std::path::Path;
use tokio::process::Command;

/// Fetches the stored token for a specific gh-authenticated GitHub username
/// without touching gh's globally "active" account — this is what lets
/// concurrent operations across two different GitHub identities be safe.
async fn token_for_user(username: &str) -> Result<String, String> {
    let output = Command::new("gh")
        .args(["auth", "token", "--hostname", "github.com", "--user", username])
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

async fn run_gh(repo_path: &Path, github_username: Option<&str>, args: &[&str]) -> Result<String, String> {
    let mut cmd = Command::new("gh");
    cmd.current_dir(repo_path).args(args);
    if let Some(username) = github_username {
        let token = token_for_user(username).await?;
        cmd.env("GH_TOKEN", token);
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

pub async fn is_user_authenticated(username: &str) -> bool {
    token_for_user(username).await.is_ok()
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

const PR_LIST_FIELDS: &str =
    "number,title,url,state,isDraft,headRefName,baseRefName";

pub async fn list_pull_requests(
    repo_path: &Path,
    github_username: Option<&str>,
) -> Result<Vec<PullRequestSummary>, String> {
    let stdout = run_gh(
        repo_path,
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
    run_gh(repo_path, github_username, &args).await
}

pub async fn merge_pull_request(
    repo_path: &Path,
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
        github_username,
        &["pr", "merge", &number_str, method_flag, "--delete-branch=false"],
    )
    .await
}
