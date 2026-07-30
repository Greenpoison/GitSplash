use super::process::run_git;
use serde::{Deserialize, Serialize};
use std::path::Path;

fn git_err(prefix: &str, stderr: &str) -> String {
    if stderr.trim().is_empty() {
        prefix.to_string()
    } else {
        format!("{prefix}: {}", stderr.trim())
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SubmoduleInfo {
    pub path: String,
    pub sha: String,
    /// "uninitialized" | "up-to-date" | "modified" | "conflict" — from the
    /// one-character prefix in `git submodule status`'s porcelain-ish output.
    pub status: String,
}

/// `git submodule status` lines look like ` <sha> <path> (<describe>)`, with
/// the leading character (space/`-`/`+`/`U`) indicating state and the
/// `(<describe>)` suffix optional.
fn parse_submodule_status(stdout: &str) -> Vec<SubmoduleInfo> {
    let mut result = Vec::new();
    for line in stdout.lines() {
        if line.trim().is_empty() {
            continue;
        }
        let mut chars = line.chars();
        let flag = chars.next().unwrap_or(' ');
        let rest = chars.as_str().trim_start();
        let mut parts = rest.splitn(2, ' ');
        let sha = parts.next().unwrap_or("").to_string();
        let path_and_desc = parts.next().unwrap_or("");
        let path = path_and_desc
            .split(" (")
            .next()
            .unwrap_or(path_and_desc)
            .trim()
            .to_string();
        if path.is_empty() {
            continue;
        }
        let status = match flag {
            '-' => "uninitialized",
            '+' => "modified",
            'U' => "conflict",
            _ => "up-to-date",
        }
        .to_string();
        result.push(SubmoduleInfo { path, sha, status });
    }
    result
}

pub async fn list_submodules(repo_path: &Path) -> Result<Vec<SubmoduleInfo>, String> {
    let output = run_git(repo_path, &["submodule", "status", "--recursive"])
        .await
        .map_err(|e| format!("failed to run git submodule status: {e}"))?;
    if !output.success {
        return Err(git_err("git submodule status failed", &output.stderr));
    }
    Ok(parse_submodule_status(&output.stdout))
}

/// Initializes (first run) and updates (subsequent runs) submodules in one
/// step, matching how most git GUIs expose this as a single "Update" action.
/// An empty `paths` updates every submodule; otherwise only the given ones.
pub async fn update_submodules(repo_path: &Path, paths: &[String]) -> Result<(), String> {
    let mut args = vec!["submodule", "update", "--init", "--recursive"];
    if !paths.is_empty() {
        args.push("--");
        for p in paths {
            args.push(p);
        }
    }
    let output = run_git(repo_path, &args)
        .await
        .map_err(|e| format!("failed to run git submodule update: {e}"))?;
    if !output.success {
        return Err(git_err("failed to update submodules", &output.stderr));
    }
    Ok(())
}
