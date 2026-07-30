use super::process::run_git;
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
