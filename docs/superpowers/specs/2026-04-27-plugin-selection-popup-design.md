# Plugin Selection Popup Design

Date: 2026-04-27
Project: oh-my-select

## Summary

Build a Tauri v2 desktop app that stays silent in the system tray and reacts to text selected in any application. When text is selected, the app evaluates enabled local plugins in user-defined order. The first plugin whose synchronous matcher returns `true` owns the selection and renders its own popup view near the cursor. If no plugin matches, the app does nothing.

The first version uses a local trusted plugin model. Plugins are imported from local folders, copied into the app plugin directory, and can provide a matcher, popup view, and optional settings view. The host provides a settings window with a sidebar plus main layout for system settings and plugin settings.

## Goals

- Start silently in the tray.
- Open the settings window from the tray icon.
- Detect drag-based text selection globally.
- Evaluate enabled plugins in order and short-circuit on the first accepted match.
- Render the matched plugin's own popup UI.
- Let plugin popup JavaScript read the selected text.
- Let plugin popup and settings JavaScript read app context.
- Support importing, sorting, enabling, disabling, and removing plugins.
- Support host language settings: follow system, Chinese, and English.
- Pass the resolved locale to plugin views without forcing plugins to internationalize.
- Let plugins provide optional settings pages rendered in the settings main area.

## Non-Goals

- No plugin marketplace, signing, review flow, or remote install in the first version.
- No zip package import in the first version.
- No asynchronous matcher execution in the first version, though the protocol should leave room for it.
- No keyboard-selection or double-click-selection detection in the first version.
- No broad native bridge for arbitrary Tauri commands.

## Product Behavior

On startup, the app creates a tray icon and does not show the settings window. Clicking the tray icon opens or focuses the settings window.

When the user selects text by dragging:

1. The global selection monitor closes any existing popup on the next left mouse press.
2. On left mouse release, if the drag distance passes the threshold, the app waits briefly for the OS selection to settle.
3. The backend reads the selected text through the native selection API.
4. Empty text ends the flow silently.
5. The plugin engine evaluates enabled plugins in configured order.
6. The first plugin whose `match(context)` returns `true` gets a popup.
7. If no plugin matches, no popup appears.

## Architecture

### Rust Backend Modules

`selection_monitor`

- Listens to global mouse events through `monio`.
- Reads selected text through the `selection` crate.
- Tracks drag start and release positions.
- Applies drag threshold and selection settle delay.
- Gets the cursor position for popup placement.
- Calls the plugin engine with non-empty selected text.

`plugin_registry`

- Reads installed plugin folders from the app data directory.
- Parses and validates `manifest.json`.
- Maintains plugin order and enabled state.
- Imports local plugin folders by copying them into the app plugin directory.
- Rejects plugins with missing required files, duplicate IDs, invalid dimensions, or invalid manifest shape.

`plugin_engine`

- Builds the matcher context.
- Executes enabled matchers in order.
- Treats the first `true` result as the accepted match.
- Logs matcher errors per plugin and continues to the next plugin.
- Returns no match when every plugin returns false or fails.

`popup_manager`

- Creates dynamic popup `WebviewWindow` instances with unique labels.
- Loads the winning plugin's `popup.entry`.
- Uses manifest width and height for initial popup size.
- Positions the popup near the cursor with monitor-aware edge clamping.
- Keeps popup windows frameless, always on top, skipped from taskbar, and non-resizable.
- Closes existing selection popups on the next mouse press.

`settings_manager`

- Persists app language, plugin order, enabled state, and per-plugin storage.
- Exposes Tauri commands for settings UI operations.
- Resolves `system` language to `zh-CN` or `en`.

### React Frontend Modules

`SettingsShell`

- Provides the settings window sidebar and main layout.
- Shows app name and version at the top of the sidebar.
- Shows the fixed System Settings route first.
- Shows installed plugins as the second route group in current plugin order.
- Routes the main area to either host system settings or a plugin settings view.

`SystemSettings`

- Manages language selection.
- Imports local plugin folders.
- Sorts, enables, disables, and removes plugins.
- Shows plugin validation and import errors.

`PluginSettingsHost`

- Loads the selected plugin's optional `settings.entry`.
- Injects the same host bridge family used by plugin popup views, excluding popup-only commands when not relevant.
- Shows an empty state when the plugin has no settings page.
- Shows an unavailable state when the settings page fails to load.

## Plugin Format

Plugins are local folders. The first version supports folder import only.

```text
my-plugin/
  manifest.json
  matcher.js
  popup.html
  settings.html
  assets/
```

`settings.html` and `assets/` are optional. `manifest.json`, `matcher.js`, and `popup.html` are required.

Example manifest:

```json
{
  "id": "quick-search",
  "name": {
    "zh-CN": "Quick Search",
    "en": "Quick Search"
  },
  "version": "0.1.0",
  "matcher": "matcher.js",
  "popup": {
    "entry": "popup.html",
    "width": 360,
    "height": 240
  },
  "settings": {
    "entry": "settings.html"
  },
  "permissions": {
    "openExternal": true,
    "storage": true
  }
}
```

Matcher API:

```js
export function match(context) {
  return context.selectedText.trim().length > 0
}
```

The first version supports only synchronous matchers. The design should not prevent adding `async match(context)` later.

## Plugin Context And Bridge

Popup views and settings views receive a host bridge at `window.ohMySelect`.

Minimum context:

```js
window.ohMySelect.context
```

Fields:

- `selectedText`: the selected text for popup views. Empty or absent for settings views.
- `locale`: resolved locale, either `zh-CN` or `en`.
- `languagePreference`: one of `system`, `zh-CN`, or `en`.
- `pluginId`: current plugin ID.
- `pluginVersion`: current plugin version.
- `appVersion`: host app version.

Supported bridge methods:

- `closePopup()`: closes the current popup window. Available in popup views.
- `openExternal(url)`: opens an external URL through the host opener.
- `storage.get(key)`: reads simple per-plugin storage.
- `storage.set(key, value)`: writes simple per-plugin storage.
- `storage.remove(key)`: deletes a stored key.

The bridge does not expose generic native command invocation in the first version.

## Settings Window Design

The settings page uses a sidebar plus main layout.

Sidebar:

- Top area: app name and version.
- Fixed route group: System Settings.
- Plugin route group: installed plugins in configured order.

Main:

- System Settings route: host-owned settings UI for language and plugin management.
- Plugin route: plugin-owned settings page if `settings.entry` exists.
- Empty state: rendered when the plugin has no settings page.

Plugin management actions:

- Import local folder.
- Reorder plugins.
- Enable or disable plugins.
- Remove plugins.
- Open plugin folder as a convenience action when useful.

## Persistence

Use app data storage for installed plugins and settings.

Recommended structure:

```text
app-data/
  config.json
  plugins/
    quick-search/
      manifest.json
      matcher.js
      popup.html
      settings.html
      assets/
  plugin-storage/
    quick-search.json
```

`config.json` stores:

- `languagePreference`
- plugin IDs in display and matching order
- enabled or disabled state per plugin
- import metadata needed by the host

Per-plugin storage is namespaced by plugin ID.

## Security Model

The first version treats imported local plugins as trusted user-provided code. The host still applies baseline guardrails:

- Load plugin files only from the copied app plugin directory.
- Validate manifest shape and required entry files.
- Enforce width and height bounds for popup windows.
- Do not expose generic native invoke.
- Keep bridge methods narrow.
- Treat manifest permission fields as declarations and future extension points.

## Error Handling

- Invalid import: show a validation error in System Settings and do not install the plugin.
- Duplicate plugin ID: reject import unless a future explicit replace flow is added.
- Matcher error: log the plugin error and continue matching later plugins.
- Popup load failure: close the popup and log the error.
- Missing settings page: show an empty state.
- Settings page load failure: show a plugin settings unavailable state.
- Storage failure: return a rejected bridge call and show a host-visible error where relevant.
- Language resolution failure: fall back to English.

## Testing Strategy

Rust unit tests:

- Manifest validation.
- Duplicate ID rejection.
- Plugin order and enabled filtering.
- Match chain short-circuit behavior.
- Matcher error continuation.
- No-match silent result.
- Config read and write.

Frontend tests:

- Sidebar renders app name, version, System Settings, and plugin routes.
- Language selector updates host UI state.
- Plugin enable, disable, remove, and reorder UI states.
- Plugin with no settings page renders empty state.
- Plugin settings load failure renders unavailable state.

Integration and manual acceptance:

- App starts silently in the tray.
- Tray click opens settings.
- Local folder plugin can be imported.
- Enabled plugin order controls matching order.
- First matching plugin opens its popup.
- No matching plugin shows no popup.
- Popup JS can read selected text and locale.
- Popup JS can close itself.
- Plugin settings page can read locale and use storage.
- Popup stays on screen near monitor edges.

## Future Extensions

- Async matcher support with timeout and loading policy.
- Zip plugin import.
- Plugin replace and update flow.
- Richer permissions.
- Keyboard selection and double-click selection detection.
- Dynamic popup resizing through a future `resizePopup()` bridge.
- Built-in fallback plugins such as copy, search, or translate.
