# Color Converter Plugin Design

Date: 2026-04-27
Project: oh-my-select

## Summary

Add a second example local plugin at `examples/plugins/color-converter`. The plugin appears when the trimmed selected text is a supported CSS color value, previews the color in a compact popup, and lists equivalent values in HEX, RGB, HSL, and OKLCH formats. Each output row includes a copy button.

This is an example plugin, not a built-in default plugin. Users import it from Settings the same way they import `examples/plugins/quick-search`.

## Goals

- Provide an example plugin named Color Converter / 颜色转换器.
- Match selected text only when it is one of the supported color syntaxes.
- Support practical core CSS color formats:
  - `#rgb`, `#rgba`, `#rrggbb`, `#rrggbbaa`
  - `rgb()` and `rgba()`
  - `hsl()` and `hsla()`
  - `oklch()`
- Treat HEX input as case-insensitive.
- Output HEX values in uppercase.
- Show a color swatch preview for the parsed color.
- Show converted HEX, RGB, HSL, and OKLCH values.
- Let users copy each converted value independently.
- Keep the implementation inside the plugin folder and use the existing plugin protocol.

## Non-Goals

- Do not make the plugin built in or auto-installed.
- Do not change the host plugin API, Tauri commands, or bridge methods.
- Do not add a settings page for the plugin.
- Do not support named colors, `hwb()`, `lab()`, `lch()`, or `oklab()` in this slice.
- Do not add external package dependencies.

## Plugin Package

The plugin directory should be:

```text
examples/plugins/color-converter/
  manifest.json
  matcher.js
  popup.html
```

Manifest shape:

```json
{
  "id": "color-converter",
  "name": {
    "zh-CN": "颜色转换器",
    "en": "Color Converter"
  },
  "version": "0.1.0",
  "matcher": "matcher.js",
  "popup": {
    "entry": "popup.html",
    "width": 380,
    "height": 300
  },
  "permissions": {
    "openExternal": false,
    "storage": false
  }
}
```

The popup dimensions stay within the existing host validation bounds.

## Matcher Behavior

`matcher.js` exports a synchronous `match(context)` function. It trims `context.selectedText` and returns `true` only for supported color syntax.

The matcher should be conservative:

- Accept HEX with 3, 4, 6, or 8 hexadecimal digits after `#`.
- Match HEX with case-insensitive hexadecimal character checks.
- Accept `rgb()` / `rgba()` with comma syntax or modern space syntax.
- Accept `hsl()` / `hsla()` with comma syntax or modern space syntax.
- Accept `oklch()` with optional alpha.
- Reject incomplete, malformed, or unsupported values such as `#12`, `#xyzxyz`, `rgb()`, `hello`, and bare `123456`.

The popup performs the authoritative parse again before rendering. Matcher and popup validation should stay intentionally aligned so the host does not open a popup for a value the popup cannot display.

## Parsing And Conversion

The popup reads `window.ohMySelect.context.selectedText`, trims it, parses it into a normalized color object, then derives output strings.

Normalized internal fields:

- `r`, `g`, `b`: integers from 0 to 255.
- `a`: alpha from 0 to 1.
- `sourceFormat`: one of `HEX`, `RGB`, `HSL`, or `OKLCH`.
- `sourceText`: the trimmed original selected text.

Supported input details:

- HEX:
  - `#rgb` expands to `#rrggbb`.
  - `#rgba` expands to `#rrggbbaa`.
  - `#rrggbb` and `#rrggbbaa` are accepted in any letter case.
- RGB / RGBA:
  - Accept comma syntax: `rgb(34, 197, 94)`, `rgba(34, 197, 94, .8)`.
  - Accept modern syntax: `rgb(34 197 94)`, `rgb(34 197 94 / 80%)`.
  - RGB channels must resolve to 0 through 255.
- HSL / HSLA:
  - Accept comma syntax and modern space syntax.
  - Saturation and lightness must be percentages.
  - Hue can wrap into the 0 through 360 range.
- OKLCH:
  - Accept `oklch(l c h)` and `oklch(l c h / alpha)`.
  - Lightness and chroma must be numeric values the converter can map to sRGB.
  - Hue can wrap into the 0 through 360 range.

Output formatting:

- HEX:
  - Alpha `1` outputs `#RRGGBB`.
  - Alpha below `1` outputs `#RRGGBBAA`.
  - Letters are always uppercase.
- RGB:
  - Alpha `1` outputs `rgb(r g b)`.
  - Alpha below `1` outputs `rgb(r g b / a)`.
- HSL:
  - Alpha `1` outputs `hsl(h s% l%)`.
  - Alpha below `1` outputs `hsl(h s% l% / a)`.
- OKLCH:
  - Alpha `1` outputs `oklch(l c h)`.
  - Alpha below `1` outputs `oklch(l c h / a)`.

Numeric output should be stable and readable: round hue to one decimal when needed, percentages to practical precision, and alpha to a concise decimal unless the input maps cleanly to a percentage-equivalent value.

## Popup UI

Use the approved "preview first plus compact list" layout:

- Top section:
  - Left: fixed-size color swatch, around 82px square.
  - Right: detected source value, source format label, and brief context text.
- Conversion list:
  - Four rows: HEX, RGB, HSL, OKLCH.
  - Each row has a format label, converted value, and copy button.
  - The value column truncates visually if needed but keeps the full value in `title`.
  - Copy buttons use inline SVG icons, not emoji.

Visual direction:

- Light compact utility panel.
- Background `#F8FAFC`, text near `#020617`, muted text near `#475569`, visible borders.
- High contrast for normal text.
- No decorative gradients or oversized hero treatment.
- The swatch sits on a checkerboard base so transparent colors are understandable.
- The actual parsed color overlays the checkerboard with its alpha.

Accessibility:

- Copy controls are real `<button>` elements.
- Buttons have clear labels such as `Copy HEX value`.
- Focus states are visible.
- Click targets are large enough for a small desktop popup.
- Copied and failed states are shown with text, not color alone.

Visible labels should follow `window.ohMySelect.context.locale`. The plugin should provide English and Chinese text for the title, source label, copy labels, copied state, failed state, unsupported fallback, and close action.

## Copy Interaction

Clicking a row's copy button copies that row's full value.

Preferred behavior:

1. Try `navigator.clipboard.writeText(value)` from the click handler.
2. If Clipboard API is unavailable or rejected, fall back to a temporary textarea and `document.execCommand("copy")`.
3. On success, show `Copied` for that row for about 1.2 seconds.
4. On failure, show `Copy failed` for that row.
5. Do not close the popup after copying.

The plugin does not need storage or external URL permissions.

Because the current host does not expose a clipboard bridge, implementation must verify that at least one browser copy path works inside the existing sandboxed plugin iframe. If both browser copy paths are blocked, pause and revise this design instead of silently adding a broader host bridge.

## Error Handling

- Non-color text: matcher returns `false`, so no popup opens.
- Matcher errors: host behavior remains unchanged; the host logs the plugin error and continues to later plugins.
- Popup parse failure: show a compact fallback state saying `Unsupported color value` and include a close button that calls `window.ohMySelect.closePopup()`.
- Clipboard failure: keep the popup open and show row-level failure feedback.

## Testing Strategy

Manual acceptance samples:

- HEX:
  - `#fff`
  - `#FFFF`
  - `#22c55e`
  - `#22C55Ecc`
  - Confirm all match and output uppercase HEX.
- RGB / RGBA:
  - `rgb(34, 197, 94)`
  - `rgba(34, 197, 94, .8)`
  - `rgb(34 197 94 / 80%)`
- HSL / HSLA:
  - `hsl(142 71% 45%)`
  - `hsla(142, 71%, 45%, .8)`
- OKLCH:
  - `oklch(0.72 0.19 149.6)`
  - `oklch(0.72 0.19 149.6 / .8)`
- Rejected:
  - `hello`
  - `123456`
  - `rgb()`
  - `#12`
  - `#xyzxyz`

Manual integration flow:

1. Run the app.
2. Open Settings from the tray.
3. Import `examples/plugins/color-converter`.
4. Select the accepted samples in another app and confirm the popup appears.
5. Select rejected samples and confirm no color converter popup appears.
6. Confirm the swatch previews the selected color.
7. Confirm transparent colors show the checkerboard background.
8. Confirm each output row copies the full value.
9. Confirm long values do not stretch or break the popup.

## Future Extensions

- Add named CSS colors.
- Add `hwb()`, `lab()`, `lch()`, and `oklab()`.
- Add a settings page for preferred output syntax.
- Add host-level clipboard bridge support if sandboxed browser clipboard behavior becomes unreliable.
