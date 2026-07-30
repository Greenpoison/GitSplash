use crate::error::{AppError, AppResult};
use crate::gpg;
use crate::gpg::GpgKeyInfo;

#[tauri::command]
pub async fn list_gpg_secret_keys() -> AppResult<Vec<GpgKeyInfo>> {
    gpg::list_secret_keys().await.map_err(AppError::Gpg)
}

#[tauri::command]
pub async fn get_gpg_public_key(key_id: String) -> AppResult<String> {
    gpg::export_public_key(&key_id).await.map_err(AppError::Gpg)
}
