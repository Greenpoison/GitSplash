use crate::models::Account;
use rusqlite::{params, Connection};

const COLUMNS: &str = "id, name, host_alias, hostname, github_username, ssh_key_path, signing_key_path, \
     signing_method, gpg_key_id, created_at";

fn row_to_account(row: &rusqlite::Row) -> rusqlite::Result<Account> {
    Ok(Account {
        id: row.get(0)?,
        name: row.get(1)?,
        host_alias: row.get(2)?,
        hostname: row.get(3)?,
        github_username: row.get(4)?,
        ssh_key_path: row.get(5)?,
        signing_key_path: row.get(6)?,
        signing_method: row.get(7)?,
        gpg_key_id: row.get(8)?,
        created_at: row.get(9)?,
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
        "INSERT INTO accounts (id, name, host_alias, hostname, github_username, ssh_key_path, signing_key_path, signing_method, gpg_key_id, created_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)",
        params![
            account.id,
            account.name,
            account.host_alias,
            account.hostname,
            account.github_username,
            account.ssh_key_path,
            account.signing_key_path,
            account.signing_method,
            account.gpg_key_id,
            account.created_at
        ],
    )?;
    Ok(())
}

pub fn update_account(conn: &Connection, account: &Account) -> rusqlite::Result<()> {
    conn.execute(
        "UPDATE accounts SET name = ?2, host_alias = ?3, hostname = ?4, github_username = ?5, ssh_key_path = ?6, signing_key_path = ?7, signing_method = ?8, gpg_key_id = ?9
         WHERE id = ?1",
        params![
            account.id,
            account.name,
            account.host_alias,
            account.hostname,
            account.github_username,
            account.ssh_key_path,
            account.signing_key_path,
            account.signing_method,
            account.gpg_key_id
        ],
    )?;
    Ok(())
}

pub fn delete_account(conn: &Connection, id: &str) -> rusqlite::Result<()> {
    conn.execute("DELETE FROM accounts WHERE id = ?1", params![id])?;
    Ok(())
}
