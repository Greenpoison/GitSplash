mod accounts;
mod groups;
mod repos;
mod settings;

pub use accounts::*;
pub use groups::*;
pub use repos::*;
pub use settings::*;

use rusqlite::Connection;
use std::path::Path;

pub fn open(data_dir: &Path) -> rusqlite::Result<Connection> {
    std::fs::create_dir_all(data_dir).ok();
    let conn = Connection::open(data_dir.join("gitsplash.sqlite3"))?;
    conn.execute_batch(
        "
        PRAGMA journal_mode = WAL;
        PRAGMA foreign_keys = ON;

        CREATE TABLE IF NOT EXISTS accounts (
            id                TEXT PRIMARY KEY,
            name              TEXT NOT NULL,
            host_alias        TEXT NOT NULL UNIQUE,
            hostname          TEXT NOT NULL DEFAULT 'github.com',
            github_username   TEXT,
            ssh_key_path      TEXT NOT NULL,
            signing_key_path  TEXT,
            created_at        TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS groups (
            id          TEXT PRIMARY KEY,
            name        TEXT NOT NULL UNIQUE,
            created_at  TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS repos (
            id              TEXT PRIMARY KEY,
            path            TEXT NOT NULL UNIQUE,
            display_name    TEXT NOT NULL,
            account_id      TEXT REFERENCES accounts(id) ON DELETE SET NULL,
            last_fetched_at TEXT,
            created_at      TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS repo_groups (
            repo_id     TEXT NOT NULL REFERENCES repos(id) ON DELETE CASCADE,
            group_id    TEXT NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
            PRIMARY KEY (repo_id, group_id)
        );

        CREATE TABLE IF NOT EXISTS settings (
            key     TEXT PRIMARY KEY,
            value   TEXT NOT NULL
        );
        ",
    )?;
    Ok(conn)
}
