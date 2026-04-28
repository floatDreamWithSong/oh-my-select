# Time Converter

Example oh-my-select plugin for selected time values.

## Supported Inputs

- Unix seconds: exactly 10 digits, such as `1714298400`
- Milliseconds: exactly 13 digits, such as `1714298400000`
- Local date: `2026-04-28`, parsed as local midnight
- Local date time: `2026-04-28 10:30:00`, parsed in the system local timezone
- Timezone-aware ISO: `2026-04-28T10:30:00Z` or `2026-04-28T10:30:00+08:00`
- RFC-style time: `Tue, 28 Apr 2026 10:30:00 GMT`

Ambiguous numeric values such as `123456`, year-only values such as `2026`, impossible dates such as `2026-02-30`, and natural-language values such as `tomorrow` are not supported.

## Output Formats

- Unix seconds
- Milliseconds
- ISO 8601 UTC
- Local date time
- Local date
- RFC 2822

## Try These Values

```text
1714298400
1714298400000
2026-04-28
2026-04-28 10:30:00
2026-04-28T10:30:00Z
2026-04-28T10:30:00+08:00
Tue, 28 Apr 2026 10:30:00 GMT
```

## Manual Check

1. Run the app with `bun run tauri dev`.
2. Open Settings from the tray.
3. Import this folder.
4. Select one supported value in another application.
5. Confirm the popup shows the original value and six converted rows.
6. Click each copy button and confirm the row reports `Copied`.
