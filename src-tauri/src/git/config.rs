use super::process::run_git;
use std::path::Path;

/// Configures this repo (repo-level, not global) to sign commits with the
/// given account's SSH signing key.
pub async fn set_signing_config(repo_path: &Path, signing_key_path: &str) -> Result<(), String> {
    for args in [
        vec!["config", "gpg.format", "ssh"],
        vec!["config", "user.signingkey", signing_key_path],
        vec!["config", "commit.gpgsign", "true"],
    ] {
        let output = run_git(repo_path, &args)
            .await
            .map_err(|e| format!("failed to run git config: {e}"))?;
        if !output.success {
            return Err(format!(
                "git config {} failed: {}",
                args.join(" "),
                output.stderr.trim()
            ));
        }
    }
    Ok(())
}

/// Configures this repo to sign commits with a GPG key instead of SSH.
pub async fn set_gpg_signing_config(repo_path: &Path, gpg_key_id: &str) -> Result<(), String> {
    for args in [
        vec!["config", "gpg.format", "openpgp"],
        vec!["config", "user.signingkey", gpg_key_id],
        vec!["config", "commit.gpgsign", "true"],
    ] {
        let output = run_git(repo_path, &args)
            .await
            .map_err(|e| format!("failed to run git config: {e}"))?;
        if !output.success {
            return Err(format!(
                "git config {} failed: {}",
                args.join(" "),
                output.stderr.trim()
            ));
        }
    }
    Ok(())
}

/// Best-effort removal of repo-level signing config (e.g. when a repo is
/// unassigned from an account). Missing keys are not an error.
pub async fn clear_signing_config(repo_path: &Path) -> Result<(), String> {
    for args in [
        vec!["config", "--unset", "gpg.format"],
        vec!["config", "--unset", "user.signingkey"],
        vec!["config", "--unset", "commit.gpgsign"],
    ] {
        run_git(repo_path, &args).await.ok();
    }
    Ok(())
}
