use crate::models::Settings;
use rusqlite::{params, Connection, OptionalExtension};

pub fn get_settings(conn: &Connection) -> rusqlite::Result<Settings> {
    let mut settings = Settings::default();

    let git_gui_path: Option<String> = conn
        .query_row(
            "SELECT value FROM settings WHERE key = 'git_gui_path'",
            [],
            |row| row.get(0),
        )
        .optional()?;
    if let Some(v) = git_gui_path {
        settings.git_gui_path = Some(v);
    }

    let concurrency: Option<String> = conn
        .query_row(
            "SELECT value FROM settings WHERE key = 'batch_concurrency'",
            [],
            |row| row.get(0),
        )
        .optional()?;
    if let Some(v) = concurrency.and_then(|v| v.parse::<u32>().ok()) {
        settings.batch_concurrency = v;
    }

    Ok(settings)
}

pub fn save_settings(conn: &Connection, settings: &Settings) -> rusqlite::Result<()> {
    match &settings.git_gui_path {
        Some(path) => conn.execute(
            "INSERT INTO settings (key, value) VALUES ('git_gui_path', ?1)
             ON CONFLICT(key) DO UPDATE SET value = excluded.value",
            params![path],
        )?,
        None => conn.execute("DELETE FROM settings WHERE key = 'git_gui_path'", [])?,
    };
    conn.execute(
        "INSERT INTO settings (key, value) VALUES ('batch_concurrency', ?1)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value",
        params![settings.batch_concurrency.to_string()],
    )?;
    Ok(())
}
