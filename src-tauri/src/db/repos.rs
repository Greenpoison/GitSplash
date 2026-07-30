use crate::models::Repo;
use rusqlite::{params, Connection};

fn row_to_repo_without_groups(row: &rusqlite::Row) -> rusqlite::Result<Repo> {
    Ok(Repo {
        id: row.get(0)?,
        path: row.get(1)?,
        display_name: row.get(2)?,
        account_id: row.get(3)?,
        last_fetched_at: row.get(4)?,
        created_at: row.get(5)?,
        group_ids: Vec::new(),
    })
}

pub fn list_repos(conn: &Connection) -> rusqlite::Result<Vec<Repo>> {
    let mut stmt = conn.prepare(
        "SELECT id, path, display_name, account_id, last_fetched_at, created_at
         FROM repos ORDER BY display_name ASC",
    )?;
    let rows = stmt.query_map([], row_to_repo_without_groups)?;
    let mut repos: Vec<Repo> = rows.collect::<rusqlite::Result<Vec<_>>>()?;
    for repo in &mut repos {
        repo.group_ids = super::group_ids_for_repo(conn, &repo.id)?;
    }
    Ok(repos)
}

pub fn get_repo(conn: &Connection, id: &str) -> rusqlite::Result<Option<Repo>> {
    let repo = conn
        .query_row(
            "SELECT id, path, display_name, account_id, last_fetched_at, created_at
             FROM repos WHERE id = ?1",
            params![id],
            row_to_repo_without_groups,
        )
        .map(Some)
        .or_else(|e| {
            if matches!(e, rusqlite::Error::QueryReturnedNoRows) {
                Ok(None)
            } else {
                Err(e)
            }
        })?;
    match repo {
        Some(mut r) => {
            r.group_ids = super::group_ids_for_repo(conn, &r.id)?;
            Ok(Some(r))
        }
        None => Ok(None),
    }
}

pub fn insert_repo(conn: &Connection, repo: &Repo) -> rusqlite::Result<()> {
    conn.execute(
        "INSERT INTO repos (id, path, display_name, account_id, last_fetched_at, created_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
        params![
            repo.id,
            repo.path,
            repo.display_name,
            repo.account_id,
            repo.last_fetched_at,
            repo.created_at
        ],
    )?;
    Ok(())
}

pub fn update_repo(conn: &Connection, repo: &Repo) -> rusqlite::Result<()> {
    conn.execute(
        "UPDATE repos SET display_name = ?2, account_id = ?3 WHERE id = ?1",
        params![repo.id, repo.display_name, repo.account_id],
    )?;
    Ok(())
}

pub fn delete_repo(conn: &Connection, id: &str) -> rusqlite::Result<()> {
    conn.execute("DELETE FROM repos WHERE id = ?1", params![id])?;
    Ok(())
}

pub fn touch_last_fetched(conn: &Connection, id: &str, timestamp: &str) -> rusqlite::Result<()> {
    conn.execute(
        "UPDATE repos SET last_fetched_at = ?2 WHERE id = ?1",
        params![id, timestamp],
    )?;
    Ok(())
}

pub fn path_in_use(conn: &Connection, path: &str) -> rusqlite::Result<bool> {
    let count: i64 = conn.query_row(
        "SELECT COUNT(*) FROM repos WHERE path = ?1",
        params![path],
        |row| row.get(0),
    )?;
    Ok(count > 0)
}
