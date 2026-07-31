use crate::util::no_window_tokio;
use serde::{Deserialize, Serialize};
use tokio::process::Command;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GpgKeyInfo {
    pub key_id: String,
    pub uid: String,
}

/// Existing local GPG keys the user can sign with — GitSplash doesn't
/// generate GPG keys itself (unlike the SSH signing keys it does generate),
/// since that needs safe passphrase handling; picking an already-existing
/// key from the local keyring is the standard flow GitHub's own docs
/// recommend anyway.
pub async fn list_secret_keys() -> Result<Vec<GpgKeyInfo>, String> {
    let mut cmd = Command::new("gpg");
    no_window_tokio(&mut cmd);
    let output = cmd
        .args(["--list-secret-keys", "--with-colons"])
        .output()
        .await
        .map_err(|e| format!("failed to run gpg — is GnuPG installed? ({e})"))?;
    if !output.status.success() {
        return Err(String::from_utf8_lossy(&output.stderr).trim().to_string());
    }
    Ok(parse_secret_keys(&String::from_utf8_lossy(&output.stdout)))
}

/// Parses `gpg --list-secret-keys --with-colons` records: each key starts
/// with a `sec:` line (field 5 is the long key ID) followed by one or more
/// `uid:` lines (field 10 is the user ID string) — only the first UID per
/// key is kept, which is enough for a picker.
fn parse_secret_keys(stdout: &str) -> Vec<GpgKeyInfo> {
    let mut keys = Vec::new();
    let mut current_key_id: Option<String> = None;
    let mut recorded = false;

    for line in stdout.lines() {
        let fields: Vec<&str> = line.split(':').collect();
        match fields.first() {
            Some(&"sec") => {
                current_key_id = fields.get(4).map(|s| s.to_string());
                recorded = false;
            }
            Some(&"uid") => {
                if recorded {
                    continue;
                }
                if let (Some(key_id), Some(uid)) = (current_key_id.clone(), fields.get(9)) {
                    if !uid.is_empty() {
                        keys.push(GpgKeyInfo { key_id, uid: uid.to_string() });
                        recorded = true;
                    }
                }
            }
            _ => {}
        }
    }
    keys
}

pub async fn export_public_key(key_id: &str) -> Result<String, String> {
    let mut cmd = Command::new("gpg");
    no_window_tokio(&mut cmd);
    let output = cmd
        .args(["--armor", "--export", key_id])
        .output()
        .await
        .map_err(|e| format!("failed to run gpg: {e}"))?;
    if !output.status.success() {
        return Err(String::from_utf8_lossy(&output.stderr).trim().to_string());
    }
    let armored = String::from_utf8_lossy(&output.stdout).into_owned();
    if armored.trim().is_empty() {
        return Err(format!("no public key found for {key_id}"));
    }
    Ok(armored)
}
