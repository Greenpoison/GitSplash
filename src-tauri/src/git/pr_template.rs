use serde::{Deserialize, Serialize};
use std::path::Path;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PrTemplate {
    pub name: String,
    pub content: String,
}

/// GitHub's own search order for a single PR template file — first match
/// wins. github.com/x/y/.github/PULL_REQUEST_TEMPLATE.md and its lowercase
/// spelling are by far the most common, the rest are documented fallbacks.
const SINGLE_TEMPLATE_PATHS: &[&str] = &[
    ".github/pull_request_template.md",
    ".github/PULL_REQUEST_TEMPLATE.md",
    "docs/pull_request_template.md",
    "docs/PULL_REQUEST_TEMPLATE.md",
    "pull_request_template.md",
    "PULL_REQUEST_TEMPLATE.md",
];

/// A repo can instead have a directory of *multiple* named templates, which
/// GitHub's own "New pull request" page lets you pick between — mirrored
/// here rather than just picking one, so the picker means the same thing.
const TEMPLATE_DIR: &str = ".github/PULL_REQUEST_TEMPLATE";

/// Reads whichever PR template(s) this repo actually has on disk, purely by
/// file lookup — no AI involved, this never invents or rewrites content,
/// only surfaces the literal template file(s) the repo's maintainers wrote
/// so the user can fill them in themselves.
pub async fn find_pull_request_templates(repo_path: &Path) -> Vec<PrTemplate> {
    let dir_path = repo_path.join(TEMPLATE_DIR);
    if let Ok(mut entries) = tokio::fs::read_dir(&dir_path).await {
        let mut templates = Vec::new();
        while let Ok(Some(entry)) = entries.next_entry().await {
            let path = entry.path();
            let is_markdown = path
                .extension()
                .and_then(|e| e.to_str())
                .map(|e| e.eq_ignore_ascii_case("md"))
                .unwrap_or(false);
            if !is_markdown {
                continue;
            }
            if let Ok(content) = tokio::fs::read_to_string(&path).await {
                let name = path
                    .file_stem()
                    .and_then(|s| s.to_str())
                    .unwrap_or("template")
                    .to_string();
                templates.push(PrTemplate { name, content });
            }
        }
        if !templates.is_empty() {
            templates.sort_by(|a, b| a.name.cmp(&b.name));
            return templates;
        }
    }

    for rel_path in SINGLE_TEMPLATE_PATHS {
        let full_path = repo_path.join(rel_path);
        if let Ok(content) = tokio::fs::read_to_string(&full_path).await {
            return vec![PrTemplate { name: "Default".to_string(), content }];
        }
    }

    Vec::new()
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;

    fn temp_repo(name: &str) -> std::path::PathBuf {
        let path = std::env::temp_dir().join(format!("gitsplash-pr-template-test-{name}-{}", crate::util::new_id()));
        fs::create_dir_all(&path).unwrap();
        path
    }

    #[tokio::test]
    async fn finds_the_lowercase_github_template() {
        let repo = temp_repo("lowercase");
        fs::create_dir_all(repo.join(".github")).unwrap();
        fs::write(repo.join(".github/pull_request_template.md"), "## Summary\n").unwrap();

        let templates = find_pull_request_templates(&repo).await;
        assert_eq!(templates.len(), 1);
        assert_eq!(templates[0].name, "Default");
        assert_eq!(templates[0].content, "## Summary\n");

        fs::remove_dir_all(&repo).ok();
    }

    #[tokio::test]
    async fn prefers_the_multi_template_directory_over_a_single_file() {
        let repo = temp_repo("multi");
        fs::create_dir_all(repo.join(".github/PULL_REQUEST_TEMPLATE")).unwrap();
        fs::write(repo.join(".github/PULL_REQUEST_TEMPLATE/bugfix.md"), "## Bug\n").unwrap();
        fs::write(repo.join(".github/PULL_REQUEST_TEMPLATE/feature.md"), "## Feature\n").unwrap();
        // A single-file template also present — the directory should win.
        fs::write(repo.join("PULL_REQUEST_TEMPLATE.md"), "## Should not be used\n").unwrap();

        let templates = find_pull_request_templates(&repo).await;
        assert_eq!(templates.len(), 2);
        let names: Vec<&str> = templates.iter().map(|t| t.name.as_str()).collect();
        assert_eq!(names, vec!["bugfix", "feature"]);

        fs::remove_dir_all(&repo).ok();
    }

    #[tokio::test]
    async fn returns_nothing_when_no_template_exists() {
        let repo = temp_repo("none");
        let templates = find_pull_request_templates(&repo).await;
        assert!(templates.is_empty());
        fs::remove_dir_all(&repo).ok();
    }
}
