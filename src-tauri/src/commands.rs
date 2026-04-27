use crate::app_state::AppState;
use crate::models::{AppSettingsSnapshot, LanguagePreference, PluginSettingsPayload, PopupPayload};
use crate::plugin_engine::build_view_context;
use crate::plugin_registry::PluginRegistry;
use crate::popup_manager::close_selection_popup;
use serde_json::Value;
use tauri::{AppHandle, Manager};
use tauri_plugin_opener::OpenerExt;

#[tauri::command]
pub fn get_settings_snapshot(app: AppHandle) -> Result<AppSettingsSnapshot, String> {
    let state = app.state::<AppState>();
    let registry = PluginRegistry::new(state.settings.clone());
    let config = state
        .settings
        .load_config()
        .map_err(|error| error.to_string())?;
    let locale = registry.resolve_locale(config.language_preference);
    let plugins = registry.list_plugins().map_err(|error| error.to_string())?;
    Ok(AppSettingsSnapshot {
        language_preference: config.language_preference,
        locale,
        plugins,
        app_version: app.package_info().version.to_string(),
    })
}

#[tauri::command]
pub fn set_language_preference(
    app: AppHandle,
    language_preference: LanguagePreference,
) -> Result<AppSettingsSnapshot, String> {
    let state = app.state::<AppState>();
    let mut config = state
        .settings
        .load_config()
        .map_err(|error| error.to_string())?;
    config.language_preference = language_preference;
    state
        .settings
        .save_config(&config)
        .map_err(|error| error.to_string())?;
    get_settings_snapshot(app)
}

#[tauri::command]
pub fn import_plugin_folder(app: AppHandle, path: String) -> Result<AppSettingsSnapshot, String> {
    let state = app.state::<AppState>();
    let registry = PluginRegistry::new(state.settings.clone());
    registry
        .import_folder(std::path::Path::new(&path))
        .map_err(|error| error.to_string())?;
    get_settings_snapshot(app)
}

#[tauri::command]
pub fn set_plugin_enabled(
    app: AppHandle,
    plugin_id: String,
    enabled: bool,
) -> Result<AppSettingsSnapshot, String> {
    let state = app.state::<AppState>();
    let registry = PluginRegistry::new(state.settings.clone());
    registry
        .set_enabled(&plugin_id, enabled)
        .map_err(|error| error.to_string())?;
    get_settings_snapshot(app)
}

#[tauri::command]
pub fn set_plugin_order(
    app: AppHandle,
    plugin_ids: Vec<String>,
) -> Result<AppSettingsSnapshot, String> {
    let state = app.state::<AppState>();
    let registry = PluginRegistry::new(state.settings.clone());
    registry
        .set_plugin_order(plugin_ids)
        .map_err(|error| error.to_string())?;
    get_settings_snapshot(app)
}

#[tauri::command]
pub fn remove_plugin(app: AppHandle, plugin_id: String) -> Result<AppSettingsSnapshot, String> {
    let state = app.state::<AppState>();
    let registry = PluginRegistry::new(state.settings.clone());
    registry
        .remove_plugin(&plugin_id)
        .map_err(|error| error.to_string())?;
    get_settings_snapshot(app)
}

#[tauri::command]
pub fn get_popup_payload(app: AppHandle, selection_id: String) -> Result<PopupPayload, String> {
    let state = app.state::<AppState>();
    let popup = state
        .popup
        .lock()
        .map_err(|_| "popup state lock failed".to_string())?;
    let selection = popup
        .get(&selection_id)
        .ok_or_else(|| "selection context not found".to_string())?;
    let entry_url = format!(
        "oms-plugin://{}/{}?viewKind=popup&selectionId={}",
        selection.plugin.id, selection.plugin.manifest.popup.entry, selection_id
    );
    Ok(PopupPayload {
        selection_id,
        plugin: selection.plugin,
        context: selection.context,
        entry_url,
    })
}

#[tauri::command]
pub fn get_plugin_settings_payload(
    app: AppHandle,
    plugin_id: String,
) -> Result<PluginSettingsPayload, String> {
    let state = app.state::<AppState>();
    let registry = PluginRegistry::new(state.settings.clone());
    let config = state
        .settings
        .load_config()
        .map_err(|error| error.to_string())?;
    let locale = registry.resolve_locale(config.language_preference);
    let plugin = registry
        .list_plugins()
        .map_err(|error| error.to_string())?
        .into_iter()
        .find(|plugin| plugin.id == plugin_id)
        .ok_or_else(|| "plugin not found".to_string())?;
    let entry_url = plugin.manifest.settings.as_ref().map(|settings| {
        format!(
            "oms-plugin://{}/{}?viewKind=settings",
            plugin.id, settings.entry
        )
    });
    let context = build_view_context(
        &plugin,
        None,
        locale,
        config.language_preference,
        app.package_info().version.to_string(),
    );
    Ok(PluginSettingsPayload {
        plugin,
        entry_url,
        context,
    })
}

#[tauri::command]
pub fn plugin_storage_get(
    app: AppHandle,
    plugin_id: String,
    key: String,
) -> Result<Option<Value>, String> {
    let state = app.state::<AppState>();
    state
        .settings
        .storage_get(&plugin_id, &key)
        .map_err(|error| error.to_string())
}

#[tauri::command]
pub fn plugin_storage_set(
    app: AppHandle,
    plugin_id: String,
    key: String,
    value: Value,
) -> Result<(), String> {
    let state = app.state::<AppState>();
    state
        .settings
        .storage_set(&plugin_id, &key, value)
        .map_err(|error| error.to_string())
}

#[tauri::command]
pub fn plugin_storage_remove(app: AppHandle, plugin_id: String, key: String) -> Result<(), String> {
    let state = app.state::<AppState>();
    state
        .settings
        .storage_remove(&plugin_id, &key)
        .map_err(|error| error.to_string())
}

#[tauri::command]
pub fn bridge_open_external(app: AppHandle, url: String) -> Result<(), String> {
    app.opener()
        .open_url(url, None::<&str>)
        .map_err(|error| error.to_string())
}

#[tauri::command]
pub fn bridge_close_popup(app: AppHandle) -> Result<(), String> {
    close_selection_popup(&app);
    let state = app.state::<AppState>();
    state
        .popup
        .lock()
        .map_err(|_| "popup state lock failed".to_string())?
        .clear();
    Ok(())
}
