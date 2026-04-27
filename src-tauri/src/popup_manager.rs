use crate::models::{InstalledPlugin, PluginViewContext};
use std::collections::HashMap;
use std::sync::atomic::{AtomicU64, Ordering};
use tauri::{AppHandle, LogicalPosition, Manager, WebviewUrl, WebviewWindowBuilder};
use thiserror::Error;

static SELECTION_COUNTER: AtomicU64 = AtomicU64::new(1);

#[derive(Debug, Clone, Copy, PartialEq)]
pub struct MonitorBounds {
    pub x: f64,
    pub y: f64,
    pub width: f64,
    pub height: f64,
}

#[derive(Debug, Clone, Copy, PartialEq)]
pub struct PopupPosition {
    pub x: f64,
    pub y: f64,
}

#[derive(Debug, Clone)]
pub struct PopupSelection {
    pub selection_id: String,
    pub plugin: InstalledPlugin,
    pub context: PluginViewContext,
}

#[derive(Debug, Default)]
pub struct PopupRuntimeState {
    selections: HashMap<String, PopupSelection>,
}

impl PopupRuntimeState {
    pub fn insert(&mut self, selection: PopupSelection) {
        self.selections
            .insert(selection.selection_id.clone(), selection);
    }

    pub fn get(&self, selection_id: &str) -> Option<PopupSelection> {
        self.selections.get(selection_id).cloned()
    }
}

#[derive(Debug, Error)]
pub enum PopupManagerError {
    #[error("failed to create popup window: {0}")]
    Window(#[from] tauri::Error),
}

pub fn next_selection_id() -> String {
    SELECTION_COUNTER
        .fetch_add(1, Ordering::Relaxed)
        .to_string()
}

pub fn clamp_popup_position(
    mouse_x: f64,
    mouse_y: f64,
    popup_w: f64,
    popup_h: f64,
    monitor: &MonitorBounds,
) -> PopupPosition {
    let offset = 10.0;
    let right = monitor.x + monitor.width;
    let bottom = monitor.y + monitor.height;
    let mut x = if mouse_x - monitor.x < offset {
        monitor.x + offset
    } else {
        mouse_x + offset
    };
    let mut y = if mouse_y - monitor.y < offset {
        monitor.y + offset
    } else {
        mouse_y + offset
    };

    if x + popup_w > right {
        x = mouse_x - popup_w - offset;
    }
    if y + popup_h > bottom {
        y = mouse_y - popup_h - offset;
    }

    PopupPosition {
        x: x.max(monitor.x + offset).min(right - popup_w - offset),
        y: y.max(monitor.y + offset).min(bottom - popup_h - offset),
    }
}

pub fn close_selection_popup(app: &AppHandle) {
    if let Some(win) = app.get_webview_window("selection-popup") {
        let _ = win.close();
    }
}

pub fn show_selection_popup(
    app: &AppHandle,
    selection_id: &str,
    plugin: &InstalledPlugin,
    mouse_x: f64,
    mouse_y: f64,
) -> Result<(), PopupManagerError> {
    close_selection_popup(app);

    let url = format!("/plugin-popup?selectionId={selection_id}");
    let popup = WebviewWindowBuilder::new(app, "selection-popup", WebviewUrl::App(url.into()))
        .title("")
        .inner_size(
            plugin.manifest.popup.width as f64,
            plugin.manifest.popup.height as f64,
        )
        .decorations(false)
        .always_on_top(true)
        .skip_taskbar(true)
        .resizable(false)
        .visible(true)
        .focused(false)
        .build()?;

    if let Some(position) = resolve_popup_position(
        app,
        mouse_x,
        mouse_y,
        plugin.manifest.popup.width as f64,
        plugin.manifest.popup.height as f64,
    ) {
        popup.set_position(tauri::Position::Logical(LogicalPosition::new(
            position.x, position.y,
        )))?;
    }

    Ok(())
}

fn resolve_popup_position(
    app: &AppHandle,
    mouse_x: f64,
    mouse_y: f64,
    popup_w: f64,
    popup_h: f64,
) -> Option<PopupPosition> {
    let monitors = app.available_monitors().ok()?;
    for monitor in monitors {
        let scale = monitor.scale_factor();
        let phys_x = monitor.position().x as f64;
        let phys_y = monitor.position().y as f64;
        let phys_w = monitor.size().width as f64;
        let phys_h = monitor.size().height as f64;

        let mouse_in_monitor = mouse_x >= phys_x
            && mouse_x < phys_x + phys_w
            && mouse_y >= phys_y
            && mouse_y < phys_y + phys_h;

        if mouse_in_monitor {
            #[cfg(target_os = "macos")]
            let (mouse_x_logical, mouse_y_logical) = (mouse_x, mouse_y);
            #[cfg(not(target_os = "macos"))]
            let (mouse_x_logical, mouse_y_logical) = (mouse_x / scale, mouse_y / scale);

            let bounds = MonitorBounds {
                x: phys_x / scale,
                y: phys_y / scale,
                width: phys_w / scale,
                height: phys_h / scale,
            };
            return Some(clamp_popup_position(
                mouse_x_logical,
                mouse_y_logical,
                popup_w,
                popup_h,
                &bounds,
            ));
        }
    }
    None
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn positions_popup_below_and_right_when_space_exists() {
        let monitor = MonitorBounds {
            x: 0.0,
            y: 0.0,
            width: 1440.0,
            height: 900.0,
        };
        let pos = clamp_popup_position(100.0, 120.0, 320.0, 180.0, &monitor);
        assert_eq!(pos, PopupPosition { x: 110.0, y: 130.0 });
    }

    #[test]
    fn flips_left_near_right_edge() {
        let monitor = MonitorBounds {
            x: 0.0,
            y: 0.0,
            width: 1440.0,
            height: 900.0,
        };
        let pos = clamp_popup_position(1400.0, 120.0, 320.0, 180.0, &monitor);
        assert_eq!(
            pos,
            PopupPosition {
                x: 1070.0,
                y: 130.0
            }
        );
    }

    #[test]
    fn flips_up_near_bottom_edge() {
        let monitor = MonitorBounds {
            x: 0.0,
            y: 0.0,
            width: 1440.0,
            height: 900.0,
        };
        let pos = clamp_popup_position(100.0, 880.0, 320.0, 180.0, &monitor);
        assert_eq!(pos, PopupPosition { x: 110.0, y: 690.0 });
    }

    #[test]
    fn clamps_on_negative_monitor_coordinates() {
        let monitor = MonitorBounds {
            x: -1280.0,
            y: -720.0,
            width: 1280.0,
            height: 720.0,
        };
        let pos = clamp_popup_position(-1278.0, -718.0, 320.0, 180.0, &monitor);
        assert_eq!(
            pos,
            PopupPosition {
                x: -1270.0,
                y: -710.0
            }
        );
    }
}
