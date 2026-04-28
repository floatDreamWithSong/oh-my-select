# Time Converter Plugin Design

Date: 2026-04-28
Project: oh-my-select

## Summary

Add a third example local plugin at `examples/plugins/time-converter`. The plugin appears when the trimmed selected text is a supported time value, normalizes it to one JavaScript `Date`, and lists equivalent time formats. Each output row includes a copy button.

This is an example plugin, not a built-in default plugin. Users import it from Settings the same way they import `examples/plugins/quick-search` and `examples/plugins/color-converter`.

## Goals

- Provide an example plugin named Time Converter / 时间转换器.
- Match selected text only when it is a supported time value.
- Support 10-digit Unix timestamps in seconds.
- Support 13-digit timestamps in milliseconds.
- Support common formatted date or date-time strings that can be converted to a valid time.
- Parse formatted strings without an explicit timezone as the system local timezone.
- Show six equivalent output formats:
  - Unix seconds
  - Milliseconds
  - ISO 8601 UTC
  - Local date time
  - Local date
  - RFC 2822
- Let users copy each output value independently.
- Keep the implementation inside the plugin folder and use the existing plugin protocol.

## Non-Goals

- Do not make the plugin built in or auto-installed.
- Do not change the host plugin API, Tauri commands, or bridge methods.
- Do not add a settings page for the plugin.
- Do not add external package dependencies.
- Do not support relative natural-language dates such as `tomorrow`, `next Friday`, or `2 hours ago`.
- Do not accept ambiguous numeric values other than exactly 10 or 13 digits.

## Plugin Package

The plugin directory should be:

```text
examples/plugins/time-converter/
  manifest.json
  matcher.js
  time-core.js
  popup.html
  README.md
```

Manifest shape:

```json
{
  "id": "time-converter",
  "name": {
    "zh-CN": "时间转换器",
    "en": "Time Converter"
  },
  "version": "0.1.0",
  "matcher": "matcher.js",
  "popup": {
    "entry": "popup.html",
    "width": 420,
    "height": 340
  },
  "permissions": {
    "openExternal": false,
    "storage": false
  }
}
```

The popup dimensions stay within the existing host validation bounds.

## Matcher Behavior

`matcher.js` exports a synchronous `match(context)` function. It trims `context.selectedText` and returns `true` only for supported time syntax.

The matcher should be conservative:

- Accept exactly 10 ASCII digits as a Unix seconds timestamp.
- Accept exactly 13 ASCII digits as a millisecond timestamp.
- Accept common formatted date or date-time strings that parse to a valid date.
- Reject empty strings, non-string context values, ordinary numbers such as `123456`, year-only values such as `2026`, invalid dates such as `2026-02-30`, and arbitrary text such as `hello`.

The popup performs the authoritative parse again before rendering. Matcher and popup validation should stay aligned so the host does not open a popup for a value the popup cannot display.

## Parsing And Normalization

The popup reads `window.ohMySelect.context.selectedText`, trims it, parses it into a normalized time object, then derives output strings.

Normalized internal fields:

- `date`: the parsed JavaScript `Date`.
- `sourceText`: the trimmed original selected text.
- `sourceKind`: one of `unix-seconds`, `milliseconds`, `local-string`, or `timezone-string`.
- `sourceMeta`: user-facing parse context for the popup.

Supported input details:

- 10-digit numeric input:
  - Parse as Unix seconds.
  - Multiply by 1000 to create the `Date`.
  - Reject values outside the JavaScript `Date` range.
- 13-digit numeric input:
  - Parse as milliseconds since the Unix epoch.
  - Reject values outside the JavaScript `Date` range.
- Formatted strings:
  - Accept date or date-time strings that produce a valid `Date`.
  - Treat strings without an explicit timezone as system-local time.
  - Treat date-only strings such as `2026-04-28` as local midnight.
  - Treat strings with `Z`, numeric timezone offsets, or timezone names as timezone-aware.
  - Reject year-only strings because they are too ambiguous for this plugin's popup workflow.
  - Reject impossible calendar dates by round-tripping recognized numeric date parts when possible, so values like `2026-02-30` do not silently roll over.

The implementation should avoid broad natural-language parsing. It should rely on native `Date` only after the input passes simple shape checks for timestamp or formatted date-time text.

## Output Formatting

For a parsed time, output:

- Unix seconds: `Math.floor(date.getTime() / 1000)` as a decimal string.
- Milliseconds: `date.getTime()` as a decimal string.
- ISO 8601 UTC: `date.toISOString()`.
- Local date time: a stable local format such as `YYYY-MM-DD HH:mm:ss`.
- Local date: a stable local format such as `YYYY-MM-DD`.
- RFC 2822: `date.toUTCString()`.

The formatted local outputs should use zero-padded numeric fields and the system local timezone. Output labels are localized, but values remain stable machine-readable strings.

## Popup UI

Use the approved "preview first plus compact list" layout:

- Top section:
  - Left: fixed-size time badge with the local `HH:mm` preview.
  - Right: detected source value, source kind label, and parse context.
- Conversion list:
  - Six rows: Unix seconds, milliseconds, ISO 8601 UTC, local date time, local date, and RFC 2822.
  - Each row has a format label, converted value, copy button, and row-level status text.
  - The value column truncates visually if needed but keeps the full value in `title`.
  - Copy buttons use inline SVG icons, not emoji.

Visual direction:

- Light compact utility panel.
- Background `#F8FAFC`, text near `#020617`, muted text near `#475569`, visible borders.
- High contrast for normal text.
- No decorative gradients or oversized hero treatment.
- Stable row dimensions so copy states do not shift layout.

Accessibility:

- Copy controls are real `<button>` elements.
- Buttons have clear labels such as `Copy Unix seconds value`.
- Focus states are visible.
- Tab order follows the visual row order.
- Copied and failed states are shown with text, not color alone.

Visible labels should follow `window.ohMySelect.context.locale`. The plugin should provide English and Chinese text for the title, source label, parse context, row labels, copy labels, copied state, failed state, unsupported fallback, and close action.

## Copy Interaction

Clicking a row's copy button copies that row's full value.

Preferred behavior:

1. Try `navigator.clipboard.writeText(value)` from the click handler.
2. If Clipboard API is unavailable or rejected, fall back to a temporary textarea and `document.execCommand("copy")`.
3. On success, show `Copied` for that row for about 1.2 seconds.
4. On failure, show `Copy failed` for that row.
5. Do not close the popup after copying.

The plugin does not need storage or external URL permissions.

## Error Handling

- Non-time text: matcher returns `false`, so no popup opens.
- Matcher errors: host behavior remains unchanged; the host logs the plugin error and continues to later plugins.
- Popup parse failure: show a compact fallback state saying `Unsupported time value` and include a close button that calls `window.ohMySelect.closePopup()`.
- Clipboard failure: keep the popup open and show row-level failure feedback.

## Testing Strategy

Automated tests:

- `matcher.test.js`:
  - Accept 10-digit Unix seconds.
  - Accept 13-digit milliseconds.
  - Accept common formatted date and date-time strings.
  - Reject empty values, non-string values, ordinary numbers, year-only values, invalid dates, and arbitrary text.
- `time-core.test.js`:
  - Validate timestamp parsing.
  - Validate formatted string parsing.
  - Validate local timezone behavior for strings without explicit timezones.
  - Validate timezone-aware behavior for strings with `Z`, offsets, or timezone names.
  - Validate all six output formats.
  - Validate invalid values return `null`.
- `plugin-package.test.js`:
  - Validate manifest metadata and disabled permissions.
  - Validate referenced files exist.
  - Validate `popup.html` loads `time-core.js` without module imports.
  - Validate the popup contains row-level status and accessible copy controls.

Manual acceptance samples:

- Accepted:
  - `1714298400`
  - `1714298400000`
  - `2026-04-28`
  - `2026-04-28 10:30:00`
  - `2026-04-28T10:30:00Z`
  - `Tue, 28 Apr 2026 10:30:00 GMT`
- Rejected:
  - `123456`
  - `2026`
  - `2026-02-30`
  - `hello`
  - empty string

Manual integration flow:

1. Run the app.
2. Open Settings from the tray.
3. Import `examples/plugins/time-converter`.
4. Select the accepted samples in another app and confirm the popup appears.
5. Select rejected samples and confirm no time converter popup appears.
6. Confirm the top section shows the original value and parse context.
7. Confirm all six rows display equivalent values.
8. Confirm each output row copies the full value.
9. Confirm long values do not stretch or break the popup.

## Documentation Updates

- Add `examples/plugins/time-converter/README.md` with supported inputs, sample values, and manual check steps.
- Update the root `README.md` example plugin list to include `time-converter`.

## Future Extensions

- Add user-configurable preferred output rows.
- Add timezone conversion rows for UTC offset presets.
- Add configurable local date display conventions.
- Add host-level clipboard bridge support if sandboxed browser clipboard behavior becomes unreliable.
