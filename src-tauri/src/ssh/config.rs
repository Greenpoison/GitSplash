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
pub fn upsert_host_block(
    host_alias: &str,
    hostname: &str,
    identity_file: &Path,
) -> Result<(), String> {
    let path = config_path()?;
    let existing = read_config(&path)?;
    let stripped = strip_managed_block(&existing, host_alias);

    let begin = format!("{BEGIN_PREFIX}{host_alias} >>>");
    let end = format!("{END_PREFIX}{host_alias} <<<");
    let block = format!(
        "{begin}\nHost {host_alias}\n    HostName {hostname}\n    User git\n    IdentityFile {}\n    IdentitiesOnly yes\n{end}",
        identity_file.display()
    );

    let new_contents = if stripped.trim().is_empty() {
        format!("{block}\n")
    } else {
        format!("{stripped}\n\n{block}\n")
    };

    write_config(&path, &new_contents)
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
