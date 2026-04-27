use crate::app_state::AppState;
use crate::models::{
    AppSettingsSnapshot, InstalledPlugin, LanguagePreference, PluginSettingsPayload, PopupPayload,
};
use crate::plugin_engine::build_view_context;
use crate::plugin_protocol::plugin_view_html_for_entry_url;
use crate::plugin_registry::PluginRegistry;
use crate::popup_manager::close_selection_popup;
use serde_json::Value;
use tauri::{AppHandle, Manager};
use tauri_plugin_opener::OpenerExt;
use url::Url;

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
    let mut popup = state
        .popup
        .lock()
        .map_err(|_| "popup state lock failed".to_string())?;
    let selection = popup
        .get(&selection_id)
        .ok_or_else(|| "selection context not found".to_string())?;
    popup.clear();
    popup.insert(selection.clone());

    let entry_url = popup_entry_url(&selection.plugin, &selection_id);
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
    let entry_url =
        plugin.manifest.settings.as_ref().map(|settings| {
            plugin_entry_url(&plugin.id, &settings.entry, &[("viewKind", "settings")])
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
pub fn get_plugin_view_html(app: AppHandle, entry_url: String) -> Result<String, String> {
    plugin_view_html_for_entry_url(&app, &entry_url).map_err(|error| error.to_string())
}

#[tauri::command]
pub fn plugin_storage_get(
    app: AppHandle,
    plugin_id: String,
    key: String,
) -> Result<Option<Value>, String> {
    let state = app.state::<AppState>();
    let registry = PluginRegistry::new(state.settings.clone());
    let plugin = installed_plugin(&registry, &plugin_id)?;
    require_storage_permission(&plugin)?;
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
    let registry = PluginRegistry::new(state.settings.clone());
    let plugin = installed_plugin(&registry, &plugin_id)?;
    require_storage_permission(&plugin)?;
    state
        .settings
        .storage_set(&plugin_id, &key, value)
        .map_err(|error| error.to_string())
}

#[tauri::command]
pub fn plugin_storage_remove(app: AppHandle, plugin_id: String, key: String) -> Result<(), String> {
    let state = app.state::<AppState>();
    let registry = PluginRegistry::new(state.settings.clone());
    let plugin = installed_plugin(&registry, &plugin_id)?;
    require_storage_permission(&plugin)?;
    state
        .settings
        .storage_remove(&plugin_id, &key)
        .map_err(|error| error.to_string())
}

#[tauri::command]
pub fn bridge_open_external(app: AppHandle, plugin_id: String, url: String) -> Result<(), String> {
    let state = app.state::<AppState>();
    let registry = PluginRegistry::new(state.settings.clone());
    let plugin = installed_plugin(&registry, &plugin_id)?;
    require_open_external_permission(&plugin)?;
    require_allowed_external_url(&url)?;
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

fn installed_plugin(registry: &PluginRegistry, plugin_id: &str) -> Result<InstalledPlugin, String> {
    registry
        .list_plugins()
        .map_err(|error| error.to_string())?
        .into_iter()
        .find(|plugin| plugin.id == plugin_id)
        .ok_or_else(|| "plugin not found".to_string())
}

fn require_storage_permission(plugin: &InstalledPlugin) -> Result<(), String> {
    if plugin.manifest.permissions.storage {
        Ok(())
    } else {
        Err("plugin storage permission denied".to_string())
    }
}

fn require_open_external_permission(plugin: &InstalledPlugin) -> Result<(), String> {
    if plugin.manifest.permissions.open_external {
        Ok(())
    } else {
        Err("plugin openExternal permission denied".to_string())
    }
}

fn require_allowed_external_url(url: &str) -> Result<(), String> {
    let url = Url::parse(url).map_err(|error| error.to_string())?;
    match url.scheme() {
        "http" | "https" | "mailto" | "tel" => Ok(()),
        _ => Err("external URL scheme is not allowed".to_string()),
    }
}

fn popup_entry_url(plugin: &InstalledPlugin, selection_id: &str) -> String {
    plugin_entry_url(
        &plugin.id,
        &plugin.manifest.popup.entry,
        &[("viewKind", "popup"), ("selectionId", selection_id)],
    )
}

fn plugin_entry_url(plugin_id: &str, entry: &str, query: &[(&str, &str)]) -> String {
    let path = entry
        .split('/')
        .map(urlencoding::encode)
        .collect::<Vec<_>>()
        .join("/");
    let query = query
        .iter()
        .map(|(key, value)| {
            format!(
                "{}={}",
                urlencoding::encode(key),
                urlencoding::encode(value)
            )
        })
        .collect::<Vec<_>>()
        .join("&");

    format!("oms-plugin://{plugin_id}/{path}?{query}")
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::models::{
        LocalizedText, PluginManifest, PluginPermissions, PopupManifest, SettingsManifest,
    };

    fn plugin(storage: bool, open_external: bool) -> InstalledPlugin {
        InstalledPlugin {
            id: "quick-search".to_string(),
            manifest: PluginManifest {
                id: "quick-search".to_string(),
                name: LocalizedText {
                    zh_cn: None,
                    en: Some("Quick Search".to_string()),
                },
                version: "0.1.0".to_string(),
                matcher: "matcher.js".to_string(),
                popup: PopupManifest {
                    entry: "popup dir/index 100%.html".to_string(),
                    width: 320,
                    height: 240,
                },
                settings: Some(SettingsManifest {
                    entry: "settings dir/a&b.html".to_string(),
                }),
                permissions: PluginPermissions {
                    storage,
                    open_external,
                },
            },
            enabled: true,
            has_settings: true,
        }
    }

    #[test]
    fn builds_encoded_popup_entry_url() {
        let plugin = plugin(false, false);

        let url = popup_entry_url(&plugin, "selection 1&next=%");

        assert_eq!(
            url,
            "oms-plugin://quick-search/popup%20dir/index%20100%25.html?viewKind=popup&selectionId=selection%201%26next%3D%25"
        );
    }

    #[test]
    fn builds_encoded_settings_entry_url() {
        let url = plugin_entry_url(
            "quick-search",
            "settings dir/a&b 100%.html",
            &[("viewKind", "settings")],
        );

        assert_eq!(
            url,
            "oms-plugin://quick-search/settings%20dir/a%26b%20100%25.html?viewKind=settings"
        );
    }

    #[test]
    fn enforces_storage_permission() {
        assert!(require_storage_permission(&plugin(true, false)).is_ok());
        assert_eq!(
            require_storage_permission(&plugin(false, false)).unwrap_err(),
            "plugin storage permission denied"
        );
    }

    #[test]
    fn enforces_open_external_permission() {
        assert!(require_open_external_permission(&plugin(false, true)).is_ok());
        assert_eq!(
            require_open_external_permission(&plugin(false, false)).unwrap_err(),
            "plugin openExternal permission denied"
        );
    }

    #[test]
    fn allows_only_explicit_external_url_schemes() {
        for url in [
            "http://example.com",
            "https://example.com",
            "mailto:hello@example.com",
            "tel:+123456789",
        ] {
            assert!(require_allowed_external_url(url).is_ok());
        }

        for url in ["file:///tmp/a", "javascript:alert(1)", "ftp://example.com"] {
            assert!(require_allowed_external_url(url).is_err());
        }
    }
}
