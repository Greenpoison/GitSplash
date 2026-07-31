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

    let tutorial_completed: Option<String> = conn
        .query_row(
            "SELECT value FROM settings WHERE key = 'tutorial_completed'",
            [],
            |row| row.get(0),
        )
        .optional()?;
    if let Some(v) = tutorial_completed {
        settings.tutorial_completed = v == "true";
    }

    let check_for_updates: Option<String> = conn
        .query_row(
            "SELECT value FROM settings WHERE key = 'check_for_updates'",
            [],
            |row| row.get(0),
        )
        .optional()?;
    if let Some(v) = check_for_updates {
        settings.check_for_updates = v == "true";
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
    conn.execute(
        "INSERT INTO settings (key, value) VALUES ('tutorial_completed', ?1)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value",
        params![settings.tutorial_completed.to_string()],
    )?;
    conn.execute(
        "INSERT INTO settings (key, value) VALUES ('check_for_updates', ?1)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value",
        params![settings.check_for_updates.to_string()],
    )?;
    Ok(())
}
