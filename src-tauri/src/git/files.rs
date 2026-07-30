use super::process::run_git;
use serde::{Deserialize, Serialize};
use std::path::Path;

pub async fn list_tracked_files(repo_path: &Path) -> Result<Vec<String>, String> {
    let output = run_git(repo_path, &["ls-files"])
        .await
        .map_err(|e| format!("failed to run git ls-files: {e}"))?;
    if !output.success {
        return Err(if output.stderr.trim().is_empty() {
            "git ls-files failed".to_string()
        } else {
            output.stderr.trim().to_string()
        });
    }
    Ok(output.stdout.lines().map(|l| l.to_string()).collect())
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FileTextContent {
    pub is_binary: bool,
    pub content: String,
}

/// Plain filesystem read, not `git show` — the embedded editor works on the
/// current on-disk state (including unsaved/uncommitted edits), not a
/// specific revision.
pub async fn read_file_text(repo_path: &Path, rel_path: &str) -> Result<FileTextContent, String> {
    let full_path = repo_path.join(rel_path);
    let bytes = tokio::fs::read(&full_path)
        .await
        .map_err(|e| format!("failed to read {rel_path}: {e}"))?;
    match String::from_utf8(bytes) {
        Ok(content) => Ok(FileTextContent { is_binary: false, content }),
        Err(_) => Ok(FileTextContent { is_binary: true, content: String::new() }),
    }
}

pub async fn write_file_text(repo_path: &Path, rel_path: &str, content: &str) -> Result<(), String> {
    let full_path = repo_path.join(rel_path);
    tokio::fs::write(&full_path, content)
        .await
        .map_err(|e| format!("failed to write {rel_path}: {e}"))
}
