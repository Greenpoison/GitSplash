use crate::models::Account;
use rusqlite::{params, Connection};

const COLUMNS: &str =
    "id, name, host_alias, github_username, ssh_key_path, signing_key_path, created_at";

fn row_to_account(row: &rusqlite::Row) -> rusqlite::Result<Account> {
    Ok(Account {
        id: row.get(0)?,
        name: row.get(1)?,
        host_alias: row.get(2)?,
        github_username: row.get(3)?,
        ssh_key_path: row.get(4)?,
        signing_key_path: row.get(5)?,
        created_at: row.get(6)?,
    })
}

pub fn list_accounts(conn: &Connection) -> rusqlite::Result<Vec<Account>> {
    let mut stmt = conn.prepare(&format!(
        "SELECT {COLUMNS} FROM accounts ORDER BY created_at ASC"
    ))?;
    let rows = stmt.query_map([], row_to_account)?;
    rows.collect()
}

pub fn get_account(conn: &Connection, id: &str) -> rusqlite::Result<Option<Account>> {
    conn.query_row(
        &format!("SELECT {COLUMNS} FROM accounts WHERE id = ?1"),
        params![id],
        row_to_account,
    )
    .map(Some)
    .or_else(|e| {
        if matches!(e, rusqlite::Error::QueryReturnedNoRows) {
            Ok(None)
        } else {
            Err(e)
        }
    })
}

pub fn insert_account(conn: &Connection, account: &Account) -> rusqlite::Result<()> {
    conn.execute(
        "INSERT INTO accounts (id, name, host_alias, github_username, ssh_key_path, signing_key_path, created_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
        params![
            account.id,
            account.name,
            account.host_alias,
            account.github_username,
            account.ssh_key_path,
            account.signing_key_path,
            account.created_at
        ],
    )?;
    Ok(())
}

pub fn update_account(conn: &Connection, account: &Account) -> rusqlite::Result<()> {
    conn.execute(
        "UPDATE accounts SET name = ?2, host_alias = ?3, github_username = ?4, ssh_key_path = ?5, signing_key_path = ?6
         WHERE id = ?1",
        params![
            account.id,
            account.name,
            account.host_alias,
            account.github_username,
            account.ssh_key_path,
            account.signing_key_path
        ],
    )?;
    Ok(())
}

pub fn delete_account(conn: &Connection, id: &str) -> rusqlite::Result<()> {
    conn.execute("DELETE FROM accounts WHERE id = ?1", params![id])?;
    Ok(())
}
