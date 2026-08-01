use super::diff::{parse_diff, FileDiff};
use super::process::run_git;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::path::Path;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CompareFile {
    pub path: String,
    pub orig_path: Option<String>,
    /// "added" | "modified" | "deleted" | "renamed" | "copied"
    pub status: String,
    /// None for a binary file (git doesn't count lines for those), or for a
    /// rename/copy whose numstat path didn't match — best-effort, not shown
    /// rather than guessed at.
    pub insertions: Option<u32>,
    pub deletions: Option<u32>,
}

/// Parses `--numstat` output ("<ins>\t<del>\t<path>", or "-\t-\t<path>" for
/// a binary file) into a path -> (insertions, deletions) lookup.
pub(crate) fn parse_numstat(stdout: &str) -> HashMap<String, (Option<u32>, Option<u32>)> {
    let mut map = HashMap::new();
    for line in stdout.lines() {
        let mut parts = line.splitn(3, '\t');
        let (Some(ins), Some(del), Some(path)) = (parts.next(), parts.next(), parts.next()) else {
            continue;
        };
        map.insert(path.to_string(), (ins.parse().ok(), del.parse().ok()));
    }
    map
}

pub(crate) fn apply_numstat(files: &mut [CompareFile], stats: &HashMap<String, (Option<u32>, Option<u32>)>) {
    for file in files.iter_mut() {
        if let Some((ins, del)) = stats.get(&file.path) {
            file.insertions = *ins;
            file.deletions = *del;
        }
    }
}

fn status_name(code: char) -> &'static str {
    match code {
        'A' => "added",
        'D' => "deleted",
        'R' => "renamed",
        'C' => "copied",
        _ => "modified",
    }
}

/// Lists files that differ between `branch` and `base`, using three-dot
/// (`base...branch`) semantics — i.e. what `branch` would bring in if
/// merged into `base` right now, diffed against their merge-base rather
/// than a raw tip-to-tip comparison.
pub async fn compare_branches(repo_path: &Path, base: &str, branch: &str) -> Result<Vec<CompareFile>, String> {
    let range = format!("{base}...{branch}");
    let output = run_git(repo_path, &["diff", "--no-color", "--name-status", "-M", &range])
        .await
        .map_err(|e| format!("failed to run git diff: {e}"))?;
    if !output.success {
        return Err(if output.stderr.trim().is_empty() {
            "git diff failed".to_string()
        } else {
            output.stderr.trim().to_string()
        });
    }

    let mut files = Vec::new();
    for line in output.stdout.lines() {
        let mut parts = line.split('\t');
        let code = match parts.next() {
            Some(c) if !c.is_empty() => c,
            _ => continue,
        };
        let status = status_name(code.chars().next().unwrap());
        if status == "renamed" || status == "copied" {
            let orig = parts.next().unwrap_or("").to_string();
            let new_path = parts.next().unwrap_or("").to_string();
            files.push(CompareFile {
                path: new_path,
                orig_path: Some(orig),
                status: status.to_string(),
                insertions: None,
                deletions: None,
            });
        } else {
            let path = parts.next().unwrap_or("").to_string();
            files.push(CompareFile { path, orig_path: None, status: status.to_string(), insertions: None, deletions: None });
        }
    }

    if let Ok(numstat_output) = run_git(repo_path, &["diff", "--no-color", "--numstat", "-M", &range]).await {
        if numstat_output.success {
            apply_numstat(&mut files, &parse_numstat(&numstat_output.stdout));
        }
    }

    Ok(files)
}

/// Same idea as `diff::get_file_diff`, but between two refs instead of the
/// working tree/index — reuses the same hunk parser so the result renders
/// through the existing DiffHunkView on the frontend unchanged.
pub async fn get_compare_file_diff(
    repo_path: &Path,
    base: &str,
    branch: &str,
    rel_path: &str,
) -> Result<FileDiff, String> {
    let range = format!("{base}...{branch}");
    let output = run_git(repo_path, &["diff", "--no-color", &range, "--", rel_path])
        .await
        .map_err(|e| format!("failed to run git diff: {e}"))?;
    if !output.success {
        return Err(if output.stderr.trim().is_empty() {
            "git diff failed".to_string()
        } else {
            output.stderr.trim().to_string()
        });
    }
    if output.stdout.contains("Binary files ") || output.stdout.contains("GIT binary patch") {
        return Ok(FileDiff { is_binary: true, hunks: vec![] });
    }
    let (_, hunks) = parse_diff(&output.stdout);
    Ok(FileDiff { is_binary: false, hunks })
}

/// Every file that exists in `branch`'s tree — used to browse files
/// unaffected by the diff too, not just the changed ones.
pub async fn list_branch_files(repo_path: &Path, branch: &str) -> Result<Vec<String>, String> {
    let output = run_git(repo_path, &["ls-tree", "-r", "--name-only", branch])
        .await
        .map_err(|e| format!("failed to run git ls-tree: {e}"))?;
    if !output.success {
        return Err(if output.stderr.trim().is_empty() {
            "git ls-tree failed".to_string()
        } else {
            output.stderr.trim().to_string()
        });
    }
    Ok(output.stdout.lines().map(|l| l.to_string()).collect())
}

/// A file's content as it exists in `branch`'s tree — not the working
/// directory, so this works without checking the branch out.
pub async fn read_branch_file(repo_path: &Path, branch: &str, rel_path: &str) -> Result<Option<String>, String> {
    let output = run_git(repo_path, &["show", &format!("{branch}:{rel_path}")])
        .await
        .map_err(|e| format!("failed to run git show: {e}"))?;
    if !output.success {
        // Most likely the file doesn't exist on this branch (e.g. added
        // only on the current side) — not a real error, just "no content".
        return Ok(None);
    }
    Ok(Some(output.stdout))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_insertions_and_deletions_per_path() {
        let stdout = "3\t1\tsrc/main.rs\n0\t12\tsrc/old.rs";
        let stats = parse_numstat(stdout);
        assert_eq!(stats.get("src/main.rs"), Some(&(Some(3), Some(1))));
        assert_eq!(stats.get("src/old.rs"), Some(&(Some(0), Some(12))));
    }

    #[test]
    fn treats_a_binary_files_dashes_as_unknown() {
        let stats = parse_numstat("-\t-\tassets/logo.png");
        assert_eq!(stats.get("assets/logo.png"), Some(&(None, None)));
    }

    #[test]
    fn ignores_unparseable_lines() {
        assert!(parse_numstat("not a numstat line").is_empty());
        assert!(parse_numstat("").is_empty());
    }

    #[test]
    fn apply_numstat_only_touches_matching_paths() {
        let mut files = vec![
            CompareFile { path: "a.rs".into(), orig_path: None, status: "modified".into(), insertions: None, deletions: None },
            CompareFile { path: "b.rs".into(), orig_path: None, status: "modified".into(), insertions: None, deletions: None },
        ];
        let stats = parse_numstat("5\t2\ta.rs");
        apply_numstat(&mut files, &stats);
        assert_eq!(files[0].insertions, Some(5));
        assert_eq!(files[0].deletions, Some(2));
        assert_eq!(files[1].insertions, None);
    }
}
