pub mod app_state;
pub mod commands;
pub mod models;
pub mod plugin_engine;
pub mod plugin_protocol;
pub mod plugin_registry;
pub mod popup_manager;
pub mod selection_monitor;
pub mod settings_manager;
pub mod tray;

use crate::models::CloseWindowBehavior;
use tauri::Manager;
use tauri_plugin_opener::OpenerExt;
// Learn more about Tauri commands at https://tauri.app/develop/calling-rust/
#[tauri::command]
fn greet(name: &str) -> String {
    format!("Hello, {}! You've been greeted from Rust!", name)
}

fn external_navigation_plugin<R: tauri::Runtime>() -> tauri::plugin::TauriPlugin<R> {
    tauri::plugin::Builder::<R>::new("external-navigation")
        .on_navigation(|webview, url| {
            let is_internal_host = matches!(
                url.host_str(),
                Some("localhost") | Some("127.0.0.1") | Some("tauri.localhost") | Some("::1")
            );

            let is_internal = url.scheme() == "tauri" || is_internal_host;

            if is_internal {
                return true;
            }

            let is_external_link = matches!(url.scheme(), "http" | "https" | "mailto" | "tel");

            if is_external_link {
                let _ = webview.opener().open_url(url.as_str(), None::<&str>);
                return false;
            }

            true
        })
        .build()
}

fn handle_window_close<R: tauri::Runtime>(window: &tauri::Window<R>, event: &tauri::WindowEvent) {
    if window.label() != "main" {
        return;
    }

    let tauri::WindowEvent::CloseRequested { api, .. } = event else {
        return;
    };

    let behavior = window
        .app_handle()
        .try_state::<app_state::AppState>()
        .and_then(|state| state.settings.load_config().ok())
        .map(|config| config.close_window_behavior)
        .unwrap_or_default();

    if behavior == CloseWindowBehavior::MinimizeToTray {
        api.prevent_close();
        if let Err(error) = window.hide() {
            eprintln!("Failed to hide settings window: {error}");
        }
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let builder = tauri::Builder::default();
    let builder = plugin_protocol::register_plugin_protocol(builder);

    builder
        .on_window_event(handle_window_close)
        .setup(|app| {
            tray::setup_tray(app)?;
            let state = app_state::AppState::from_app(app.handle())?;
            app.manage(state);
            selection_monitor::start_input_monitoring(app.handle().clone());
            Ok(())
        })
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(external_navigation_plugin())
        .invoke_handler(tauri::generate_handler![
            greet,
            commands::get_settings_snapshot,
            commands::set_language_preference,
            commands::set_close_window_behavior,
            commands::import_plugin_folder,
            commands::list_bundled_plugins,
            commands::import_bundled_plugins,
            commands::set_plugin_enabled,
            commands::set_plugin_order,
            commands::remove_plugin,
            commands::get_popup_payload,
            commands::get_plugin_settings_payload,
            commands::get_plugin_view_html,
            commands::plugin_storage_get,
            commands::plugin_storage_set,
            commands::plugin_storage_remove,
            commands::bridge_open_external,
            commands::bridge_close_popup
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
