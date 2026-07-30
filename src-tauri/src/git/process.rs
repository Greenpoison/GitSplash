use std::path::Path;
use std::process::Output;
use tokio::process::Command;

pub struct GitOutput {
    pub success: bool,
    pub stdout: String,
    pub stderr: String,
}

impl GitOutput {
    fn from_output(output: Output) -> Self {
        Self {
            success: output.status.success(),
            stdout: String::from_utf8_lossy(&output.stdout).into_owned(),
            stderr: String::from_utf8_lossy(&output.stderr).into_owned(),
        }
    }
}

/// Runs `git <args>` with the repo path as the working directory via `-C`.
/// Shells out to the system git binary (not a vendored git library) so it
/// transparently picks up the user's global git config, credential helpers,
/// and the SSH host aliases GitSplash manages in ~/.ssh/config.
pub async fn run_git(repo_path: &Path, args: &[&str]) -> std::io::Result<GitOutput> {
    let output = Command::new("git")
        .arg("-C")
        .arg(repo_path)
        .args(args)
        .output()
        .await?;
    Ok(GitOutput::from_output(output))
}
