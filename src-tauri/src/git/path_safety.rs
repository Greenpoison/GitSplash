use std::ffi::OsStr;
use std::path::{Path, PathBuf};

/// Resolves `rel_path` against `repo_root` and confirms it can't actually
/// escape the repo before any raw filesystem call touches it.
///
/// `repo_root.join(rel_path)` alone isn't a containment check: an absolute
/// `rel_path` replaces the base outright (`Path::join`'s documented
/// behavior), and a lexical `..` isn't caught until it's resolved against
/// the real filesystem — which also means a purely lexical check (rejecting
/// `..`/absolute paths) would still miss a symlinked directory inside the
/// repo pointing somewhere else entirely. Canonicalizing resolves both.
///
/// The target file may not exist yet (e.g. about to be written or an
/// untracked file about to be created) — canonicalize only walks a real
/// filesystem path, so this walks up to the deepest ancestor that actually
/// exists, canonicalizes *that* (resolving any symlink there), and
/// reattaches the non-existent remainder literally, since there's nothing
/// to resolve in a path segment that doesn't exist yet.
pub fn safe_repo_path(repo_root: &Path, rel_path: &str) -> Result<PathBuf, String> {
    let root = repo_root
        .canonicalize()
        .map_err(|e| format!("failed to resolve repo root: {e}"))?;

    let candidate = repo_root.join(rel_path);
    let mut existing: &Path = &candidate;
    let mut missing: Vec<&OsStr> = Vec::new();
    while !existing.exists() {
        let Some(parent) = existing.parent() else {
            return Err(format!("{rel_path} does not resolve to a valid path"));
        };
        if let Some(name) = existing.file_name() {
            missing.push(name);
        }
        existing = parent;
    }

    let mut resolved = existing
        .canonicalize()
        .map_err(|e| format!("failed to resolve {rel_path}: {e}"))?;
    for name in missing.into_iter().rev() {
        resolved.push(name);
    }

    if !resolved.starts_with(&root) {
        return Err(format!("{rel_path} escapes the repository"));
    }
    Ok(resolved)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn make_repo() -> tempfile::TempDir {
        let dir = tempfile::tempdir().unwrap();
        std::fs::create_dir_all(dir.path().join("src")).unwrap();
        std::fs::write(dir.path().join("src/existing.txt"), "hi").unwrap();
        dir
    }

    #[test]
    fn resolves_an_existing_file_inside_the_repo() {
        let repo = make_repo();
        let resolved = safe_repo_path(repo.path(), "src/existing.txt").unwrap();
        assert_eq!(resolved, repo.path().canonicalize().unwrap().join("src/existing.txt"));
    }

    #[test]
    fn resolves_a_not_yet_existing_file_in_an_existing_directory() {
        let repo = make_repo();
        let resolved = safe_repo_path(repo.path(), "src/new-file.txt").unwrap();
        assert_eq!(resolved, repo.path().canonicalize().unwrap().join("src/new-file.txt"));
    }

    #[test]
    fn rejects_a_relative_escape() {
        let repo = make_repo();
        assert!(safe_repo_path(repo.path(), "../../etc/passwd").is_err());
    }

    #[test]
    fn rejects_an_absolute_path_outside_the_repo() {
        let repo = make_repo();
        let outside = std::env::temp_dir().join("gitsplash-safe-path-test-outside.txt");
        std::fs::write(&outside, "nope").unwrap();
        assert!(safe_repo_path(repo.path(), outside.to_str().unwrap()).is_err());
    }

    #[test]
    fn rejects_a_symlinked_directory_pointing_outside_the_repo() {
        let repo = make_repo();
        let outside = tempfile::tempdir().unwrap();
        std::fs::write(outside.path().join("secret.txt"), "secret").unwrap();

        let link = repo.path().join("linked");
        #[cfg(unix)]
        std::os::unix::fs::symlink(outside.path(), &link).unwrap();
        #[cfg(windows)]
        {
            // Creating a symlink on Windows needs Developer Mode or an
            // elevated process — neither is guaranteed on a dev machine or
            // CI runner, so skip rather than fail on a platform limitation
            // unrelated to what this test is actually checking.
            if std::os::windows::fs::symlink_dir(outside.path(), &link).is_err() {
                eprintln!("skipping: creating a symlink here needs Developer Mode or admin rights");
                return;
            }
        }

        assert!(safe_repo_path(repo.path(), "linked/secret.txt").is_err());
    }
}
