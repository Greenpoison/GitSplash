use super::process::run_git;
use serde::{Deserialize, Serialize};
use std::collections::HashSet;
use std::path::Path;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CommitNode {
    pub hash: String,
    pub parents: Vec<String>,
    pub refs: Vec<String>,
    pub subject: String,
    /// The extended commit message body (everything after the subject
    /// line's blank-line separator) — empty when there isn't one. Lets the
    /// UI offer a quick peek at what a commit was actually about beyond its
    /// one-line subject, without a separate round-trip per commit.
    pub body: String,
    pub author: String,
    pub date: String,
}

const FIELD_SEP: char = '\u{1f}';
const RECORD_SEP: char = '\u{1e}';

fn log_format() -> String {
    format!("%H{FIELD_SEP}%P{FIELD_SEP}%D{FIELD_SEP}%s{FIELD_SEP}%an{FIELD_SEP}%ad{FIELD_SEP}%b{RECORD_SEP}")
}

fn parse_log_records(stdout: &str) -> Vec<CommitNode> {
    let mut nodes = Vec::new();
    for record in stdout.split(RECORD_SEP) {
        let record = record.trim();
        if record.is_empty() {
            continue;
        }
        let fields: Vec<&str> = record.split(FIELD_SEP).collect();
        if fields.len() < 7 {
            continue;
        }
        let parents = fields[1]
            .split_whitespace()
            .map(|s| s.to_string())
            .collect();
        let refs = fields[2]
            .split(',')
            .map(|s| s.trim().to_string())
            .filter(|s| !s.is_empty())
            .collect();
        nodes.push(CommitNode {
            hash: fields[0].to_string(),
            parents,
            refs,
            subject: fields[3].to_string(),
            body: fields[6].trim().to_string(),
            author: fields[4].to_string(),
            date: fields[5].to_string(),
        });
    }
    nodes
}

/// A single commit by any commit-ish (hash, branch, tag, etc.) — lets the
/// frontend reuse CommitDetailDialog for things that resolve to a commit
/// but aren't already a CommitNode from a graph/history call, like a tag.
pub async fn get_commit(repo_path: &Path, rev: &str) -> Result<Option<CommitNode>, String> {
    // `rev` is a revision, not a path, so `git log`'s usual `--` (which
    // means "everything after this is a path") isn't the right separator
    // here — `--end-of-options` stops option parsing without that pathspec
    // implication, so a `rev` crafted to look like a flag (e.g.
    // `--output=...`, which git log would otherwise happily obey) is
    // treated as a literal, almost certainly invalid revision instead.
    let output = run_git(
        repo_path,
        &[
            "log",
            "-n1",
            "--date=iso-strict",
            &format!("--pretty=format:{}", log_format()),
            "--end-of-options",
            rev,
        ],
    )
    .await
    .map_err(|e| format!("failed to run git log: {e}"))?;
    if !output.success {
        return Err(if output.stderr.trim().is_empty() {
            "git log failed".to_string()
        } else {
            output.stderr.trim().to_string()
        });
    }
    Ok(parse_log_records(&output.stdout).into_iter().next())
}

/// Returns recent commit topology across local branches (hash, parents,
/// ref decorations) so the frontend can lay out a lane graph. Lane
/// positioning is left to the UI layer; Rust only supplies raw topology.
pub async fn get_commit_graph(repo_path: &Path, limit: u32) -> Result<Vec<CommitNode>, String> {
    let limit_arg = format!("-n{limit}");
    let output = run_git(
        repo_path,
        &[
            "log",
            "--branches",
            "--topo-order",
            "--date=iso-strict",
            &format!("--pretty=format:{}", log_format()),
            &limit_arg,
        ],
    )
    .await
    .map_err(|e| format!("failed to run git log: {e}"))?;

    if !output.success {
        return Err(if output.stderr.trim().is_empty() {
            "git log failed".to_string()
        } else {
            output.stderr.trim().to_string()
        });
    }
    Ok(parse_log_records(&output.stdout))
}

/// Commits reachable from `range_expr` (e.g. `"main..HEAD"`), oldest first —
/// the order an interactive rebase plan is built and displayed in, since the
/// oldest commit in the range is applied first.
pub async fn get_range_commits(repo_path: &Path, range_expr: &str) -> Result<Vec<CommitNode>, String> {
    let output = run_git(
        repo_path,
        &[
            "log",
            "--topo-order",
            "--reverse",
            "--date=iso-strict",
            &format!("--pretty=format:{}", log_format()),
            range_expr,
        ],
    )
    .await
    .map_err(|e| format!("failed to run git log: {e}"))?;

    if !output.success {
        return Err(if output.stderr.trim().is_empty() {
            "git log failed".to_string()
        } else {
            output.stderr.trim().to_string()
        });
    }
    Ok(parse_log_records(&output.stdout))
}

/// History of a single file, following renames across its lifetime.
pub async fn get_file_history(repo_path: &Path, rel_path: &str, limit: u32) -> Result<Vec<CommitNode>, String> {
    let limit_arg = format!("-n{limit}");
    let output = run_git(
        repo_path,
        &[
            "log",
            "--follow",
            "--date=iso-strict",
            &format!("--pretty=format:{}", log_format()),
            &limit_arg,
            "--",
            rel_path,
        ],
    )
    .await
    .map_err(|e| format!("failed to run git log: {e}"))?;

    if !output.success {
        return Err(if output.stderr.trim().is_empty() {
            "git log failed".to_string()
        } else {
            output.stderr.trim().to_string()
        });
    }
    Ok(parse_log_records(&output.stdout))
}

/// History of a single file across every local branch, not just the
/// currently checked-out one — for tracking a file within a multi-branch
/// view (e.g. the commit-universe graph, which is itself built from
/// `--branches`) where a file's history on an unmerged branch would
/// otherwise be invisible. Drops `--follow`'s rename tracking in exchange:
/// `--follow` only supports following a single line of history from one
/// starting point, which doesn't have defined behavior across several
/// branch tips at once.
pub async fn get_file_history_across_branches(
    repo_path: &Path,
    rel_path: &str,
    limit: u32,
) -> Result<Vec<CommitNode>, String> {
    let limit_arg = format!("-n{limit}");
    let output = run_git(
        repo_path,
        &[
            "log",
            "--branches",
            "--topo-order",
            "--date=iso-strict",
            &format!("--pretty=format:{}", log_format()),
            &limit_arg,
            "--",
            rel_path,
        ],
    )
    .await
    .map_err(|e| format!("failed to run git log: {e}"))?;

    if !output.success {
        return Err(if output.stderr.trim().is_empty() {
            "git log failed".to_string()
        } else {
            output.stderr.trim().to_string()
        });
    }
    Ok(parse_log_records(&output.stdout))
}

/// Searches commit history across all local branches by message/author text,
/// or — when `search_content` is set — by content added/removed in a commit's
/// diff (`git log -S`, aka "pickaxe"), which is how you find "who
/// added/removed this line of code" without knowing which commit to look at.
/// Message and author matches are run as separate queries and merged, since
/// git ANDs `--grep`/`--author` together rather than OR-ing them.
pub async fn search_commits(
    repo_path: &Path,
    query: &str,
    search_content: bool,
    limit: u32,
) -> Result<Vec<CommitNode>, String> {
    let limit_arg = format!("-n{limit}");
    let format_arg = format!("--pretty=format:{}", log_format());

    if search_content {
        let output = run_git(
            repo_path,
            &[
                "log",
                "--all",
                "--date=iso-strict",
                &format_arg,
                &limit_arg,
                "--pickaxe-regex",
                "-S",
                query,
            ],
        )
        .await
        .map_err(|e| format!("failed to run git log: {e}"))?;
        if !output.success {
            return Err(if output.stderr.trim().is_empty() {
                "git log failed".to_string()
            } else {
                output.stderr.trim().to_string()
            });
        }
        return Ok(parse_log_records(&output.stdout));
    }

    let by_message = run_git(
        repo_path,
        &[
            "log",
            "--all",
            "--date=iso-strict",
            "--regexp-ignore-case",
            &format_arg,
            &limit_arg,
            "--grep",
            query,
        ],
    )
    .await
    .map_err(|e| format!("failed to run git log: {e}"))?;
    if !by_message.success {
        return Err(if by_message.stderr.trim().is_empty() {
            "git log failed".to_string()
        } else {
            by_message.stderr.trim().to_string()
        });
    }

    let by_author = run_git(
        repo_path,
        &[
            "log",
            "--all",
            "--date=iso-strict",
            "--regexp-ignore-case",
            &format_arg,
            &limit_arg,
            "--author",
            query,
        ],
    )
    .await
    .map_err(|e| format!("failed to run git log: {e}"))?;
    if !by_author.success {
        return Err(if by_author.stderr.trim().is_empty() {
            "git log failed".to_string()
        } else {
            by_author.stderr.trim().to_string()
        });
    }

    let mut seen = std::collections::HashSet::new();
    let mut merged = Vec::new();
    for node in parse_log_records(&by_message.stdout)
        .into_iter()
        .chain(parse_log_records(&by_author.stdout))
    {
        if seen.insert(node.hash.clone()) {
            merged.push(node);
        }
    }
    merged.sort_by(|a, b| b.date.cmp(&a.date));
    merged.truncate(limit as usize);
    Ok(merged)
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BranchInfo {
    pub name: String,
    pub is_current: bool,
    pub upstream: Option<String>,
    /// Whether this branch's tip is already an ancestor of HEAD — i.e. fully
    /// merged into whatever's currently checked out, so its own history
    /// doesn't hold anything not already reachable from HEAD. Lets the UI
    /// hide these by default instead of piling up dead branch chips after
    /// every merge.
    pub is_merged: bool,
    /// True when this branch is merged *and* no remote has a branch by this
    /// name — i.e. its work already made it into history and there's
    /// nothing left on any remote to still track. Deliberately broader than
    /// git's own "gone" (`branch.<x>.merge` pointing at a since-deleted
    /// ref): that only fires for branches that had upstream tracking
    /// configured in the first place, which misses branches checked out
    /// without `--track` (e.g. via a PR checkout) — those never get a
    /// "gone" marker even after their remote branch is deleted, despite
    /// being just as safe to clean up. Deliberately NOT set for anything
    /// unmerged, so a legitimate local-only WIP branch is never suggested
    /// for deletion just because it was never pushed.
    pub is_gone: bool,
    /// True for a synthetic entry standing in for a remote-tracking branch
    /// that has no local branch of the same name yet — e.g. a teammate's
    /// branch that only just showed up after a fetch. `name` is the full
    /// remote-tracking ref (e.g. "origin/feature/x") rather than a local
    /// branch name, so it resolves directly wherever a ref is expected
    /// (rebase onto, diff, merge) without first requiring `git branch
    /// --track`.
    pub is_remote: bool,
}

pub async fn list_branches(repo_path: &Path) -> Result<Vec<BranchInfo>, String> {
    let format = format!("%(HEAD){FIELD_SEP}%(refname:short){FIELD_SEP}%(upstream:short){RECORD_SEP}");
    let output = run_git(
        repo_path,
        &["for-each-ref", "refs/heads", &format!("--format={format}")],
    )
    .await
    .map_err(|e| format!("failed to list branches: {e}"))?;

    if !output.success {
        return Err(if output.stderr.trim().is_empty() {
            "git for-each-ref failed".to_string()
        } else {
            output.stderr.trim().to_string()
        });
    }

    // Best-effort: if either of these fails, nothing gets flagged as merged
    // or gone (the safe default — never hides or suggests deleting a
    // branch it isn't sure about).
    let merged: HashSet<String> = run_git(
        repo_path,
        &["for-each-ref", "refs/heads", "--format=%(refname:short)", "--merged=HEAD"],
    )
    .await
    .ok()
    .filter(|o| o.success)
    .map(|o| o.stdout.lines().map(|l| l.trim().to_string()).filter(|l| !l.is_empty()).collect())
    .unwrap_or_default();

    // refname:strip=3 drops "refs", "remotes", and the remote name, leaving
    // just the branch name — correct even when that name itself contains
    // slashes (e.g. refs/remotes/origin/feature/foo -> feature/foo).
    let remote_branch_names: HashSet<String> = run_git(
        repo_path,
        &["for-each-ref", "refs/remotes", "--format=%(refname:strip=3)"],
    )
    .await
    .ok()
    .filter(|o| o.success)
    .map(|o| o.stdout.lines().map(|l| l.trim().to_string()).filter(|l| !l.is_empty()).collect())
    .unwrap_or_default();

    let mut branches = Vec::new();
    for record in output.stdout.split(RECORD_SEP) {
        let record = record.trim();
        if record.is_empty() {
            continue;
        }
        let fields: Vec<&str> = record.split(FIELD_SEP).collect();
        if fields.len() < 3 {
            continue;
        }
        let name = fields[1].to_string();
        let is_current = fields[0] == "*";
        let is_merged = merged.contains(&name);
        branches.push(BranchInfo {
            is_current,
            is_merged,
            is_gone: is_merged && !is_current && !remote_branch_names.contains(&name),
            name,
            upstream: if fields[2].is_empty() {
                None
            } else {
                Some(fields[2].to_string())
            },
            is_remote: false,
        });
    }

    // Remote-tracking branches with no local branch of the same name — most
    // often a branch a teammate pushed that was never checked out here.
    // Without this, they're invisible to both the rebase-onto picker and the
    // branch switcher even right after a fetch, since fetch only ever
    // updates refs/remotes/* and never creates a local branch.
    let local_names: HashSet<String> = branches.iter().map(|b| b.name.clone()).collect();
    // Needed to correctly split a remote-tracking ref's short name apart
    // from the remote's own name: a remote's name can itself contain
    // slashes (git allows `git remote add "my/remote" <url>`), so naively
    // splitting off just the first path segment would cut a multi-segment
    // remote name short and produce the wrong branch name.
    let remote_names: Vec<String> = run_git(repo_path, &["remote"])
        .await
        .ok()
        .filter(|o| o.success)
        .map(|o| o.stdout.lines().map(|l| l.trim().to_string()).filter(|l| !l.is_empty()).collect())
        .unwrap_or_default();
    let remote_refs: Vec<String> = run_git(
        repo_path,
        &["for-each-ref", "refs/remotes", "--format=%(refname:short)"],
    )
    .await
    .ok()
    .filter(|o| o.success)
    .map(|o| o.stdout.lines().map(|l| l.trim().to_string()).filter(|l| !l.is_empty()).collect())
    .unwrap_or_default();
    for remote_ref in remote_refs {
        // refname:short of "refs/remotes/origin/feature/x" is
        // "origin/feature/x" — strip whichever configured remote name it
        // actually starts with, to get the branch's own short name for the
        // "already has a local branch" check below.
        let Some(short_name) = remote_names
            .iter()
            .find_map(|remote_name| remote_ref.strip_prefix(&format!("{remote_name}/")))
            .map(|s| s.to_string())
        else {
            continue;
        };
        // "origin/HEAD" is the remote's symbolic default-branch pointer, not
        // an actual branch.
        if short_name == "HEAD" || local_names.contains(&short_name) {
            continue;
        }
        branches.push(BranchInfo {
            name: remote_ref,
            is_current: false,
            upstream: None,
            is_merged: false,
            is_gone: false,
            is_remote: true,
        });
    }

    Ok(branches)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn record(hash: &str, parents: &str, refs: &str, subject: &str, author: &str, date: &str, body: &str) -> String {
        format!("{hash}{FIELD_SEP}{parents}{FIELD_SEP}{refs}{FIELD_SEP}{subject}{FIELD_SEP}{author}{FIELD_SEP}{date}{FIELD_SEP}{body}{RECORD_SEP}")
    }

    #[test]
    fn parses_a_single_commit_record() {
        let stdout = record("abc123", "def456", "HEAD -> main, origin/main", "Fix the bug", "Alice", "2026-01-01T00:00:00+00:00", "Extra detail.");
        let nodes = parse_log_records(&stdout);
        assert_eq!(nodes.len(), 1);
        let n = &nodes[0];
        assert_eq!(n.hash, "abc123");
        assert_eq!(n.parents, vec!["def456"]);
        assert_eq!(n.refs, vec!["HEAD -> main", "origin/main"]);
        assert_eq!(n.subject, "Fix the bug");
        assert_eq!(n.author, "Alice");
        assert_eq!(n.body, "Extra detail.");
    }

    #[test]
    fn parses_a_merge_commit_with_two_parents() {
        let stdout = record("m1", "p1 p2", "", "Merge branch 'feature'", "Bob", "2026-01-02T00:00:00+00:00", "");
        let nodes = parse_log_records(&stdout);
        assert_eq!(nodes[0].parents, vec!["p1", "p2"]);
    }

    #[test]
    fn parses_a_root_commit_with_no_parents() {
        let stdout = record("root", "", "", "Initial commit", "Carol", "2026-01-03T00:00:00+00:00", "");
        let nodes = parse_log_records(&stdout);
        assert!(nodes[0].parents.is_empty());
    }

    #[test]
    fn skips_incomplete_or_empty_records() {
        let stdout = format!("  {RECORD_SEP}too{FIELD_SEP}few{FIELD_SEP}fields{RECORD_SEP}");
        assert!(parse_log_records(&stdout).is_empty());
    }

    #[test]
    fn parses_multiple_records_in_order() {
        let stdout = format!(
            "{}{}",
            record("a", "", "", "First", "Alice", "2026-01-01T00:00:00+00:00", ""),
            record("b", "a", "", "Second", "Alice", "2026-01-02T00:00:00+00:00", ""),
        );
        let nodes = parse_log_records(&stdout);
        assert_eq!(nodes.len(), 2);
        assert_eq!(nodes[0].hash, "a");
        assert_eq!(nodes[1].hash, "b");
    }
}
