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
        PRAGMA journal_mode = DELETE;
        PRAGMA foreign_keys = ON;

        CREATE TABLE IF NOT EXISTS accounts (
            id                TEXT PRIMARY KEY,
            name              TEXT NOT NULL,
            host_alias        TEXT NOT NULL UNIQUE,
            hostname          TEXT NOT NULL DEFAULT 'github.com',
            github_username   TEXT,
            ssh_key_path      TEXT NOT NULL,
            signing_key_path  TEXT,
            signing_method    TEXT NOT NULL DEFAULT 'ssh',
            gpg_key_id        TEXT,
            use_ssh_over_https INTEGER NOT NULL DEFAULT 0,
            created_at        TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS groups (
            id          TEXT PRIMARY KEY,
            name        TEXT NOT NULL UNIQUE,
            color       TEXT,
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
    migrate(&conn)?;
    Ok(conn)
}

/// `CREATE TABLE IF NOT EXISTS` above only applies to brand-new databases —
/// it does nothing to a table that already exists with an older shape. This
/// adds columns introduced after a table's first release, so upgrading
/// GitSplash never leaves a stale local db missing a column the code expects.
fn migrate(conn: &Connection) -> rusqlite::Result<()> {
    add_column_if_missing(conn, "accounts", "hostname", "TEXT NOT NULL DEFAULT 'github.com'")?;
    add_column_if_missing(conn, "accounts", "signing_method", "TEXT NOT NULL DEFAULT 'ssh'")?;
    add_column_if_missing(conn, "accounts", "gpg_key_id", "TEXT")?;
    add_column_if_missing(conn, "groups", "color", "TEXT")?;
    add_column_if_missing(conn, "accounts", "use_ssh_over_https", "INTEGER NOT NULL DEFAULT 0")?;
    Ok(())
}

fn add_column_if_missing(
    conn: &Connection,
    table: &str,
    column: &str,
    definition: &str,
) -> rusqlite::Result<()> {
    let mut stmt = conn.prepare(&format!("PRAGMA table_info({table})"))?;
    let existing: Vec<String> = stmt
        .query_map([], |row| row.get::<_, String>(1))?
        .collect::<rusqlite::Result<_>>()?;
    if !existing.iter().any(|c| c == column) {
        conn.execute(&format!("ALTER TABLE {table} ADD COLUMN {column} {definition}"), [])?;
    }
    Ok(())
}
