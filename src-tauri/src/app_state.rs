use crate::settings_manager::{SettingsError, SettingsManager};
use std::sync::{Arc, Mutex};
use tauri::{AppHandle, Manager};
use thiserror::Error;

#[derive(Debug, Error)]
pub enum AppStateError {
    #[error("failed to resolve app data directory: {0}")]
    AppDataDir(#[from] tauri::Error),
    #[error("failed to initialize settings: {0}")]
    Settings(#[from] SettingsError),
}

#[derive(Clone)]
pub struct AppState {
    pub settings: SettingsManager,
    pub popup: Arc<Mutex<crate::popup_manager::PopupRuntimeState>>,
}

impl AppState {
    pub fn from_app(app: &AppHandle) -> Result<Self, AppStateError> {
        let root_dir = app.path().app_data_dir()?;
        let settings = SettingsManager::new(root_dir);
        settings.ensure_dirs()?;

        Ok(Self {
            settings,
            popup: Arc::new(Mutex::new(
                crate::popup_manager::PopupRuntimeState::default(),
            )),
        })
    }
}
