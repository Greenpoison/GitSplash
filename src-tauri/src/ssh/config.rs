use std::path::{Path, PathBuf};

const BEGIN_PREFIX: &str = "# >>> GitSplash managed: ";
const END_PREFIX: &str = "# <<< GitSplash managed: ";

pub fn ssh_dir() -> Result<PathBuf, String> {
    dirs::home_dir()
        .map(|home| home.join(".ssh"))
        .ok_or_else(|| "could not determine home directory".to_string())
}

pub fn config_path() -> Result<PathBuf, String> {
    Ok(ssh_dir()?.join("config"))
}

fn read_config(path: &Path) -> Result<String, String> {
    match std::fs::read_to_string(path) {
        Ok(s) => Ok(s),
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(String::new()),
        Err(e) => Err(format!("failed to read {}: {e}", path.display())),
    }
}

fn write_config(path: &Path, contents: &str) -> Result<(), String> {
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    std::fs::write(path, contents).map_err(|e| format!("failed to write {}: {e}", path.display()))
}

/// Removes a previously-written GitSplash-managed block for `host_alias`,
/// if present. Every other line (including the user's own pre-existing
/// Host entries) is left byte-for-byte untouched.
fn strip_managed_block(contents: &str, host_alias: &str) -> String {
    let begin = format!("{BEGIN_PREFIX}{host_alias} >>>");
    let end = format!("{END_PREFIX}{host_alias} <<<");
    let mut out = Vec::new();
    let mut skipping = false;
    for line in contents.lines() {
        if line.trim() == begin {
            skipping = true;
            continue;
        }
        if line.trim() == end {
            skipping = false;
            continue;
        }
        if !skipping {
            out.push(line);
        }
    }
    // Collapse the blank line we insert before each managed block if it's
    // now trailing at end-of-file or doubled up.
    let mut result = out.join("\n");
    while result.contains("\n\n\n") {
        result = result.replace("\n\n\n", "\n\n");
    }
    result.trim_end().to_string()
}

/// Writes (or replaces) the Host block that routes `host_alias` through the
/// given private key. Idempotent: re-running with the same alias updates the
/// existing GitSplash-managed block in place instead of duplicating it.
///
/// `use_https_port` routes over ssh.github.com:443 instead of the given
/// hostname on port 22 — GitHub's documented workaround for networks that
/// block outbound SSH. This is specific to github.com's own infrastructure
/// (there's no equivalent fixed hostname for GitHub Enterprise), so callers
/// should only set it when `hostname == "github.com"`.
pub fn upsert_host_block(
    host_alias: &str,
    hostname: &str,
    identity_file: &Path,
    use_https_port: bool,
) -> Result<(), String> {
    let path = config_path()?;
    let existing = read_config(&path)?;
    let stripped = strip_managed_block(&existing, host_alias);

    let begin = format!("{BEGIN_PREFIX}{host_alias} >>>");
    let end = format!("{END_PREFIX}{host_alias} <<<");
    let host_line = if use_https_port {
        "    HostName ssh.github.com\n    Port 443\n".to_string()
    } else {
        format!("    HostName {hostname}\n")
    };
    let block = format!(
        "{begin}\nHost {host_alias}\n{host_line}    User git\n    IdentityFile {}\n    IdentitiesOnly yes\n{end}",
        identity_file.display()
    );

    let new_contents = if stripped.trim().is_empty() {
        format!("{block}\n")
    } else {
        format!("{stripped}\n\n{block}\n")
    };

    write_config(&path, &new_contents)
}

/// Best-effort: records ssh.github.com's host key(s) in known_hosts, keyed
/// by the plain hostname (not "[ssh.github.com]:443") so they match what a
/// real connection over port 443 looks up. Without this, the first SSH
/// connection over the new port has no cached host key and — since this app
/// invokes git non-interactively, with no terminal for an interactive
/// "trust this host?" prompt to appear on — would fail outright instead of
/// just working. Never fails the caller: if this doesn't run, turning the
/// option on still saves, it just may need one manual `ssh -T` first.
pub async fn ensure_https_port_known_host() {
    let Ok(ssh_dir) = ssh_dir() else { return };
    let known_hosts_path = ssh_dir.join("known_hosts");
    let existing = read_config(&known_hosts_path).unwrap_or_default();
    if existing.lines().any(|l| l.trim_start().starts_with("ssh.github.com ")) {
        return;
    }

    let Ok(output) = tokio::process::Command::new("ssh-keyscan")
        .args(["-p", "443", "ssh.github.com"])
        .output()
        .await
    else {
        return;
    };

    let mut appended = String::new();
    for line in String::from_utf8_lossy(&output.stdout).lines() {
        if let Some(rest) = line.strip_prefix("[ssh.github.com]:443 ") {
            appended.push_str("ssh.github.com ");
            appended.push_str(rest);
            appended.push('\n');
        }
    }
    if appended.is_empty() {
        return;
    }

    let mut new_contents = existing;
    if !new_contents.is_empty() && !new_contents.ends_with('\n') {
        new_contents.push('\n');
    }
    new_contents.push_str(&appended);
    let _ = write_config(&known_hosts_path, &new_contents);
}

pub fn remove_host_block(host_alias: &str) -> Result<(), String> {
    let path = config_path()?;
    let existing = read_config(&path)?;
    let stripped = strip_managed_block(&existing, host_alias);
    let new_contents = if stripped.trim().is_empty() {
        String::new()
    } else {
        format!("{stripped}\n")
    };
    write_config(&path, &new_contents)
}
