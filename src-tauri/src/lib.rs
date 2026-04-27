pub mod app_state;
pub mod commands;
pub mod models;
pub mod plugin_engine;
pub mod plugin_protocol;
pub mod plugin_registry;
pub mod popup_manager;
pub mod settings_manager;

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

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let builder = tauri::Builder::default();
    let builder = plugin_protocol::register_plugin_protocol(builder);

    builder
        .setup(|app| {
            let state = app_state::AppState::from_app(app.handle())?;
            app.manage(state);
            Ok(())
        })
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(external_navigation_plugin())
        .invoke_handler(tauri::generate_handler![
            greet,
            commands::get_settings_snapshot,
            commands::set_language_preference,
            commands::import_plugin_folder,
            commands::set_plugin_enabled,
            commands::set_plugin_order,
            commands::remove_plugin,
            commands::get_popup_payload,
            commands::get_plugin_settings_payload,
            commands::plugin_storage_get,
            commands::plugin_storage_set,
            commands::plugin_storage_remove,
            commands::bridge_open_external,
            commands::bridge_close_popup
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
