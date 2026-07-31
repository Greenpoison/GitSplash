use crate::util::no_window_tokio;
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
    run_git_with_env(repo_path, args, &[]).await
}

/// Same as `run_git`, but with extra environment variables set on the child
/// process. Needed for commands like `cherry-pick --continue`, which open
/// `$GIT_EDITOR` for the commit message by default — with no terminal
/// attached that would hang forever, so callers pass `GIT_EDITOR=true` to
/// make git accept the default message non-interactively.
pub async fn run_git_with_env(
    repo_path: &Path,
    args: &[&str],
    envs: &[(&str, &str)],
) -> std::io::Result<GitOutput> {
    let mut cmd = Command::new("git");
    no_window_tokio(&mut cmd);
    let output = cmd
        .arg("-C")
        .arg(repo_path)
        .args(args)
        .envs(envs.iter().copied())
        .output()
        .await?;
    Ok(GitOutput::from_output(output))
}
