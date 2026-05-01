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

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum SelectionPopupHitTest {
    NoPopup,
    Inside,
    Outside,
    Unknown,
}

#[derive(Debug, Clone, Copy)]
struct RawMonitorBounds {
    x: f64,
    y: f64,
    width: f64,
    height: f64,
    scale: f64,
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

    pub fn remove(&mut self, selection_id: &str) -> Option<PopupSelection> {
        self.selections.remove(selection_id)
    }

    pub fn clear(&mut self) {
        self.selections.clear();
    }
}

#[derive(Debug, Error)]
pub enum PopupManagerError {
    #[error("failed to create popup window: {0}")]
    Window(#[from] tauri::Error),
    #[error("failed to resolve popup monitor position")]
    PositionUnavailable,
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

    let min_x = monitor.x + offset;
    let max_x = (right - popup_w - offset).max(min_x);
    let min_y = monitor.y + offset;
    let max_y = (bottom - popup_h - offset).max(min_y);

    PopupPosition {
        x: x.max(min_x).min(max_x),
        y: y.max(min_y).min(max_y),
    }
}

pub fn point_in_popup_bounds(mouse_x: f64, mouse_y: f64, bounds: &MonitorBounds) -> bool {
    mouse_x >= bounds.x
        && mouse_x < bounds.x + bounds.width
        && mouse_y >= bounds.y
        && mouse_y < bounds.y + bounds.height
}

pub fn selection_popup_hit_test(
    app: &AppHandle,
    mouse_x: f64,
    mouse_y: f64,
) -> SelectionPopupHitTest {
    let Some(window) = app.get_webview_window("selection-popup") else {
        return SelectionPopupHitTest::NoPopup;
    };

    let scale = match window.scale_factor() {
        Ok(scale) if scale > 0.0 => scale,
        Ok(_) | Err(_) => return SelectionPopupHitTest::Unknown,
    };
    let position = match window.outer_position() {
        Ok(position) => position,
        Err(_) => return SelectionPopupHitTest::Unknown,
    };
    let size = match window.outer_size() {
        Ok(size) => size,
        Err(_) => return SelectionPopupHitTest::Unknown,
    };

    #[cfg(target_os = "macos")]
    let (mouse_x, mouse_y) = (mouse_x, mouse_y);
    #[cfg(not(target_os = "macos"))]
    let (mouse_x, mouse_y) = (mouse_x / scale, mouse_y / scale);

    let bounds = MonitorBounds {
        x: position.x as f64 / scale,
        y: position.y as f64 / scale,
        width: size.width as f64 / scale,
        height: size.height as f64 / scale,
    };

    if point_in_popup_bounds(mouse_x, mouse_y, &bounds) {
        SelectionPopupHitTest::Inside
    } else {
        SelectionPopupHitTest::Outside
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

    let popup_w = plugin.manifest.popup.width as f64;
    let popup_h = plugin.manifest.popup.height as f64;
    let position = resolve_popup_position(app, mouse_x, mouse_y, popup_w, popup_h)
        .ok_or(PopupManagerError::PositionUnavailable)?;

    let url = format!("/plugin-popup?selectionId={selection_id}");
    let popup = WebviewWindowBuilder::new(app, "selection-popup", WebviewUrl::App(url.into()))
        .title("")
        .inner_size(popup_w, popup_h)
        .decorations(false)
        .always_on_top(true)
        .visible_on_all_workspaces(true)
        .skip_taskbar(true)
        .resizable(false)
        .visible(false)
        .focused(false)
        .build()?;
    configure_selection_popup_window(&popup)?;

    popup.set_position(tauri::Position::Logical(LogicalPosition::new(
        position.x, position.y,
    )))?;
    popup.show()?;

    Ok(())
}

#[cfg(target_os = "macos")]
fn configure_selection_popup_window<R: tauri::Runtime>(
    popup: &tauri::WebviewWindow<R>,
) -> Result<(), PopupManagerError> {
    let popup_for_task = popup.clone();
    popup.run_on_main_thread(move || {
        if let Err(error) = configure_macos_selection_popup_window(&popup_for_task) {
            eprintln!("Failed to configure macOS selection popup window: {error}");
        }
    })?;

    Ok(())
}

#[cfg(target_os = "macos")]
fn configure_macos_selection_popup_window<R: tauri::Runtime>(
    popup: &tauri::WebviewWindow<R>,
) -> Result<(), PopupManagerError> {
    use objc2_app_kit::NSWindow;

    let ns_window = popup.ns_window()?;

    unsafe {
        let ns_window = &*ns_window.cast::<NSWindow>();
        ns_window.setCollectionBehavior(macos_selection_popup_collection_behavior(
            ns_window.collectionBehavior(),
        ));
    }

    Ok(())
}

#[cfg(not(target_os = "macos"))]
fn configure_selection_popup_window<R: tauri::Runtime>(
    _popup: &tauri::WebviewWindow<R>,
) -> Result<(), PopupManagerError> {
    Ok(())
}

#[cfg(target_os = "macos")]
fn macos_selection_popup_collection_behavior(
    current: objc2_app_kit::NSWindowCollectionBehavior,
) -> objc2_app_kit::NSWindowCollectionBehavior {
    use objc2_app_kit::NSWindowCollectionBehavior;

    current
        | NSWindowCollectionBehavior::CanJoinAllSpaces
        | NSWindowCollectionBehavior::Stationary
        | NSWindowCollectionBehavior::FullScreenAuxiliary
}

fn resolve_popup_position(
    app: &AppHandle,
    mouse_x: f64,
    mouse_y: f64,
    popup_w: f64,
    popup_h: f64,
) -> Option<PopupPosition> {
    let monitors = app.available_monitors().ok()?;
    let monitors = monitors.into_iter().map(|monitor| RawMonitorBounds {
        x: monitor.position().x as f64,
        y: monitor.position().y as f64,
        width: monitor.size().width as f64,
        height: monitor.size().height as f64,
        scale: monitor.scale_factor(),
    });

    resolve_popup_position_for_monitors(mouse_x, mouse_y, popup_w, popup_h, monitors)
}

fn resolve_popup_position_for_monitors(
    mouse_x: f64,
    mouse_y: f64,
    popup_w: f64,
    popup_h: f64,
    monitors: impl IntoIterator<Item = RawMonitorBounds>,
) -> Option<PopupPosition> {
    for monitor in monitors {
        #[cfg(target_os = "macos")]
        let (mouse_x_logical, mouse_y_logical) = (mouse_x, mouse_y);
        #[cfg(not(target_os = "macos"))]
        let (mouse_x_logical, mouse_y_logical) = (mouse_x / monitor.scale, mouse_y / monitor.scale);

        let bounds = MonitorBounds {
            x: monitor.x / monitor.scale,
            y: monitor.y / monitor.scale,
            width: monitor.width / monitor.scale,
            height: monitor.height / monitor.scale,
        };

        let mouse_in_monitor = mouse_x_logical >= bounds.x
            && mouse_x_logical < bounds.x + bounds.width
            && mouse_y_logical >= bounds.y
            && mouse_y_logical < bounds.y + bounds.height;

        if mouse_in_monitor {
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
    use crate::models::{
        InstalledPlugin, LanguagePreference, LocalizedText, PluginManifest, PluginPermissions,
        PluginViewContext, PopupManifest,
    };

    fn test_selection(selection_id: &str, selected_text: &str) -> PopupSelection {
        let plugin = InstalledPlugin {
            id: "quick-search".to_string(),
            manifest: PluginManifest {
                id: "quick-search".to_string(),
                name: LocalizedText {
                    zh_cn: None,
                    en: Some("Quick Search".to_string()),
                },
                version: "1.0.0".to_string(),
                matcher: ".*".to_string(),
                popup: PopupManifest {
                    entry: "index.html".to_string(),
                    width: 320,
                    height: 180,
                },
                settings: None,
                permissions: PluginPermissions::default(),
            },
            enabled: true,
            has_settings: false,
        };
        let context = PluginViewContext {
            selected_text: Some(selected_text.to_string()),
            locale: "en-US".to_string(),
            language_preference: LanguagePreference::En,
            plugin_id: plugin.id.clone(),
            plugin_version: plugin.manifest.version.clone(),
            app_version: "0.1.0".to_string(),
        };

        PopupSelection {
            selection_id: selection_id.to_string(),
            plugin,
            context,
        }
    }

    #[test]
    fn runtime_state_get_clones_without_removing_selection() {
        let mut state = PopupRuntimeState::default();
        state.insert(test_selection("1", "hello"));

        let first = state.get("1").unwrap();
        let second = state.get("1").unwrap();

        assert_eq!(first.context.selected_text.as_deref(), Some("hello"));
        assert_eq!(second.context.selected_text.as_deref(), Some("hello"));
    }

    #[test]
    fn runtime_state_remove_evicts_selection() {
        let mut state = PopupRuntimeState::default();
        state.insert(test_selection("1", "hello"));

        let removed = state.remove("1").unwrap();

        assert_eq!(removed.context.selected_text.as_deref(), Some("hello"));
        assert!(state.get("1").is_none());
    }

    #[test]
    fn runtime_state_clear_evicts_all_selections() {
        let mut state = PopupRuntimeState::default();
        state.insert(test_selection("1", "hello"));
        state.insert(test_selection("2", "world"));

        state.clear();

        assert!(state.get("1").is_none());
        assert!(state.get("2").is_none());
    }

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
    fn detects_points_inside_popup_bounds() {
        let bounds = MonitorBounds {
            x: 100.0,
            y: 200.0,
            width: 320.0,
            height: 180.0,
        };

        assert!(point_in_popup_bounds(100.0, 200.0, &bounds));
        assert!(point_in_popup_bounds(419.0, 379.0, &bounds));
        assert!(!point_in_popup_bounds(420.0, 379.0, &bounds));
        assert!(!point_in_popup_bounds(419.0, 380.0, &bounds));
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

    #[test]
    fn clamps_to_lower_bound_when_popup_exceeds_safe_monitor_area() {
        let monitor = MonitorBounds {
            x: 0.0,
            y: 0.0,
            width: 100.0,
            height: 80.0,
        };

        let pos = clamp_popup_position(50.0, 40.0, 120.0, 90.0, &monitor);

        assert_eq!(pos, PopupPosition { x: 10.0, y: 10.0 });
    }

    #[cfg(target_os = "macos")]
    #[test]
    fn resolves_macos_logical_mouse_coordinates_against_logical_monitor_bounds() {
        let monitors = [RawMonitorBounds {
            x: 2880.0,
            y: 0.0,
            width: 2880.0,
            height: 1800.0,
            scale: 2.0,
        }];

        let pos = resolve_popup_position_for_monitors(1500.0, 200.0, 320.0, 180.0, monitors);

        assert_eq!(
            pos,
            Some(PopupPosition {
                x: 1510.0,
                y: 210.0
            })
        );
    }

    #[cfg(target_os = "macos")]
    #[test]
    fn macos_selection_popup_collection_behavior_joins_full_screen_spaces() {
        use objc2_app_kit::NSWindowCollectionBehavior;

        let behavior =
            macos_selection_popup_collection_behavior(NSWindowCollectionBehavior::Default);

        assert!(behavior.contains(NSWindowCollectionBehavior::CanJoinAllSpaces));
        assert!(behavior.contains(NSWindowCollectionBehavior::Stationary));
        assert!(behavior.contains(NSWindowCollectionBehavior::FullScreenAuxiliary));
    }
}
