use crate::git::path_safety::safe_repo_path;
use std::fs::File;
use std::io::{Read, Write};
use std::path::Path;
use zip::write::SimpleFileOptions;
use zip::{AesMode, CompressionMethod, ZipWriter};

/// Bundles the given repo-relative file paths into a zip at
/// `dest_zip_path`, preserving each file's path relative to `repo_root`.
/// Takes relative paths rather than absolute ones specifically so this can
/// validate every one of them stays inside `repo_root` before opening
/// anything — the frontend flags candidates by scanning the repo, but this
/// is a Tauri IPC command, reachable with arbitrary arguments from anything
/// running in the webview, so the boundary that actually matters is here,
/// not "the UI only ever shows in-repo files."
///
/// When `password` is Some, every entry is AES-256 encrypted; the resulting
/// zip is unreadable without that password (including by tools that don't
/// support AES zip encryption, which will refuse to open it at all — that's
/// expected).
pub fn export_secrets_zip(
    files: &[String],
    repo_root: &Path,
    dest_zip_path: &Path,
    password: Option<&str>,
) -> Result<(), String> {
    if files.is_empty() {
        return Err("no files selected to export".to_string());
    }

    let resolved: Vec<(String, std::path::PathBuf)> = files
        .iter()
        .map(|rel_path| safe_repo_path(repo_root, rel_path).map(|full| (rel_path.replace('\\', "/"), full)))
        .collect::<Result<_, _>>()?;

    let zip_file = File::create(dest_zip_path)
        .map_err(|e| format!("failed to create {}: {e}", dest_zip_path.display()))?;
    let mut writer = ZipWriter::new(zip_file);

    for (relative, full_path) in resolved {
        let mut options = SimpleFileOptions::default().compression_method(CompressionMethod::Deflated);
        if let Some(pw) = password {
            options = options.with_aes_encryption(AesMode::Aes256, pw);
        }

        writer
            .start_file(relative.clone(), options)
            .map_err(|e| format!("failed to start zip entry {relative}: {e}"))?;

        let mut contents = Vec::new();
        File::open(&full_path)
            .map_err(|e| format!("failed to open {relative}: {e}"))?
            .read_to_end(&mut contents)
            .map_err(|e| format!("failed to read {relative}: {e}"))?;
        writer
            .write_all(&contents)
            .map_err(|e| format!("failed to write zip entry {relative}: {e}"))?;
    }

    writer
        .finish()
        .map_err(|e| format!("failed to finalize zip: {e}"))?;
    Ok(())
}
