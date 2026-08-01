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
    /// Routes SSH over ssh.github.com:443 instead of github.com:22 — the
    /// workaround GitHub documents for networks that block outbound SSH.
    /// Only meaningful for the public github.com; there's no equivalent
    /// fixed hostname for GitHub Enterprise, so the UI only offers this
    /// when `hostname == "github.com"`.
    pub use_ssh_over_https: bool,
    pub created_at: String,
}

/// Returned by any command that best-effort-uploads a signing key to
/// GitHub after applying a local change (new SSH signing key, switching to
/// GPG signing, etc). The local change always succeeds independently of the
/// upload, so callers surface `github_upload_error` as a warning rather
/// than failing the whole command — same "nice-to-have" reasoning as the
/// upload itself.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AccountUploadResult {
    pub account: Account,
    pub github_upload_error: Option<String>,
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
    /// The upstream ref itself (e.g. "origin/main"), when it has one — lets
    /// the caller compare or diff against it directly without a second
    /// round-trip to resolve the name.
    pub upstream: Option<String>,
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
    /// Whether to check for a newer release on every launch. On by default;
    /// the check itself is a single request to the update manifest and
    /// never installs anything without the user clicking "Update now".
    pub check_for_updates: bool,
}

impl Default for Settings {
    fn default() -> Self {
        Self {
            git_gui_path: None,
            batch_concurrency: 6,
            tutorial_completed: false,
            check_for_updates: true,
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
