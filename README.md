# oh-my-select

oh-my-select is a tray-first Tauri app for showing plugin-owned popup views when text is selected.

## Development

Run the desktop app:

```bash
bun run tauri dev
```

The app starts hidden in the system tray. Click the tray icon to open Settings.

## Example Plugin

An example local plugin lives at:

```text
examples/plugins/quick-search
```

Open Settings, import that folder, select text in another application, and the plugin popup should appear near the cursor.

The example plugin includes:

- `matcher.js`: accepts non-empty selected text.
- `popup.html`: displays the selected text and opens a search URL.
- `settings.html`: stores the search URL prefix used by the popup.
