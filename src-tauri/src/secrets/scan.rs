use serde::{Deserialize, Serialize};
use std::path::Path;
use walkdir::WalkDir;

const SKIP_DIRS: &[&str] = &[
    ".git",
    "node_modules",
    "target",
    "dist",
    "build",
    ".venv",
    "venv",
    "__pycache__",
    ".next",
    ".turbo",
];

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SecretFile {
    pub relative_path: String,
    pub absolute_path: String,
    pub size_bytes: u64,
}

fn looks_like_secret(file_name: &str) -> bool {
    let lower = file_name.to_ascii_lowercase();
    lower.starts_with(".env")
        || lower.ends_with(".pem")
        || lower.ends_with(".key")
        || lower.ends_with(".pfx")
        || lower.ends_with(".p12")
        || lower == "secrets.json"
        || lower == "secrets.yaml"
        || lower == "secrets.yml"
        || lower == "credentials.json"
        || lower == "credentials.yaml"
        || lower.starts_with("id_rsa")
        || lower.starts_with("id_ed25519")
        || lower.starts_with("id_ecdsa")
}

/// Scans a single already-registered repo (never anything outside it) for
/// files that look like secrets, bounded to a shallow depth so it stays
/// fast on large repos.
pub fn scan_repo_for_secrets(repo_path: &Path) -> Vec<SecretFile> {
    let mut found = Vec::new();
    let walker = WalkDir::new(repo_path)
        .max_depth(8)
        .into_iter()
        .filter_entry(|entry| {
            if entry.file_type().is_dir() {
                let name = entry.file_name().to_string_lossy();
                !SKIP_DIRS.contains(&name.as_ref())
            } else {
                true
            }
        });

    for entry in walker.filter_map(|e| e.ok()) {
        if !entry.file_type().is_file() {
            continue;
        }
        let file_name = entry.file_name().to_string_lossy();
        if !looks_like_secret(&file_name) {
            continue;
        }
        let Ok(metadata) = entry.metadata() else {
            continue;
        };
        let relative = entry
            .path()
            .strip_prefix(repo_path)
            .unwrap_or(entry.path())
            .to_string_lossy()
            .replace('\\', "/");
        found.push(SecretFile {
            relative_path: relative,
            absolute_path: entry.path().to_string_lossy().to_string(),
            size_bytes: metadata.len(),
        });
    }
    found
}
