use std::path::Path;
use tokio::process::Command;

/// Generates a new ed25519 keypair at `key_path` (private key) /
/// `key_path.pub` (public key) via the system `ssh-keygen` binary.
/// Fails if a file already exists at that path rather than overwriting it.
pub async fn generate_ed25519_key(key_path: &Path, comment: &str) -> Result<(), String> {
    if key_path.exists() {
        return Err(format!(
            "a key already exists at {}; refusing to overwrite",
            key_path.display()
        ));
    }
    if let Some(parent) = key_path.parent() {
        std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }

    let output = Command::new("ssh-keygen")
        .arg("-t")
        .arg("ed25519")
        .arg("-f")
        .arg(key_path)
        .arg("-N")
        .arg("") // no passphrase
        .arg("-C")
        .arg(comment)
        .arg("-q")
        .output()
        .await
        .map_err(|e| format!("failed to run ssh-keygen: {e}"))?;

    if !output.status.success() {
        return Err(format!(
            "ssh-keygen failed: {}",
            String::from_utf8_lossy(&output.stderr).trim()
        ));
    }
    Ok(())
}

pub fn read_public_key(key_path: &Path) -> Result<String, String> {
    let mut pub_path = key_path.as_os_str().to_os_string();
    pub_path.push(".pub");
    let pub_path = std::path::PathBuf::from(pub_path);
    std::fs::read_to_string(&pub_path)
        .map(|s| s.trim().to_string())
        .map_err(|e| format!("failed to read public key at {}: {e}", pub_path.display()))
}
