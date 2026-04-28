# JSON Previewer Plugin Design

Date: 2026-04-28
Project: oh-my-select

## Summary

Add a new example local plugin at `examples/plugins/json-previewer`. The plugin appears when the trimmed selected text is either a JSON object or a JSON string whose decoded contents are a JSON object. It formats that object in a compact popup and lets users copy either the formatted object JSON or the serialized JSON string literal.

This is an example plugin, not a built-in default plugin. Users import it from Settings the same way they import `examples/plugins/quick-search` and `examples/plugins/color-converter`.

## Goals

- Provide an example plugin named JSON Previewer / JSON 预览器.
- Match selected text only when it represents a JSON object in one of two forms:
  - Direct object JSON, such as `{"a":1}`.
  - Serialized JSON string literal, such as `"{\"a\":1}"`, where the decoded string is object JSON.
- Reject arrays, primitive JSON values, ordinary strings, broken JSON, and text with extra non-whitespace content outside the JSON value.
- Format and preview the parsed object using the configured indentation.
- Let users copy a deserialized object JSON form.
- Let users copy a serialized JSON string literal form.
- Add a settings page where users configure JSON indentation size.
- Default indentation to 2 spaces.
- Keep the implementation inside the plugin folder and use the existing plugin protocol.

## Non-Goals

- Do not make the plugin built in or auto-installed.
- Do not change the host plugin API, Tauri commands, or bridge methods.
- Do not support JSON arrays in this slice.
- Do not support comments, JSON5, trailing commas, or non-standard JSON syntax.
- Do not add external package dependencies.
- Do not add tree expand/collapse controls, syntax highlighting, search, path copying, or schema validation.
- Do not open external URLs.

## Plugin Package

The plugin directory should be:

```text
examples/plugins/json-previewer/
  manifest.json
  matcher.js
  json-core.js
  popup.html
  settings.html
  README.md
  matcher.test.js
  json-core.test.js
  popup.test.js
  settings.test.js
  plugin-package.test.js
```

Manifest shape:

```json
{
  "id": "json-previewer",
  "name": {
    "zh-CN": "JSON 预览器",
    "en": "JSON Previewer"
  },
  "version": "0.1.0",
  "matcher": "matcher.js",
  "popup": {
    "entry": "popup.html",
    "width": 460,
    "height": 420
  },
  "settings": {
    "entry": "settings.html"
  },
  "permissions": {
    "openExternal": false,
    "storage": true
  }
}
```

The popup dimensions stay within the existing host validation bounds.

## Core Parsing Model

`json-core.js` owns JSON parsing, formatting, serialization output, and indentation validation. The matcher, popup, settings page, and tests should reuse it where practical.

Core functions should include:

- `parseJsonObjectSelection(text)`:
  - Trim input.
  - Parse direct JSON object values.
  - Parse serialized JSON string literal values, then parse the decoded string as JSON.
  - Return a normalized result for valid object inputs.
  - Return `null` for unsupported values.
- `formatObject(object, indentSize)`:
  - Return `JSON.stringify(object, null, indentSize)`.
- `serializeObject(object)`:
  - Return a JSON string literal of the compact object JSON.
  - Equivalent output shape: `JSON.stringify(JSON.stringify(object))`.
- `normalizeIndent(value)`:
  - Accept only integer numbers from 0 through 8.
  - Return the normalized integer when valid.
  - Return `null` when invalid.
- `indentOrDefault(value)`:
  - Return `normalizeIndent(value) ?? 2`.

Normalized parse result:

```js
{
  object: parsedObject,
  sourceText: trimmedOriginalText,
  sourceKind: "object" | "serialized-string"
}
```

A value is considered a JSON object only when `typeof value === "object"`, `value !== null`, and `Array.isArray(value) === false`.

## Matcher Behavior

`matcher.js` exports a synchronous `match(context)` function. It trims `context.selectedText` and returns `true` only when `parseJsonObjectSelection` would return a normalized result.

The matcher should be conservative:

- Accept direct object JSON with optional surrounding whitespace.
- Accept serialized JSON string literal input only when the decoded string parses to an object JSON value.
- Reject arrays, including arrays of objects.
- Reject string, number, boolean, and null JSON values.
- Reject ordinary text and invalid JSON.
- Reject object JSON followed or preceded by non-whitespace text.
- Reject non-string context values.

The popup performs the authoritative parse again before rendering. Matcher and popup validation should stay aligned so the host does not open a popup for a value the popup cannot display.

## Popup Behavior

The popup reads `window.ohMySelect.context.selectedText`, trims it, parses it through `parseJsonObjectSelection`, reads `indentSize` from plugin storage, and renders the formatted object JSON.

Settings lookup:

1. Call `window.ohMySelect.storage.get("indentSize")`.
2. Use `indentOrDefault(storedValue)`.
3. If storage read fails or the stored value is invalid, use 2.

Copy outputs:

- Deserialized JSON:
  - Copy `formatObject(object, indentSize)`.
  - Example output:

    ```json
    {
      "a": 1
    }
    ```

- Serialized JSON:
  - Copy `serializeObject(object)`.
  - Example output:

    ```json
    "{\"a\":1}"
    ```

The serialized copy form is intentionally compact. The preview and deserialized copy form honor the configured indentation.

## Popup UI

Use a compact developer utility layout:

- Top section:
  - Title: JSON Previewer / JSON 预览器.
  - Source kind: JSON object or Serialized JSON string.
  - Original selected text in a single truncated line with the full value in `title`.
- Preview section:
  - A stable-height `<pre><code>` area.
  - Monospace type.
  - `white-space: pre`.
  - Horizontal and vertical scrolling for long keys, long values, or deep nesting.
  - The preview area should not resize the popup layout when content changes.
- Bottom actions:
  - Copy deserialized JSON.
  - Copy serialized JSON.
  - Each button has a copy icon and visible text.
  - A shared `aria-live="polite"` status area reports copy success or failure.

Visual direction:

- Light compact utility panel.
- Background near `#F8FAFC`, text near `#020617`, muted text near `#475569`, visible borders.
- High contrast for normal text.
- No decorative gradients or oversized hero treatment.
- Stable button, preview, and status dimensions so copy states do not shift layout.

Accessibility:

- Copy controls are real `<button>` elements.
- Buttons have clear labels.
- Focus states are visible.
- Tab order follows visual order.
- Status text communicates success or failure without relying on color alone.
- The preview region has an accessible label.

Visible labels should follow `window.ohMySelect.context.locale`. The plugin should provide English and Chinese text for title, source kind, original value label, copy buttons, copied state, failed state, unsupported fallback, close action, settings labels, validation error, and save status.

## Copy Interaction

Clicking a copy button copies that output value.

Preferred behavior:

1. Try `navigator.clipboard.writeText(value)` from the click handler.
2. If Clipboard API is unavailable or rejected, fall back to a temporary textarea and `document.execCommand("copy")`.
3. On success, show `Copied` / `已复制` for about 1.2 seconds.
4. On failure, show `Copy failed` / `复制失败`.
5. Do not close the popup after copying.

Because the current host does not expose a clipboard bridge, implementation must verify that at least one browser copy path works inside the existing sandboxed plugin iframe. If both browser copy paths are blocked, pause and revise this design instead of silently adding a broader host bridge.

## Settings Page

`settings.html` lets users configure the JSON indentation size.

Behavior:

- Read `indentSize` from `window.ohMySelect.storage` on load.
- Display stored valid indentation, otherwise display `2`.
- Use an `<input type="number">` with a visible label.
- Validate in JavaScript before saving.
- Accept only integer values from 0 through 8.
- Save the normalized number under storage key `indentSize`.
- Show success feedback after saving.
- Show validation error feedback and do not save when the value is empty, non-numeric, fractional, negative, greater than 8, or otherwise invalid.

Settings copy should explain the valid range:

- English: `Indent size (0-8 spaces)`
- Chinese: `缩进大小（0-8 个空格）`

`0` is valid and means compact single-line object JSON for preview and deserialized copy output.

## Error Handling

- Non-JSON or unsupported JSON text: matcher returns `false`, so no popup opens.
- Matcher errors: host behavior remains unchanged; the host logs the plugin error and continues to later plugins.
- Popup parse failure: show a compact fallback state saying `Unsupported JSON object` / `不支持的 JSON 对象` and include a close button that calls `window.ohMySelect.closePopup()`.
- Storage read failure: render with default indentation `2`.
- Storage write failure: keep the settings page open and show a failure message.
- Clipboard failure: keep the popup open and show failure feedback.

## Testing Strategy

Automated tests:

- `matcher.test.js`:
  - Accept direct object JSON.
  - Accept direct object JSON with surrounding whitespace.
  - Accept nested object JSON.
  - Accept serialized JSON string literal values whose decoded content is object JSON.
  - Reject arrays, including arrays of objects.
  - Reject primitive JSON values.
  - Reject ordinary strings, broken JSON, extra trailing text, empty values, and non-string context values.
- `json-core.test.js`:
  - Validate source kind detection for direct objects and serialized strings.
  - Validate object-only acceptance.
  - Validate formatted output for default indentation.
  - Validate compact output when indentation is 0.
  - Validate `normalizeIndent` accepts only integers from 0 through 8.
  - Validate invalid indentation is rejected.
  - Validate serialized copy output is a JSON string literal containing compact object JSON.
- `popup.test.js`:
  - Load `popup.html` in JSDOM with direct object input.
  - Confirm title, source kind, original value, formatted preview, and both copy buttons render.
  - Load serialized string input and confirm the decoded object is previewed.
  - Confirm the popup reads a valid stored indentation value.
- `settings.test.js`:
  - Load `settings.html` in JSDOM.
  - Confirm default value is 2 when storage is empty.
  - Confirm a valid value is saved to `indentSize`.
  - Confirm invalid values are rejected and not saved.
  - Confirm localized Chinese labels render when locale is `zh-CN`.
- `plugin-package.test.js`:
  - Validate manifest metadata and permissions.
  - Validate referenced files exist.
  - Validate `popup.html` and `settings.html` load `json-core.js` without module imports.
  - Validate popup contains accessible copy controls and an `aria-live` status area.

Manual acceptance samples:

- Accepted:

  ```text
  {"name":"oh-my-select","enabled":true}
    { "nested": { "count": 2 } }
  "{\"name\":\"oh-my-select\",\"enabled\":true}"
  ```

- Rejected:

  ```text
  [{"a":1}]
  "hello"
  123
  null
  true
  {"a":1} trailing
  ```

Manual integration flow:

1. Run the app.
2. Open Settings from the tray.
3. Import `examples/plugins/json-previewer`.
4. Open the plugin settings page.
5. Confirm the indentation setting defaults to 2.
6. Save indentation values `0`, `2`, and `4`, then confirm the popup preview uses the selected indentation.
7. Try invalid indentation values such as empty, `-1`, `2.5`, `9`, and `abc`, then confirm they are not saved.
8. Select accepted JSON samples in another app and confirm the popup appears.
9. Select rejected samples and confirm no JSON preview popup appears.
10. Confirm the popup source kind distinguishes direct objects from serialized JSON strings.
11. Confirm copy deserialized JSON copies the formatted object JSON.
12. Confirm copy serialized JSON copies a JSON string literal.
13. Confirm long JSON values scroll inside the preview area instead of stretching the popup.

## Documentation Updates

- Add `examples/plugins/json-previewer/README.md` with supported inputs, rejected inputs, copy output semantics, indentation settings, and manual check steps.
- Update the root `README.md` example plugin list to include `json-previewer`.

## Future Extensions

- Add optional array support.
- Add syntax highlighting.
- Add collapsible object tree rendering.
- Add copy JSON path actions.
- Add a setting for compact versus formatted serialized copy output.
