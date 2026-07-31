use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Account {
    pub id: String,
    pub name: String,
    pub host_alias: String,
    /// The real GitHub hostname this account authenticates against
    /// (almost always "github.com"; only differs for GitHub Enterprise).
    pub hostname: String,
    pub github_username: Option<String>,
    /// Authentication key (used for git operations over the host alias).
    pub ssh_key_path: String,
    /// Separate commit-signing key; GitHub treats auth and signing keys as
    /// distinct, so this must be uploaded to the account's "Signing Keys" page.
    pub signing_key_path: Option<String>,
    /// "ssh" or "gpg" — which of `signing_key_path` / `gpg_key_id` is
    /// actually applied to a repo's git config when this account is assigned.
    pub signing_method: String,
    /// An existing local GPG secret key's long key ID, picked from the
    /// user's keyring rather than generated (unlike the SSH signing key).
    pub gpg_key_id: Option<String>,
    pub created_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Group {
    pub id: String,
    pub name: String,
    /// One of the fixed swatch keys from the frontend's color picker (e.g.
    /// "blue"), or None for no color. Free-form rather than an enum since
    /// the palette lives in the frontend and may grow independently.
    pub color: Option<String>,
    pub created_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Repo {
    pub id: String,
    pub path: String,
    pub display_name: String,
    pub account_id: Option<String>,
    pub last_fetched_at: Option<String>,
    pub created_at: String,
    pub group_ids: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RepoGitStatus {
    pub repo_id: String,
    pub branch: Option<String>,
    pub ahead: u32,
    pub behind: u32,
    pub is_dirty: bool,
    pub has_upstream: bool,
    pub error: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Settings {
    pub git_gui_path: Option<String>,
    pub batch_concurrency: u32,
    /// Set once the first-run tutorial is finished or skipped, so it never
    /// auto-launches again. Reset from the settings page to bring it back
    /// on the next launch.
    pub tutorial_completed: bool,
}

impl Default for Settings {
    fn default() -> Self {
        Self {
            git_gui_path: None,
            batch_concurrency: 6,
            tutorial_completed: false,
        }
    }
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum BatchPhase {
    Started,
    Success,
    Failed,
    Skipped,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BatchEvent {
    pub run_id: String,
    pub repo_id: String,
    pub repo_name: String,
    pub phase: BatchPhase,
    pub message: Option<String>,
    pub pulled: bool,
}
