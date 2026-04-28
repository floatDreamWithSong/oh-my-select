# oh-my-select

oh-my-select is a tray-first Tauri app for showing plugin-owned popup views when text is selected.

## Development

Run the desktop app:

```bash
bun run tauri dev
```

The app starts hidden in the system tray. Click the tray icon to open Settings.

## Example Plugins

Example local plugins live under:

```text
examples/plugins
```

Open Settings, import one of the plugin folders, select text in another application, and the matching plugin popup should appear near the cursor.

Included examples:

- `quick-search`: accepts non-empty selected text, displays it, and opens a configurable search URL.
- `color-converter`: accepts supported CSS color values, previews the color, and copies HEX, RGB, HSL, or OKLCH output.
- `json-previewer`: accepts JSON objects and serialized JSON object strings, previews formatted JSON, and copies deserialized or serialized JSON output.
