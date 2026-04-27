use tauri::{
    menu::{MenuBuilder, MenuItemBuilder},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    App, AppHandle, Manager,
};

pub fn setup_tray(app: &mut App) -> tauri::Result<()> {
    let show_settings = MenuItemBuilder::with_id("show_settings", "Settings").build(app)?;
    let quit = MenuItemBuilder::with_id("quit", "Quit").build(app)?;
    let menu = MenuBuilder::new(app)
        .items(&[&show_settings, &quit])
        .build()?;

    let mut builder = TrayIconBuilder::with_id("main-tray")
        .menu(&menu)
        .show_menu_on_left_click(false)
        .on_menu_event(|app, event| match event.id().as_ref() {
            "show_settings" => show_settings_window(app),
            "quit" => app.exit(0),
            _ => {}
        })
        .on_tray_icon_event(|tray, event| {
            if let TrayIconEvent::Click {
                button: MouseButton::Left,
                button_state: MouseButtonState::Up,
                ..
            } = event
            {
                show_settings_window(tray.app_handle());
            }
        });

    if let Some(icon) = app.default_window_icon() {
        builder = builder.icon(icon.clone());
    }

    builder.build(app)?;
    Ok(())
}

pub fn show_settings_window(app: &AppHandle) {
    let Some(window) = app.get_webview_window("main") else {
        eprintln!("Settings window `main` was not found");
        return;
    };

    if let Err(error) = window.unminimize() {
        eprintln!("Failed to unminimize settings window: {error}");
    }
    if let Err(error) = window.show() {
        eprintln!("Failed to show settings window: {error}");
    }
    if let Err(error) = window.set_focus() {
        eprintln!("Failed to focus settings window: {error}");
    }
}
