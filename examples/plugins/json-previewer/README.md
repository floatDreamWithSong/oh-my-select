# JSON Previewer

Example oh-my-select plugin for selected JSON object values.

## Supported Inputs

- JSON objects, such as `{"a":1}`
- Serialized JSON string literals whose decoded value is a JSON object, such as `"{\"a\":1}"`

Leading and trailing whitespace is trimmed before matching.

## Unsupported Inputs

- Arrays, primitives, empty values, or broken JSON
- JSON with comments, trailing commas, or JSON5 syntax
- JSON surrounded by extra text

## Copy Outputs

- Deserialized JSON copies formatted object JSON using the configured indentation. For `{"a":1}`, the default output is:

```json
{
  "a": 1
}
```

- Serialized JSON copies a JSON string literal with compact object JSON. For `{"a":1}`, the output is:

```json
"{\"a\":1}"
```

## Settings

Indentation accepts integer values from `0` through `8`. The default is `2`, and invalid values are not saved.

## Try These Values

```text
{"name":"oh-my-select","enabled":true}
  { "nested": { "count": 2 } }
"{\"name\":\"oh-my-select\",\"enabled\":true}"
```

## Manual Check

1. Run the app with `bun run tauri dev`.
2. Open Settings from the tray.
3. Import this folder.
4. Open the JSON Previewer plugin settings.
5. Confirm the indentation setting defaults to `2`.
6. Save representative indentation values such as `0`, `2`, and `4`, reopening settings after each save to confirm the value persists.
7. Try invalid indentation values outside `0` through `8` and confirm they are not saved.
8. Select one supported value in another application.
9. Confirm the popup shows formatted JSON and deserialized and serialized copy rows.
10. Select rejected inputs such as `[1]`, `true`, `{ broken`, `{ "a": 1, }`, and `prefix {"a":1}` and confirm the plugin does not match.
11. With indentation `2`, copy deserialized output for `{"a":1}` and confirm the clipboard contains formatted object JSON:

```json
{
  "a": 1
}
```

12. Copy serialized output for `{"a":1}` and confirm the clipboard contains the compact JSON string literal:

```json
"{\"a\":1}"
```

13. Confirm the shared status reports `Copied` after copy actions.
