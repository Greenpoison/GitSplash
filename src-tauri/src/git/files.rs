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
    /// Milliseconds since UNIX epoch, from the file's mtime at read time.
    /// The editor round-trips this back into `write_file_text` so a save can
    /// detect whether the file changed on disk since it was opened (e.g. a
    /// pull, or another tool) instead of silently overwriting that change.
    pub modified_at: Option<i64>,
}

fn mtime_millis(meta: &std::fs::Metadata) -> Option<i64> {
    let modified = meta.modified().ok()?;
    let millis = modified.duration_since(std::time::UNIX_EPOCH).ok()?.as_millis();
    i64::try_from(millis).ok()
}

/// Plain filesystem read, not `git show` — the embedded editor works on the
/// current on-disk state (including unsaved/uncommitted edits), not a
/// specific revision.
pub async fn read_file_text(repo_path: &Path, rel_path: &str) -> Result<FileTextContent, String> {
    let full_path = repo_path.join(rel_path);
    let bytes = tokio::fs::read(&full_path)
        .await
        .map_err(|e| format!("failed to read {rel_path}: {e}"))?;
    let modified_at = tokio::fs::metadata(&full_path).await.ok().and_then(|m| mtime_millis(&m));
    match String::from_utf8(bytes) {
        Ok(content) => Ok(FileTextContent { is_binary: false, content, modified_at }),
        Err(_) => Ok(FileTextContent { is_binary: true, content: String::new(), modified_at }),
    }
}

/// Returns the file's new mtime after writing, so the caller can update what
/// it treats as "the version I last saved" without a second read round-trip
/// — otherwise a second save in the same session would spuriously conflict
/// with its own prior write.
pub async fn write_file_text(
    repo_path: &Path,
    rel_path: &str,
    content: &str,
    expected_modified_at: Option<i64>,
) -> Result<Option<i64>, String> {
    let full_path = repo_path.join(rel_path);

    if let Some(expected) = expected_modified_at {
        if let Ok(meta) = tokio::fs::metadata(&full_path).await {
            if let Some(current) = mtime_millis(&meta) {
                if current != expected {
                    return Err(format!(
                        "{rel_path} changed on disk since it was opened here — reload it before saving to avoid overwriting that change"
                    ));
                }
            }
        }
    }

    tokio::fs::write(&full_path, content)
        .await
        .map_err(|e| format!("failed to write {rel_path}: {e}"))?;

    Ok(tokio::fs::metadata(&full_path).await.ok().and_then(|m| mtime_millis(&m)))
}
