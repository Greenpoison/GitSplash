use crate::models::Group;
use rusqlite::{params, Connection};

pub fn list_groups(conn: &Connection) -> rusqlite::Result<Vec<Group>> {
    let mut stmt =
        conn.prepare("SELECT id, name, color, created_at FROM groups ORDER BY name ASC")?;
    let rows = stmt.query_map([], |row| {
        Ok(Group {
            id: row.get(0)?,
            name: row.get(1)?,
            color: row.get(2)?,
            created_at: row.get(3)?,
        })
    })?;
    rows.collect()
}

pub fn insert_group(conn: &Connection, group: &Group) -> rusqlite::Result<()> {
    conn.execute(
        "INSERT INTO groups (id, name, color, created_at) VALUES (?1, ?2, ?3, ?4)",
        params![group.id, group.name, group.color, group.created_at],
    )?;
    Ok(())
}

pub fn rename_group(conn: &Connection, id: &str, name: &str) -> rusqlite::Result<()> {
    conn.execute(
        "UPDATE groups SET name = ?2 WHERE id = ?1",
        params![id, name],
    )?;
    Ok(())
}

pub fn set_group_color(conn: &Connection, id: &str, color: Option<&str>) -> rusqlite::Result<()> {
    conn.execute(
        "UPDATE groups SET color = ?2 WHERE id = ?1",
        params![id, color],
    )?;
    Ok(())
}

pub fn delete_group(conn: &Connection, id: &str) -> rusqlite::Result<()> {
    conn.execute("DELETE FROM groups WHERE id = ?1", params![id])?;
    Ok(())
}

pub fn set_repo_groups(conn: &Connection, repo_id: &str, group_ids: &[String]) -> rusqlite::Result<()> {
    conn.execute(
        "DELETE FROM repo_groups WHERE repo_id = ?1",
        params![repo_id],
    )?;
    for group_id in group_ids {
        conn.execute(
            "INSERT INTO repo_groups (repo_id, group_id) VALUES (?1, ?2)",
            params![repo_id, group_id],
        )?;
    }
    Ok(())
}

pub fn group_ids_for_repo(conn: &Connection, repo_id: &str) -> rusqlite::Result<Vec<String>> {
    let mut stmt = conn.prepare("SELECT group_id FROM repo_groups WHERE repo_id = ?1")?;
    let rows = stmt.query_map(params![repo_id], |row| row.get(0))?;
    rows.collect()
}

pub fn repo_ids_for_group(conn: &Connection, group_id: &str) -> rusqlite::Result<Vec<String>> {
    let mut stmt = conn.prepare("SELECT repo_id FROM repo_groups WHERE group_id = ?1")?;
    let rows = stmt.query_map(params![group_id], |row| row.get(0))?;
    rows.collect()
}
