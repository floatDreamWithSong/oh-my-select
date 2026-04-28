---
name: oh-my-select-plugin
description: Use when creating, updating, reviewing, or testing an oh-my-select local app plugin folder, including manifest.json, matcher.js, popup.html, optional settings.html, plugin permissions, selected-text popup behavior, and the window.ohMySelect host bridge.
---

# Oh My Select Plugin

## Overview

Build local plugins for `oh-my-select`, a tray-first Tauri app that evaluates selected text and lets the first matching plugin render a small popup near the cursor.

Use the app's existing plugin protocol before inventing host APIs. Treat host changes as a separate design decision and ask before adding new bridge methods, permissions, or Tauri commands.

## Start Here

1. Choose the target plugin folder. Use `examples/plugins/<plugin-id>` for repo examples unless the user specifies another importable folder.
2. Inspect the closest example:
   - `quick-search`: external URL opening and settings storage.
   - `color-converter`: pure conversion core plus popup copy UX.
   - `time-converter`: strict matcher acceptance/rejection matrices.
   - `json-previewer`: settings page with storage.
3. Confirm whether the plugin needs `openExternal`, `storage`, both, or neither. Keep permissions false unless the plugin uses that bridge.
4. Write or extend focused tests before implementing nontrivial matcher, parser, popup, or settings behavior.
5. Keep all plugin implementation inside the plugin folder unless the requested behavior truly requires host protocol changes.

## Plugin Package Contract

Required files:

```text
plugin-id/
  manifest.json
  matcher.js
  popup.html
```

Optional files:

```text
plugin-id/
  settings.html
  *-core.js
  *.test.js
  README.md
  assets/
```

`manifest.json` shape:

```json
{
  "id": "my-plugin",
  "name": { "zh-CN": "我的插件", "en": "My Plugin" },
  "version": "0.1.0",
  "matcher": "matcher.js",
  "popup": { "entry": "popup.html", "width": 360, "height": 220 },
  "settings": { "entry": "settings.html" },
  "permissions": { "openExternal": false, "storage": false }
}
```

Validation rules from the host:

| Field | Rule |
| --- | --- |
| `id` | Non-empty ASCII lowercase letters, digits, and hyphens only. Duplicate installed IDs are rejected. |
| paths | Relative normal path components only. No absolute paths, `..`, empty segments, Windows backslashes, or drive prefixes. |
| required files | `manifest.json`, `matcher`, and `popup.entry` must be regular files. `settings.entry` must exist when declared. |
| popup size | Width 120-800 and height 80-600. Design to the exact frame size. |
| permissions | `openExternal` gates `window.ohMySelect.openExternal`; `storage` gates `window.ohMySelect.storage.*`. |

## Matcher Rules

`matcher.js` runs in QuickJS through the Rust plugin engine, not in the browser DOM.

Use one of these exports:

```js
export function match(context) {
  return typeof context.selectedText === "string" &&
    context.selectedText.trim().length > 0
}
```

```js
export const match = (context) => {
  return context.locale === "zh-CN"
}
```

Matcher context:

```ts
type MatcherContext = {
  selectedText: string
  locale: "zh-CN" | "en"
  pluginId: string
  pluginVersion: string
}
```

Constraints:

- Return the boolean value `true` to claim the selection. Truthy strings, objects, and Promises are ignored.
- Keep work synchronous, deterministic, and fast. The host interrupts long matchers around 50ms and continues to the next plugin.
- Do not use DOM, browser APIs, network, storage, timers, or async code in matchers.
- Validate non-string or missing `selectedText` defensively in tests.
- Prefer a separate `*-core.js` for reusable parsing/conversion logic, then import that core in tests and expose it as a global for popup HTML.

## View Bridge

Plugin views are loaded through `oms-plugin://localhost/<plugin-id>/<entry>?viewKind=...` into a sandboxed iframe with `allow-scripts allow-forms`. The host injects `window.ohMySelect` before `</head>`.

Available context in popup and settings views:

```ts
window.ohMySelect.context = {
  selectedText: string | null, // only present for popup selection views
  locale: "zh-CN" | "en",
  languagePreference: "system" | "zh-CN" | "en",
  pluginId: string,
  pluginVersion: string,
  appVersion: string
}
```

Available bridge methods:

| API | View | Permission | Notes |
| --- | --- | --- | --- |
| `window.ohMySelect.closePopup()` | popup only | none | Close the active selection popup. |
| `window.ohMySelect.openExternal(url)` | popup/settings | `openExternal` | Allows only `http`, `https`, `mailto`, and `tel`. |
| `window.ohMySelect.storage.get(key)` | popup/settings | `storage` | Per-plugin JSON value storage. |
| `window.ohMySelect.storage.set(key, value)` | popup/settings | `storage` | Store JSON-serializable values. |
| `window.ohMySelect.storage.remove(key)` | popup/settings | `storage` | Remove one key. |

Local classic scripts referenced by plugin HTML are inlined by the host for `srcdoc` rendering. Keep popup/settings scripts browser-classic, not ESM:

```html
<script src="./my-core.js"></script>
<script>
  const { selectedText, locale } = window.ohMySelect.context
</script>
```

Avoid `type="module"` and `import ... from "./file.js"` in plugin HTML. Tests should assert this when a shared core file is used.

## Popup And Settings UX

- Keep layout compact for the declared popup dimensions. Fixed rows, bounded text, and `overflow` rules prevent clipped UI.
- Localize visible text from `window.ohMySelect.context.locale` when the plugin has user-facing labels.
- Render an unsupported/fallback state in popup HTML even when the matcher should prevent it; selected text can change or parsing can fail.
- Use accessible buttons and status regions for copy/save feedback, such as `aria-live="polite"`.
- For copy actions, use browser clipboard when available and a `document.execCommand("copy")` fallback. The current host bridge does not provide clipboard.
- Do not rely on external assets unless necessary; local assets must stay inside the plugin folder and use safe relative paths.

## Testing Pattern

Use Vitest from the repo root:

```bash
bun run test examples/plugins/<plugin-id>
```

Recommended tests:

| File | Coverage |
| --- | --- |
| `plugin-package.test.js` | Manifest metadata, permissions, required files, script style, frame-size CSS invariants. |
| `matcher.test.js` | Accept/reject matrix, trimming, non-string contexts, strict boolean results. |
| `*-core.test.js` | Pure parser/converter behavior and edge cases. |
| `popup.test.js` | JSDOM load, injected `window.ohMySelect`, locale labels, fallback UI, close/copy behavior, no console errors. |
| `settings.test.js` | Storage read/write, invalid stored values, validation errors, locale labels. |

When host protocol or registry behavior changes, also run:

```bash
bun run test src/lib src/components/plugin
cargo test --manifest-path src-tauri/Cargo.toml
```

## Common Mistakes

| Mistake | Fix |
| --- | --- |
| Adding a host bridge because a plugin wants convenience | Use existing `closePopup`, `openExternal`, and `storage` first; ask before changing host APIs. |
| Enabling permissions by default | Set permissions to false unless the plugin calls that bridge method. |
| Returning truthy non-boolean matcher values | Return exactly `true` only for accepted selections. |
| Using browser APIs in matcher | Move browser work to popup/settings HTML; keep matcher pure QuickJS. |
| Using ESM imports in plugin HTML | Use classic scripts and a global core object, matching existing examples. |
| Designing popup content larger than the manifest size | Shrink typography, rows, and controls or increase manifest dimensions within host limits. |
| Forgetting settings permission | Declare `permissions.storage: true` before using `window.ohMySelect.storage.*`. |
