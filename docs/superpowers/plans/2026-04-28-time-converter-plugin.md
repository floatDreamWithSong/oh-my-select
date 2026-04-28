# Time Converter Plugin Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add `examples/plugins/time-converter`, a third example plugin that matches supported selected time values, shows six equivalent formats, and lets users copy each output.

**Architecture:** The example plugin stays inside `examples/plugins/time-converter` and uses the existing local plugin protocol. `matcher.js` is self-contained because the Rust matcher engine evaluates it directly with `rquickjs`; `time-core.js` exposes parsing and formatting helpers on `globalThis` so both `popup.html` and Vitest can use the same authoritative behavior without module imports. The popup is a compact browser UI rendered inside the existing sandboxed plugin iframe.

**Tech Stack:** Tauri v2 plugin host, plain HTML/CSS/JavaScript, Vitest, existing oh-my-select bridge.

---

## Scope Check

This plan implements one coherent example-plugin slice from the approved design. It does not modify the host plugin API, add a built-in plugin installer, add a settings page, or add third-party dependencies.

## File Structure

- Create `examples/plugins/time-converter/matcher.test.js`: Vitest coverage for accepted and rejected matcher inputs.
- Create `examples/plugins/time-converter/matcher.js`: synchronous conservative matcher for 10-digit seconds, 13-digit milliseconds, and valid formatted date or date-time strings.
- Create `examples/plugins/time-converter/time-core.test.js`: Vitest coverage for parsing, timezone semantics, output formatting, and invalid values.
- Create `examples/plugins/time-converter/time-core.js`: authoritative parser, local date formatter, output formatter, and preview helper for the popup.
- Create `examples/plugins/time-converter/plugin-package.test.js`: package-level checks for manifest shape, permissions, referenced files, and popup integration.
- Create `examples/plugins/time-converter/manifest.json`: plugin metadata, popup size, disabled permissions.
- Create `examples/plugins/time-converter/popup.html`: compact time preview UI with six conversion rows and copy buttons.
- Create `examples/plugins/time-converter/README.md`: local usage and sample values.
- Modify `README.md`: mention the new time converter example plugin.

## Task 1: Matcher

**Files:**

- Create: `examples/plugins/time-converter/matcher.test.js`
- Create: `examples/plugins/time-converter/matcher.js`

- [ ] **Step 1: Create the plugin directory and write failing matcher tests**

Create the plugin directory:

```bash
mkdir -p examples/plugins/time-converter
```

Create `examples/plugins/time-converter/matcher.test.js`:

```js
import { describe, expect, it } from "vitest"
import { match } from "./matcher.js"

describe("time converter matcher", () => {
  it.each([
    "1714298400",
    "1714298400000",
    "2026-04-28",
    "2026-04-28 10:30:00",
    "2026-04-28T10:30:00",
    "2026-04-28T10:30:00Z",
    "2026-04-28T10:30:00+08:00",
    "2026/04/28 10:30:00",
    "Tue, 28 Apr 2026 10:30:00 GMT",
  ])("accepts %s", (selectedText) => {
    expect(match({ selectedText })).toBe(true)
  })

  it.each([
    "",
    " ",
    "hello",
    "123456",
    "2026",
    "2026-02-30",
    "2026-04-31",
    "2026-13-01",
    "2026-04-28 24:00:00",
    "2026-04-28 10:60:00",
    "17142984000",
    "171429840000",
    "17142984000000",
    "tomorrow",
  ])("rejects %s", (selectedText) => {
    expect(match({ selectedText })).toBe(false)
  })

  it("trims the selected text before matching", () => {
    expect(match({ selectedText: "  1714298400\n" })).toBe(true)
  })

  it("rejects non-string context values", () => {
    expect(match({ selectedText: null })).toBe(false)
    expect(match({ selectedText: 1714298400 })).toBe(false)
    expect(match({})).toBe(false)
  })
})
```

- [ ] **Step 2: Run the matcher tests to verify they fail**

Run:

```bash
bun run test -- examples/plugins/time-converter/matcher.test.js
```

Expected: FAIL because `examples/plugins/time-converter/matcher.js` does not exist yet.

- [ ] **Step 3: Implement the matcher**

Create `examples/plugins/time-converter/matcher.js`:

```js
export function match(context) {
  const selectedText =
    typeof context?.selectedText === "string" ? context.selectedText.trim() : ""

  return parseSupportedTime(selectedText) !== null
}

const LOCAL_NUMERIC_RE =
  /^(\d{4})([-/])(\d{1,2})\2(\d{1,2})(?:[ T](\d{1,2})(?::(\d{1,2})(?::(\d{1,2})(?:\.(\d{1,3}))?)?)?)?$/
const ISO_DATE_PARTS_RE =
  /^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2})(?::(\d{2})(?::(\d{2})(?:\.(\d{1,3}))?)?)?)?/

function parseSupportedTime(value) {
  if (!value) {
    return null
  }

  if (/^\d+$/.test(value)) {
    return parseTimestamp(value)
  }

  const localMatch = LOCAL_NUMERIC_RE.exec(value)
  if (localMatch) {
    return dateFromLocalMatch(localMatch)
  }

  if (!looksLikeFormattedTime(value)) {
    return null
  }

  if (!hasValidIsoDateParts(value)) {
    return null
  }

  const date = new Date(value)
  return isValidDate(date) ? date : null
}

function parseTimestamp(value) {
  if (value.length !== 10 && value.length !== 13) {
    return null
  }

  const numeric = Number(value)
  if (!Number.isSafeInteger(numeric)) {
    return null
  }

  const milliseconds = value.length === 10 ? numeric * 1000 : numeric
  const date = new Date(milliseconds)
  return isValidDate(date) ? date : null
}

function dateFromLocalMatch(matchResult) {
  const year = Number(matchResult[1])
  const month = Number(matchResult[3])
  const day = Number(matchResult[4])
  const hour = matchResult[5] === undefined ? 0 : Number(matchResult[5])
  const minute = matchResult[6] === undefined ? 0 : Number(matchResult[6])
  const second = matchResult[7] === undefined ? 0 : Number(matchResult[7])
  const millisecond =
    matchResult[8] === undefined ? 0 : Number(matchResult[8].padEnd(3, "0"))

  if (
    !isValidDateParts(year, month, day) ||
    hour < 0 ||
    hour > 23 ||
    minute < 0 ||
    minute > 59 ||
    second < 0 ||
    second > 59 ||
    millisecond < 0 ||
    millisecond > 999
  ) {
    return null
  }

  const date = new Date(
    year,
    month - 1,
    day,
    hour,
    minute,
    second,
    millisecond
  )

  return date.getFullYear() === year &&
    date.getMonth() === month - 1 &&
    date.getDate() === day &&
    date.getHours() === hour &&
    date.getMinutes() === minute &&
    date.getSeconds() === second &&
    date.getMilliseconds() === millisecond
    ? date
    : null
}

function looksLikeFormattedTime(value) {
  return (
    /[A-Za-z]/.test(value) ||
    /\d{4}[-/]\d{1,2}[-/]\d{1,2}/.test(value) ||
    /\d{1,2}\s+[A-Za-z]{3,}/.test(value)
  )
}

function hasValidIsoDateParts(value) {
  const matchResult = ISO_DATE_PARTS_RE.exec(value)
  if (!matchResult) {
    return true
  }

  const year = Number(matchResult[1])
  const month = Number(matchResult[2])
  const day = Number(matchResult[3])
  const hour = matchResult[4] === undefined ? 0 : Number(matchResult[4])
  const minute = matchResult[5] === undefined ? 0 : Number(matchResult[5])
  const second = matchResult[6] === undefined ? 0 : Number(matchResult[6])
  const millisecond =
    matchResult[7] === undefined ? 0 : Number(matchResult[7].padEnd(3, "0"))

  return (
    isValidDateParts(year, month, day) &&
    hour >= 0 &&
    hour <= 23 &&
    minute >= 0 &&
    minute <= 59 &&
    second >= 0 &&
    second <= 59 &&
    millisecond >= 0 &&
    millisecond <= 999
  )
}

function isValidDateParts(year, month, day) {
  if (month < 1 || month > 12 || day < 1) {
    return false
  }

  return day <= daysInMonth(year, month)
}

function daysInMonth(year, month) {
  return new Date(year, month, 0).getDate()
}

function isValidDate(date) {
  return date instanceof Date && Number.isFinite(date.getTime())
}
```

- [ ] **Step 4: Run the matcher tests to verify they pass**

Run:

```bash
bun run test -- examples/plugins/time-converter/matcher.test.js
```

Expected: PASS for all matcher tests.

- [ ] **Step 5: Commit matcher work**

```bash
git add examples/plugins/time-converter/matcher.js examples/plugins/time-converter/matcher.test.js
git commit -m "feat: add time converter matcher"
```

## Task 2: Time Core

**Files:**

- Create: `examples/plugins/time-converter/time-core.test.js`
- Create: `examples/plugins/time-converter/time-core.js`

- [ ] **Step 1: Write failing core tests**

Create `examples/plugins/time-converter/time-core.test.js`:

```js
import { describe, expect, it } from "vitest"
import "./time-core.js"

const {
  formatLocalDate,
  formatLocalDateTime,
  formatTimeOutputs,
  formatTimePreview,
  parseTime,
} = globalThis.ohMySelectTimeCore

describe("time core", () => {
  it("parses 10-digit Unix seconds", () => {
    const parsed = parseTime("1714298400")
    const outputs = formatTimeOutputs(parsed)

    expect(parsed.sourceKind).toBe("unix-seconds")
    expect(parsed.date.toISOString()).toBe("2024-04-28T10:00:00.000Z")
    expect(outputs.unixSeconds).toBe("1714298400")
    expect(outputs.milliseconds).toBe("1714298400000")
  })

  it("parses 13-digit millisecond timestamps", () => {
    const parsed = parseTime("1714298400000")

    expect(parsed.sourceKind).toBe("milliseconds")
    expect(parsed.date.toISOString()).toBe("2024-04-28T10:00:00.000Z")
  })

  it("parses date-only strings as local midnight", () => {
    const parsed = parseTime("2026-04-28")

    expect(parsed.sourceKind).toBe("local-string")
    expect(parsed.date.getFullYear()).toBe(2026)
    expect(parsed.date.getMonth()).toBe(3)
    expect(parsed.date.getDate()).toBe(28)
    expect(parsed.date.getHours()).toBe(0)
    expect(parsed.date.getMinutes()).toBe(0)
    expect(formatLocalDateTime(parsed.date)).toBe("2026-04-28 00:00:00")
    expect(formatLocalDate(parsed.date)).toBe("2026-04-28")
  })

  it("parses formatted strings without timezone as local time", () => {
    const parsed = parseTime("2026-04-28 10:30:00")

    expect(parsed.sourceKind).toBe("local-string")
    expect(parsed.date.getFullYear()).toBe(2026)
    expect(parsed.date.getMonth()).toBe(3)
    expect(parsed.date.getDate()).toBe(28)
    expect(parsed.date.getHours()).toBe(10)
    expect(parsed.date.getMinutes()).toBe(30)
    expect(parsed.date.getSeconds()).toBe(0)
  })

  it("parses timezone-aware ISO strings as absolute time", () => {
    const parsed = parseTime("2026-04-28T10:30:00Z")
    const outputs = formatTimeOutputs(parsed)

    expect(parsed.sourceKind).toBe("timezone-string")
    expect(outputs.isoUtc).toBe("2026-04-28T10:30:00.000Z")
    expect(outputs.rfc2822).toBe("Tue, 28 Apr 2026 10:30:00 GMT")
  })

  it("parses timezone offsets", () => {
    const parsed = parseTime("2026-04-28T10:30:00+08:00")

    expect(parsed.sourceKind).toBe("timezone-string")
    expect(parsed.date.toISOString()).toBe("2026-04-28T02:30:00.000Z")
  })

  it("formats all output rows", () => {
    const outputs = formatTimeOutputs(parseTime("2026-04-28T10:30:00Z"))

    expect(outputs).toEqual({
      unixSeconds: "1777372200",
      milliseconds: "1777372200000",
      isoUtc: "2026-04-28T10:30:00.000Z",
      localDateTime: formatLocalDateTime(new Date("2026-04-28T10:30:00Z")),
      localDate: formatLocalDate(new Date("2026-04-28T10:30:00Z")),
      rfc2822: "Tue, 28 Apr 2026 10:30:00 GMT",
    })
  })

  it("formats the local time preview", () => {
    const parsed = parseTime("2026-04-28 10:30:00")

    expect(formatTimePreview(parsed.date)).toBe("10:30")
  })

  it("returns null for unsupported values", () => {
    expect(parseTime("")).toBeNull()
    expect(parseTime("hello")).toBeNull()
    expect(parseTime("123456")).toBeNull()
    expect(parseTime("2026")).toBeNull()
    expect(parseTime("2026-02-30")).toBeNull()
    expect(parseTime("2026-04-31")).toBeNull()
    expect(parseTime("2026-13-01")).toBeNull()
    expect(parseTime("2026-04-28 24:00:00")).toBeNull()
    expect(parseTime("17142984000000")).toBeNull()
    expect(parseTime(null)).toBeNull()
  })

  it("returns null outputs for null input", () => {
    expect(formatTimeOutputs(null)).toBeNull()
  })
})
```

- [ ] **Step 2: Run the core tests to verify they fail**

Run:

```bash
bun run test -- examples/plugins/time-converter/time-core.test.js
```

Expected: FAIL because `examples/plugins/time-converter/time-core.js` does not exist yet.

- [ ] **Step 3: Implement the time core**

Create `examples/plugins/time-converter/time-core.js`:

```js
;(function () {
  const LOCAL_NUMERIC_RE =
    /^(\d{4})([-/])(\d{1,2})\2(\d{1,2})(?:[ T](\d{1,2})(?::(\d{1,2})(?::(\d{1,2})(?:\.(\d{1,3}))?)?)?)?$/
  const ISO_DATE_PARTS_RE =
    /^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2})(?::(\d{2})(?::(\d{2})(?:\.(\d{1,3}))?)?)?)?/

  globalThis.ohMySelectTimeCore = {
    formatLocalDate,
    formatLocalDateTime,
    formatTimeOutputs,
    formatTimePreview,
    parseTime,
  }

  function parseTime(value) {
    const sourceText = typeof value === "string" ? value.trim() : ""
    if (!sourceText) {
      return null
    }

    if (/^\d+$/.test(sourceText)) {
      return parseTimestamp(sourceText)
    }

    const localMatch = LOCAL_NUMERIC_RE.exec(sourceText)
    if (localMatch) {
      const date = dateFromLocalMatch(localMatch)
      return date
        ? {
            date,
            sourceKind: "local-string",
            sourceText,
          }
        : null
    }

    if (!looksLikeFormattedTime(sourceText)) {
      return null
    }

    if (!hasValidIsoDateParts(sourceText)) {
      return null
    }

    const date = new Date(sourceText)
    if (!isValidDate(date)) {
      return null
    }

    return {
      date,
      sourceKind: hasExplicitTimezone(sourceText)
        ? "timezone-string"
        : "local-string",
      sourceText,
    }
  }

  function parseTimestamp(sourceText) {
    if (sourceText.length !== 10 && sourceText.length !== 13) {
      return null
    }

    const numeric = Number(sourceText)
    if (!Number.isSafeInteger(numeric)) {
      return null
    }

    const milliseconds = sourceText.length === 10 ? numeric * 1000 : numeric
    const date = new Date(milliseconds)
    if (!isValidDate(date)) {
      return null
    }

    return {
      date,
      sourceKind: sourceText.length === 10 ? "unix-seconds" : "milliseconds",
      sourceText,
    }
  }

  function formatTimeOutputs(time) {
    if (!time || !isValidDate(time.date)) {
      return null
    }

    const milliseconds = time.date.getTime()

    return {
      unixSeconds: String(Math.floor(milliseconds / 1000)),
      milliseconds: String(milliseconds),
      isoUtc: time.date.toISOString(),
      localDateTime: formatLocalDateTime(time.date),
      localDate: formatLocalDate(time.date),
      rfc2822: time.date.toUTCString(),
    }
  }

  function formatLocalDateTime(date) {
    return `${formatLocalDate(date)} ${pad(date.getHours())}:${pad(
      date.getMinutes()
    )}:${pad(date.getSeconds())}`
  }

  function formatLocalDate(date) {
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(
      date.getDate()
    )}`
  }

  function formatTimePreview(date) {
    if (!isValidDate(date)) {
      return "--:--"
    }

    return `${pad(date.getHours())}:${pad(date.getMinutes())}`
  }

  function dateFromLocalMatch(matchResult) {
    const year = Number(matchResult[1])
    const month = Number(matchResult[3])
    const day = Number(matchResult[4])
    const hour = matchResult[5] === undefined ? 0 : Number(matchResult[5])
    const minute = matchResult[6] === undefined ? 0 : Number(matchResult[6])
    const second = matchResult[7] === undefined ? 0 : Number(matchResult[7])
    const millisecond =
      matchResult[8] === undefined ? 0 : Number(matchResult[8].padEnd(3, "0"))

    if (
      !isValidDateParts(year, month, day) ||
      hour < 0 ||
      hour > 23 ||
      minute < 0 ||
      minute > 59 ||
      second < 0 ||
      second > 59 ||
      millisecond < 0 ||
      millisecond > 999
    ) {
      return null
    }

    const date = new Date(
      year,
      month - 1,
      day,
      hour,
      minute,
      second,
      millisecond
    )

    return date.getFullYear() === year &&
      date.getMonth() === month - 1 &&
      date.getDate() === day &&
      date.getHours() === hour &&
      date.getMinutes() === minute &&
      date.getSeconds() === second &&
      date.getMilliseconds() === millisecond
      ? date
      : null
  }

  function looksLikeFormattedTime(value) {
    return (
      /[A-Za-z]/.test(value) ||
      /\d{4}[-/]\d{1,2}[-/]\d{1,2}/.test(value) ||
      /\d{1,2}\s+[A-Za-z]{3,}/.test(value)
    )
  }

  function hasValidIsoDateParts(value) {
    const matchResult = ISO_DATE_PARTS_RE.exec(value)
    if (!matchResult) {
      return true
    }

    const year = Number(matchResult[1])
    const month = Number(matchResult[2])
    const day = Number(matchResult[3])
    const hour = matchResult[4] === undefined ? 0 : Number(matchResult[4])
    const minute = matchResult[5] === undefined ? 0 : Number(matchResult[5])
    const second = matchResult[6] === undefined ? 0 : Number(matchResult[6])
    const millisecond =
      matchResult[7] === undefined ? 0 : Number(matchResult[7].padEnd(3, "0"))

    return (
      isValidDateParts(year, month, day) &&
      hour >= 0 &&
      hour <= 23 &&
      minute >= 0 &&
      minute <= 59 &&
      second >= 0 &&
      second <= 59 &&
      millisecond >= 0 &&
      millisecond <= 999
    )
  }

  function hasExplicitTimezone(value) {
    return /(?:z|[+-]\d{2}:?\d{2}|gmt|utc|[A-Z]{2,5})\s*$/i.test(value)
  }

  function isValidDateParts(year, month, day) {
    if (month < 1 || month > 12 || day < 1) {
      return false
    }

    return day <= daysInMonth(year, month)
  }

  function daysInMonth(year, month) {
    return new Date(year, month, 0).getDate()
  }

  function isValidDate(date) {
    return date instanceof Date && Number.isFinite(date.getTime())
  }

  function pad(value) {
    return String(value).padStart(2, "0")
  }
})()
```

- [ ] **Step 4: Run the core tests to verify they pass**

Run:

```bash
bun run test -- examples/plugins/time-converter/time-core.test.js
```

Expected: PASS for all core tests.

- [ ] **Step 5: Commit core work**

```bash
git add examples/plugins/time-converter/time-core.js examples/plugins/time-converter/time-core.test.js
git commit -m "feat: add time converter core"
```

## Task 3: Plugin Package And Popup

**Files:**

- Create: `examples/plugins/time-converter/plugin-package.test.js`
- Create: `examples/plugins/time-converter/manifest.json`
- Create: `examples/plugins/time-converter/popup.html`

- [ ] **Step 1: Write failing package tests**

Create `examples/plugins/time-converter/plugin-package.test.js`:

```js
import { existsSync } from "node:fs"
import { readFile } from "node:fs/promises"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import { describe, expect, it } from "vitest"

const pluginDir = dirname(fileURLToPath(import.meta.url))

describe("time converter plugin package", () => {
  it("has a valid manifest with no privileged permissions", async () => {
    const manifest = JSON.parse(
      await readFile(join(pluginDir, "manifest.json"), "utf8")
    )

    expect(manifest).toMatchObject({
      id: "time-converter",
      name: {
        "zh-CN": "时间转换器",
        en: "Time Converter",
      },
      version: "0.1.0",
      matcher: "matcher.js",
      popup: {
        entry: "popup.html",
        width: 420,
        height: 340,
      },
      permissions: {
        openExternal: false,
        storage: false,
      },
    })
    expect(manifest.settings).toBeUndefined()
  })

  it("references files that exist in the plugin folder", async () => {
    const manifest = JSON.parse(
      await readFile(join(pluginDir, "manifest.json"), "utf8")
    )

    expect(existsSync(join(pluginDir, manifest.matcher))).toBe(true)
    expect(existsSync(join(pluginDir, manifest.popup.entry))).toBe(true)
    expect(existsSync(join(pluginDir, "time-core.js"))).toBe(true)
  })

  it("loads the conversion core from the popup", async () => {
    const popup = await readFile(join(pluginDir, "popup.html"), "utf8")

    expect(popup).toContain('<script src="./time-core.js"></script>')
    expect(popup).not.toContain('type="module"')
    expect(popup).not.toContain('from "./time-core.js"')
    expect(popup).toContain('aria-live="polite"')
    expect(popup).toContain("data-row-status")
    expect(popup).toContain("navigator.clipboard")
    expect(popup).toContain("document.execCommand")
  })
})
```

- [ ] **Step 2: Run the package tests to verify they fail**

Run:

```bash
bun run test -- examples/plugins/time-converter/plugin-package.test.js
```

Expected: FAIL because `examples/plugins/time-converter/manifest.json` and `popup.html` do not exist yet.

- [ ] **Step 3: Create the manifest**

Create `examples/plugins/time-converter/manifest.json`:

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

- [ ] **Step 4: Create the popup UI**

Create `examples/plugins/time-converter/popup.html`:

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <style>
      * {
        box-sizing: border-box;
      }

      body {
        margin: 0;
        background: #f8fafc;
        color: #020617;
        font-family:
          -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      }

      main {
        display: grid;
        min-height: 100vh;
        gap: 10px;
        padding: 12px;
      }

      .preview {
        display: grid;
        grid-template-columns: 72px minmax(0, 1fr);
        gap: 12px;
        align-items: stretch;
      }

      .time-badge {
        display: grid;
        width: 72px;
        height: 72px;
        align-content: center;
        justify-items: center;
        border: 1px solid #94a3b8;
        background: #ffffff;
        color: #0369a1;
      }

      .time-badge-value {
        font-family:
          "SFMono-Regular", Consolas, "Liberation Mono", Menlo, monospace;
        font-size: 18px;
        font-weight: 800;
        line-height: 1;
      }

      .time-badge-label {
        margin-top: 5px;
        color: #475569;
        font-size: 10px;
        font-weight: 800;
        letter-spacing: 0;
        text-transform: uppercase;
      }

      .summary {
        display: grid;
        min-width: 0;
        align-content: center;
        gap: 5px;
      }

      .eyebrow,
      .source-label,
      .source-meta {
        margin: 0;
        color: #475569;
        font-size: 11px;
        line-height: 1.25;
      }

      .eyebrow {
        font-weight: 800;
        text-transform: uppercase;
      }

      .source-label {
        font-weight: 700;
      }

      .source {
        margin: 0;
        overflow: hidden;
        color: #020617;
        font-size: 16px;
        font-weight: 750;
        line-height: 1.25;
        text-overflow: ellipsis;
        white-space: nowrap;
      }

      .rows {
        display: grid;
        gap: 6px;
      }

      .row {
        display: grid;
        min-height: 38px;
        grid-template-columns: 92px minmax(0, 1fr) 30px 64px;
        gap: 7px;
        align-items: center;
        border: 1px solid #d7dee8;
        background: #ffffff;
        padding: 5px 6px;
      }

      .format {
        color: #0f172a;
        font-size: 11px;
        font-weight: 800;
      }

      .value {
        overflow: hidden;
        color: #334155;
        font-family:
          "SFMono-Regular", Consolas, "Liberation Mono", Menlo, monospace;
        font-size: 12px;
        line-height: 1.3;
        text-overflow: ellipsis;
        white-space: nowrap;
      }

      .row-status {
        min-width: 0;
        overflow: hidden;
        color: #0f766e;
        font-size: 11px;
        line-height: 1.2;
        text-overflow: ellipsis;
        white-space: nowrap;
      }

      button {
        display: inline-flex;
        width: 30px;
        height: 30px;
        align-items: center;
        justify-content: center;
        border: 1px solid #cbd5e1;
        background: #ffffff;
        color: #0f172a;
        cursor: pointer;
      }

      button:hover {
        border-color: #0369a1;
        color: #0369a1;
      }

      button:focus-visible {
        outline: 2px solid #0369a1;
        outline-offset: 1px;
      }

      .status {
        min-height: 16px;
        margin: 0;
        color: #475569;
        font-size: 12px;
        line-height: 1.3;
      }

      .error {
        min-height: 100vh;
        align-content: center;
        gap: 12px;
        padding: 16px;
      }

      .error-title {
        margin: 0;
        color: #020617;
        font-size: 16px;
        font-weight: 750;
      }

      .error button {
        width: fit-content;
        min-width: 82px;
        padding: 0 12px;
      }
    </style>
  </head>
  <body>
    <main id="app"></main>
    <script src="./time-core.js"></script>
    <script>
      const {
        formatTimeOutputs,
        formatTimePreview,
        parseTime,
      } = window.ohMySelectTimeCore;
      const host = window.ohMySelect || {
        context: {
          selectedText: "2026-04-28 10:30:00",
          locale: "en",
        },
        closePopup() {
          return Promise.resolve();
        },
      };

      const labels = {
        en: {
          title: "Detected time",
          source: "Source",
          kind: "Input",
          values: "Converted values",
          unsupported: "Unsupported time value",
          close: "Close",
          copied: "Copied",
          copyFailed: "Copy failed",
          badgeLabel: "Local",
          rows: {
            unixSeconds: "Unix sec",
            milliseconds: "Millis",
            isoUtc: "ISO UTC",
            localDateTime: "Local time",
            localDate: "Local date",
            rfc2822: "RFC 2822",
          },
          sourceKinds: {
            "unix-seconds": "Unix seconds timestamp",
            milliseconds: "Millisecond timestamp",
            "local-string": "Parsed as local time",
            "timezone-string": "Parsed with timezone",
          },
          copyValue(format) {
            return `Copy ${format} value`;
          },
        },
        "zh-CN": {
          title: "识别到时间",
          source: "原始值",
          kind: "输入类型",
          values: "转换结果",
          unsupported: "不支持的时间值",
          close: "关闭",
          copied: "已复制",
          copyFailed: "复制失败",
          badgeLabel: "本地",
          rows: {
            unixSeconds: "Unix 秒",
            milliseconds: "毫秒时间戳",
            isoUtc: "ISO UTC",
            localDateTime: "本地完整",
            localDate: "本地日期",
            rfc2822: "RFC 2822",
          },
          sourceKinds: {
            "unix-seconds": "Unix 秒级时间戳",
            milliseconds: "毫秒级时间戳",
            "local-string": "按本地时间解析",
            "timezone-string": "按指定时区解析",
          },
          copyValue(format) {
            return `复制 ${format} 值`;
          },
        },
      };

      const locale =
        host.context && host.context.locale === "zh-CN" ? "zh-CN" : "en";
      const t = labels[locale];
      const selectedText =
        typeof host.context?.selectedText === "string"
          ? host.context.selectedText.trim()
          : "";
      const time = parseTime(selectedText);
      const app = document.getElementById("app");

      document.documentElement.lang = locale;

      if (!time) {
        renderError();
      } else {
        renderTime();
      }

      function renderError() {
        app.className = "error";
        app.innerHTML = `
          <p class="error-title">${escapeHtml(t.unsupported)}</p>
          <button type="button" id="close">${escapeHtml(t.close)}</button>
        `;
        document.getElementById("close").addEventListener("click", () => {
          host.closePopup();
        });
      }

      function renderTime() {
        const outputs = formatTimeOutputs(time);
        const rows = [
          ["unixSeconds", outputs.unixSeconds],
          ["milliseconds", outputs.milliseconds],
          ["isoUtc", outputs.isoUtc],
          ["localDateTime", outputs.localDateTime],
          ["localDate", outputs.localDate],
          ["rfc2822", outputs.rfc2822],
        ];
        const sourceKind =
          t.sourceKinds[time.sourceKind] || t.sourceKinds["local-string"];

        app.innerHTML = `
          <section class="preview" aria-label="${escapeAttribute(t.title)}">
            <div class="time-badge" aria-hidden="true">
              <span class="time-badge-value">${escapeHtml(
                formatTimePreview(time.date)
              )}</span>
              <span class="time-badge-label">${escapeHtml(t.badgeLabel)}</span>
            </div>
            <div class="summary">
              <p class="eyebrow">${escapeHtml(t.title)}</p>
              <p class="source-label">${escapeHtml(t.source)}</p>
              <p class="source" title="${escapeAttribute(selectedText)}">${escapeHtml(
                selectedText
              )}</p>
              <p class="source-meta">${escapeHtml(t.kind)}: ${escapeHtml(
                sourceKind
              )}</p>
            </div>
          </section>
          <section class="rows" aria-label="${escapeAttribute(t.values)}">
            ${rows
              .map(
                ([key, value], index) => `
                  <div class="row">
                    <span class="format">${escapeHtml(t.rows[key])}</span>
                    <span class="value" title="${escapeAttribute(value)}">${escapeHtml(
                      value
                    )}</span>
                    <button type="button" data-copy-index="${index}" aria-label="${escapeAttribute(
                      t.copyValue(t.rows[key])
                    )}">
                      <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
                        <rect x="9" y="9" width="10" height="10" rx="1.5" fill="none" stroke="currentColor" stroke-width="2"></rect>
                        <path d="M6 15H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v1" fill="none" stroke="currentColor" stroke-linecap="round" stroke-width="2"></path>
                      </svg>
                    </button>
                    <span class="row-status" data-row-status="${index}"></span>
                  </div>
                `
              )
              .join("")}
          </section>
          <p class="status" id="status" aria-live="polite"></p>
        `;

        document.querySelectorAll("[data-copy-index]").forEach((button) => {
          button.addEventListener("click", () => {
            const index = Number(button.getAttribute("data-copy-index"));
            copyValue(rows[index][1], index);
          });
        });
      }

      async function copyValue(value, rowIndex) {
        const copied = await writeClipboard(value);
        showStatus(copied ? t.copied : t.copyFailed, rowIndex);
      }

      function showStatus(message, rowIndex) {
        const status = document.getElementById("status");
        const rowStatus = document.querySelector(
          `[data-row-status="${rowIndex}"]`
        );

        document.querySelectorAll("[data-row-status]").forEach((element) => {
          element.textContent = "";
        });
        status.textContent = message;
        if (rowStatus) {
          rowStatus.textContent = message;
        }

        window.clearTimeout(showStatus.timeout);
        showStatus.timeout = window.setTimeout(() => {
          status.textContent = "";
          if (rowStatus) {
            rowStatus.textContent = "";
          }
        }, 1200);
      }

      async function writeClipboard(value) {
        try {
          if (navigator.clipboard?.writeText) {
            await navigator.clipboard.writeText(value);
            return true;
          }
        } catch {
          return writeClipboardFallback(value);
        }

        return writeClipboardFallback(value);
      }

      function writeClipboardFallback(value) {
        const textarea = document.createElement("textarea");
        textarea.value = value;
        textarea.setAttribute("readonly", "");
        textarea.style.position = "fixed";
        textarea.style.left = "-9999px";
        document.body.appendChild(textarea);
        textarea.select();

        try {
          return document.execCommand("copy");
        } catch {
          return false;
        } finally {
          textarea.remove();
        }
      }

      function escapeHtml(value) {
        return String(value)
          .replaceAll("&", "&amp;")
          .replaceAll("<", "&lt;")
          .replaceAll(">", "&gt;")
          .replaceAll('"', "&quot;")
          .replaceAll("'", "&#39;");
      }

      function escapeAttribute(value) {
        return escapeHtml(value);
      }
    </script>
  </body>
</html>
```

- [ ] **Step 5: Run the package tests to verify they pass**

Run:

```bash
bun run test -- examples/plugins/time-converter/plugin-package.test.js
```

Expected: PASS for all package tests.

- [ ] **Step 6: Run all time converter tests**

Run:

```bash
bun run test -- examples/plugins/time-converter
```

Expected: PASS for matcher, core, and package tests.

- [ ] **Step 7: Commit package and popup work**

```bash
git add examples/plugins/time-converter/manifest.json examples/plugins/time-converter/plugin-package.test.js examples/plugins/time-converter/popup.html
git commit -m "feat: add time converter popup"
```

## Task 4: Documentation

**Files:**

- Create: `examples/plugins/time-converter/README.md`
- Modify: `README.md`

- [ ] **Step 1: Create the plugin README**

Create `examples/plugins/time-converter/README.md`:

```md
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
```

- [ ] **Step 2: Update the root README example plugin list**

Modify the "Included examples" list in `README.md` so it reads:

```md
Included examples:

- `quick-search`: accepts non-empty selected text, displays it, and opens a configurable search URL.
- `color-converter`: accepts supported CSS color values, previews the color, and copies HEX, RGB, HSL, or OKLCH output.
- `time-converter`: accepts supported time values and copies Unix seconds, milliseconds, ISO UTC, local, or RFC 2822 output.
```

- [ ] **Step 3: Verify documentation references**

Run:

```bash
rg -n "time-converter|Time Converter|时间转换器" README.md examples/plugins/time-converter
```

Expected: output includes matches in `README.md`, `examples/plugins/time-converter/README.md`, and `examples/plugins/time-converter/manifest.json`.

- [ ] **Step 4: Commit documentation work**

```bash
git add README.md examples/plugins/time-converter/README.md
git commit -m "docs: document time converter plugin"
```

## Task 5: Final Verification

**Files:**

- Verify: `examples/plugins/time-converter/*`
- Verify: `README.md`

- [ ] **Step 1: Run focused plugin tests**

Run:

```bash
bun run test -- examples/plugins/time-converter
```

Expected: PASS for all time converter tests.

- [ ] **Step 2: Run the full test suite**

Run:

```bash
bun run test
```

Expected: PASS for all Vitest suites.

- [ ] **Step 3: Run TypeScript checks**

Run:

```bash
bun run typecheck
```

Expected: PASS with no TypeScript errors.

- [ ] **Step 4: Run lint**

Run:

```bash
bun run lint
```

Expected: PASS with no ESLint errors.

- [ ] **Step 5: Review the final diff**

Run:

```bash
git diff --stat HEAD~4..HEAD
git diff HEAD~4..HEAD -- README.md examples/plugins/time-converter
```

Expected: diff only includes the time converter plugin files and the root README example list.

- [ ] **Step 6: Manual smoke check**

Run the app:

```bash
bun run tauri dev
```

Then:

1. Open Settings from the tray.
2. Import `/Users/hanjiedeng/Desktop/oh-my-select/examples/plugins/time-converter`.
3. Select `1714298400` in another application and confirm the popup appears.
4. Select `2026-04-28 10:30:00` and confirm the popup shows local parse context.
5. Select `2026-02-30` and confirm no time converter popup appears.
6. Copy at least one row and confirm the row-level copied state appears.

Expected: accepted samples show the popup, rejected samples do not, and copy controls report success.

- [ ] **Step 7: Commit any verification fixes**

If verification revealed a necessary fix, commit only the fix files:

```bash
git add README.md examples/plugins/time-converter
git commit -m "fix: polish time converter plugin"
```

If no fixes were needed, do not create an empty commit.
