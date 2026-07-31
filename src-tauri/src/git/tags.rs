use super::process::run_git;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::path::Path;

const FIELD_SEP: char = '\u{1f}';
const RECORD_SEP: char = '\u{1e}';

fn git_err(prefix: &str, stderr: &str) -> String {
    if stderr.trim().is_empty() {
        prefix.to_string()
    } else {
        format!("{prefix}: {}", stderr.trim())
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TagInfo {
    pub name: String,
    /// The commit the tag ultimately resolves to — for an annotated tag
    /// this is the peeled (`*objectname`) value, not the tag object's own
    /// hash, so it's directly usable anywhere a commit-ish is expected
    /// (diffing, browsing files, etc).
    pub hash: String,
    pub is_annotated: bool,
    pub message: Option<String>,
    pub tagger: Option<String>,
    pub date: Option<String>,
}

/// Every local tag, one `for-each-ref` call regardless of count. Lightweight
/// tags have no tag object to peel — `objecttype` is "commit" and
/// `objectname` already is the commit hash directly; annotated tags have
/// `objecttype` "tag" with `objectname` pointing at the tag object, so the
/// commit comes from the peeled `*objectname` field instead.
pub async fn list_tags(repo_path: &Path) -> Result<Vec<TagInfo>, String> {
    let format = format!(
        "%(refname:short){FIELD_SEP}%(objectname){FIELD_SEP}%(*objectname){FIELD_SEP}%(objecttype){FIELD_SEP}%(contents:subject){FIELD_SEP}%(taggername){FIELD_SEP}%(taggerdate:iso-strict){RECORD_SEP}"
    );
    let output = run_git(
        repo_path,
        &["for-each-ref", "--sort=-creatordate", &format!("--format={format}"), "refs/tags"],
    )
    .await
    .map_err(|e| format!("failed to list tags: {e}"))?;
    if !output.success {
        return Err(git_err("git for-each-ref failed", &output.stderr));
    }

    let mut tags = Vec::new();
    for record in output.stdout.split(RECORD_SEP) {
        let record = record.trim();
        if record.is_empty() {
            continue;
        }
        let fields: Vec<&str> = record.split(FIELD_SEP).collect();
        if fields.len() < 7 {
            continue;
        }
        let is_annotated = fields[3] == "tag";
        let hash = if is_annotated && !fields[2].is_empty() {
            fields[2].to_string()
        } else {
            fields[1].to_string()
        };
        tags.push(TagInfo {
            name: fields[0].to_string(),
            hash,
            is_annotated,
            message: (is_annotated && !fields[4].is_empty()).then(|| fields[4].to_string()),
            tagger: (is_annotated && !fields[5].is_empty()).then(|| fields[5].to_string()),
            date: (is_annotated && !fields[6].is_empty()).then(|| fields[6].to_string()),
        });
    }
    Ok(tags)
}

/// Creates a new tag, or moves an existing one when `force` is set.
/// Annotated when `message` is given, lightweight otherwise.
pub async fn create_tag(
    repo_path: &Path,
    name: &str,
    target: &str,
    message: Option<&str>,
    force: bool,
) -> Result<(), String> {
    let mut args = vec!["tag"];
    if force {
        args.push("-f");
    }
    if let Some(m) = message {
        args.extend(["-a", name, "-m", m, target]);
    } else {
        args.extend([name, target]);
    }
    let output = run_git(repo_path, &args)
        .await
        .map_err(|e| format!("failed to run git tag: {e}"))?;
    if !output.success {
        return Err(git_err("could not create tag", &output.stderr));
    }
    Ok(())
}

pub async fn delete_tag(repo_path: &Path, name: &str) -> Result<(), String> {
    let output = run_git(repo_path, &["tag", "-d", name])
        .await
        .map_err(|e| format!("failed to run git tag -d: {e}"))?;
    if !output.success {
        return Err(git_err("could not delete tag", &output.stderr));
    }
    Ok(())
}

pub async fn push_tag(repo_path: &Path, name: &str, force: bool) -> Result<(), String> {
    let mut args = vec!["push", "origin"];
    if force {
        args.push("--force");
    }
    args.push(name);
    let output = run_git(repo_path, &args)
        .await
        .map_err(|e| format!("failed to run git push: {e}"))?;
    if !output.success {
        return Err(git_err("could not push tag", &output.stderr));
    }
    Ok(())
}

pub async fn push_all_tags(repo_path: &Path) -> Result<(), String> {
    let output = run_git(repo_path, &["push", "origin", "--tags"])
        .await
        .map_err(|e| format!("failed to run git push: {e}"))?;
    if !output.success {
        return Err(git_err("could not push tags", &output.stderr));
    }
    Ok(())
}

pub async fn delete_remote_tag(repo_path: &Path, name: &str) -> Result<(), String> {
    let output = run_git(repo_path, &["push", "origin", "--delete", name])
        .await
        .map_err(|e| format!("failed to run git push: {e}"))?;
    if !output.success {
        return Err(git_err("could not delete remote tag", &output.stderr));
    }
    Ok(())
}

/// Updates local knowledge of what's on the remote — `--force` so a tag
/// that moved on the remote (re-tagged a release, say) overwrites the local
/// one instead of failing with "would clobber existing tag".
pub async fn fetch_tags(repo_path: &Path) -> Result<(), String> {
    let output = run_git(repo_path, &["fetch", "origin", "--tags", "--force"])
        .await
        .map_err(|e| format!("failed to run git fetch: {e}"))?;
    if !output.success {
        return Err(git_err("could not fetch tags", &output.stderr));
    }
    Ok(())
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RemoteTag {
    pub name: String,
    pub hash: String,
}

/// Live snapshot of what tags actually exist on the remote right now —
/// doesn't touch local refs, unlike `fetch_tags`, so the UI can show
/// in-sync/stale/local-only status without mutating anything.
pub async fn list_remote_tags(repo_path: &Path) -> Result<Vec<RemoteTag>, String> {
    let output = run_git(repo_path, &["ls-remote", "--tags", "origin"])
        .await
        .map_err(|e| format!("failed to run git ls-remote: {e}"))?;
    if !output.success {
        return Err(git_err("could not list remote tags", &output.stderr));
    }

    // Annotated tags show up as two lines — "refs/tags/x" (the tag object's
    // own hash) and "refs/tags/x^{}" (peeled to the commit, same as what
    // list_tags reports for the local side) — so the peeled line always
    // wins when both are present, regardless of which order they arrive in.
    let mut plain: HashMap<String, String> = HashMap::new();
    let mut peeled: HashMap<String, String> = HashMap::new();
    for line in output.stdout.lines() {
        let mut parts = line.splitn(2, '\t');
        let sha = parts.next().unwrap_or("").trim();
        let refname = parts.next().unwrap_or("").trim();
        let Some(name) = refname.strip_prefix("refs/tags/") else { continue };
        if let Some(base) = name.strip_suffix("^{}") {
            peeled.insert(base.to_string(), sha.to_string());
        } else {
            plain.insert(name.to_string(), sha.to_string());
        }
    }
    for (name, sha) in peeled {
        plain.insert(name, sha);
    }
    Ok(plain.into_iter().map(|(name, hash)| RemoteTag { name, hash }).collect())
}
