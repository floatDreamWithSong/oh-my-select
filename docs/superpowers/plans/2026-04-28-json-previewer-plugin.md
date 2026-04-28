# JSON Previewer Plugin Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a new self-contained example plugin that previews selected JSON objects, supports serialized JSON object strings, and provides configurable indentation plus two copy formats.

**Architecture:** Add `examples/plugins/json-previewer` following the existing example plugin pattern. Keep parsing, formatting, serialization, and indentation validation in `json-core.js`; use a small duplicated matcher parser because matcher files are evaluated directly by the Rust QuickJS host without module loading. The popup and settings page are plain HTML files loaded through the existing plugin protocol and bridge.

**Tech Stack:** Plain JavaScript, HTML/CSS, Vitest, JSDOM, existing oh-my-select plugin bridge and storage API.

---

## File Structure

- Create: `examples/plugins/json-previewer/json-core.js`
  - Owns JSON object parsing, output formatting, serialized-copy generation, and indentation normalization.
- Create: `examples/plugins/json-previewer/json-core.test.js`
  - Unit tests for parser, formatter, serializer, and indentation normalization.
- Create: `examples/plugins/json-previewer/matcher.js`
  - Exports synchronous `match(context)` for the host plugin engine.
- Create: `examples/plugins/json-previewer/matcher.test.js`
  - Verifies accepted and rejected selected-text samples.
- Create: `examples/plugins/json-previewer/popup.html`
  - Renders formatted JSON preview and copy actions.
- Create: `examples/plugins/json-previewer/popup.test.js`
  - Loads popup in JSDOM and verifies rendering for direct and serialized inputs.
- Create: `examples/plugins/json-previewer/settings.html`
  - Renders indentation setting and persists `indentSize` through plugin storage.
- Create: `examples/plugins/json-previewer/settings.test.js`
  - Loads settings in JSDOM and verifies default, save, reject, and localization behavior.
- Create: `examples/plugins/json-previewer/manifest.json`
  - Defines plugin metadata, popup, settings, and permissions.
- Create: `examples/plugins/json-previewer/plugin-package.test.js`
  - Verifies manifest shape, referenced files, and non-module script loading.
- Create: `examples/plugins/json-previewer/README.md`
  - Documents supported inputs, rejected inputs, copy behavior, settings, and manual checks.
- Modify: `README.md`
  - Add JSON Previewer to the example plugin list.

---

### Task 1: JSON Core

**Files:**
- Create: `examples/plugins/json-previewer/json-core.test.js`
- Create: `examples/plugins/json-previewer/json-core.js`

- [ ] **Step 1: Create the plugin folder**

Run:

```bash
mkdir -p examples/plugins/json-previewer
```

Expected: command exits with status 0.

- [ ] **Step 2: Write the failing JSON core tests**

Create `examples/plugins/json-previewer/json-core.test.js` with:

```js
import { describe, expect, it } from "vitest"
import "./json-core.js"

const {
  DEFAULT_INDENT,
  formatObject,
  indentOrDefault,
  normalizeIndent,
  parseJsonObjectSelection,
  serializeObject,
} = globalThis.ohMySelectJsonCore

describe("json previewer core", () => {
  it("parses direct JSON objects", () => {
    const parsed = parseJsonObjectSelection(' { "a": 1, "nested": { "b": true } } ')

    expect(parsed).toEqual({
      object: {
        a: 1,
        nested: {
          b: true,
        },
      },
      sourceText: '{ "a": 1, "nested": { "b": true } }',
      sourceKind: "object",
    })
  })

  it("parses serialized JSON strings that decode to objects", () => {
    const selectedText = JSON.stringify(JSON.stringify({ a: 1, b: "two" }))
    const parsed = parseJsonObjectSelection(selectedText)

    expect(parsed).toEqual({
      object: {
        a: 1,
        b: "two",
      },
      sourceText: selectedText,
      sourceKind: "serialized-string",
    })
  })

  it("rejects unsupported JSON values", () => {
    expect(parseJsonObjectSelection('[{"a":1}]')).toBeNull()
    expect(parseJsonObjectSelection('"hello"')).toBeNull()
    expect(parseJsonObjectSelection("123")).toBeNull()
    expect(parseJsonObjectSelection("null")).toBeNull()
    expect(parseJsonObjectSelection("true")).toBeNull()
    expect(parseJsonObjectSelection('{"a":1} trailing')).toBeNull()
    expect(parseJsonObjectSelection("")).toBeNull()
    expect(parseJsonObjectSelection(null)).toBeNull()
  })

  it("rejects serialized strings that do not decode to objects", () => {
    expect(parseJsonObjectSelection(JSON.stringify("hello"))).toBeNull()
    expect(parseJsonObjectSelection(JSON.stringify("[1,2,3]"))).toBeNull()
    expect(parseJsonObjectSelection(JSON.stringify("123"))).toBeNull()
  })

  it("formats objects with configured indentation", () => {
    expect(formatObject({ a: 1 }, 2)).toBe('{\n  "a": 1\n}')
    expect(formatObject({ a: 1 }, 0)).toBe('{"a":1}')
  })

  it("serializes objects as JSON string literals containing compact object JSON", () => {
    expect(serializeObject({ a: 1, b: "two" })).toBe(
      '"{\\"a\\":1,\\"b\\":\\"two\\"}"'
    )
  })

  it("normalizes valid indentation values", () => {
    expect(DEFAULT_INDENT).toBe(2)
    expect(normalizeIndent(0)).toBe(0)
    expect(normalizeIndent(2)).toBe(2)
    expect(normalizeIndent(8)).toBe(8)
    expect(normalizeIndent("4")).toBe(4)
    expect(normalizeIndent(" 6 ")).toBe(6)
  })

  it("rejects invalid indentation values", () => {
    expect(normalizeIndent("")).toBeNull()
    expect(normalizeIndent("  ")).toBeNull()
    expect(normalizeIndent(-1)).toBeNull()
    expect(normalizeIndent(9)).toBeNull()
    expect(normalizeIndent(2.5)).toBeNull()
    expect(normalizeIndent("2.5")).toBeNull()
    expect(normalizeIndent("abc")).toBeNull()
    expect(normalizeIndent(null)).toBeNull()
  })

  it("falls back to the default indentation", () => {
    expect(indentOrDefault("bad")).toBe(2)
    expect(indentOrDefault(4)).toBe(4)
  })
})
```

- [ ] **Step 3: Run the JSON core tests and verify they fail**

Run:

```bash
bunx vitest run examples/plugins/json-previewer/json-core.test.js
```

Expected: FAIL because `./json-core.js` does not exist.

- [ ] **Step 4: Write the JSON core implementation**

Create `examples/plugins/json-previewer/json-core.js` with:

```js
;(function () {
  const DEFAULT_INDENT = 2
  const MIN_INDENT = 0
  const MAX_INDENT = 8

  globalThis.ohMySelectJsonCore = {
    DEFAULT_INDENT,
    MIN_INDENT,
    MAX_INDENT,
    formatObject,
    indentOrDefault,
    normalizeIndent,
    parseJsonObjectSelection,
    serializeObject,
  }

  function parseJsonObjectSelection(value) {
    if (typeof value !== "string") {
      return null
    }

    const sourceText = value.trim()
    if (!sourceText) {
      return null
    }

    const parsed = tryParseJson(sourceText)
    if (!parsed.ok) {
      return null
    }

    if (isJsonObject(parsed.value)) {
      return {
        object: parsed.value,
        sourceText,
        sourceKind: "object",
      }
    }

    if (typeof parsed.value !== "string") {
      return null
    }

    const decodedText = parsed.value.trim()
    if (!decodedText) {
      return null
    }

    const decoded = tryParseJson(decodedText)
    if (!decoded.ok || !isJsonObject(decoded.value)) {
      return null
    }

    return {
      object: decoded.value,
      sourceText,
      sourceKind: "serialized-string",
    }
  }

  function formatObject(object, indentSize) {
    return JSON.stringify(object, null, indentOrDefault(indentSize))
  }

  function serializeObject(object) {
    return JSON.stringify(JSON.stringify(object))
  }

  function normalizeIndent(value) {
    const numeric =
      typeof value === "string" && value.trim() !== ""
        ? Number(value.trim())
        : value

    if (
      typeof numeric !== "number" ||
      !Number.isInteger(numeric) ||
      numeric < MIN_INDENT ||
      numeric > MAX_INDENT
    ) {
      return null
    }

    return numeric
  }

  function indentOrDefault(value) {
    return normalizeIndent(value) ?? DEFAULT_INDENT
  }

  function tryParseJson(value) {
    try {
      return {
        ok: true,
        value: JSON.parse(value),
      }
    } catch {
      return {
        ok: false,
        value: null,
      }
    }
  }

  function isJsonObject(value) {
    return typeof value === "object" && value !== null && !Array.isArray(value)
  }
})()
```

- [ ] **Step 5: Run the JSON core tests and verify they pass**

Run:

```bash
bunx vitest run examples/plugins/json-previewer/json-core.test.js
```

Expected: PASS for all tests in `json-core.test.js`.

- [ ] **Step 6: Commit Task 1**

Run:

```bash
git add examples/plugins/json-previewer/json-core.js examples/plugins/json-previewer/json-core.test.js
git commit -m "feat: add json previewer core"
```

Expected: commit succeeds.

---

### Task 2: Matcher

**Files:**
- Create: `examples/plugins/json-previewer/matcher.test.js`
- Create: `examples/plugins/json-previewer/matcher.js`

- [ ] **Step 1: Write the failing matcher tests**

Create `examples/plugins/json-previewer/matcher.test.js` with:

```js
import { describe, expect, it } from "vitest"
import { match } from "./matcher.js"

describe("json previewer matcher", () => {
  it.each([
    '{"name":"oh-my-select","enabled":true}',
    '  { "nested": { "count": 2 } }  ',
    JSON.stringify(JSON.stringify({ name: "oh-my-select", enabled: true })),
  ])("accepts %s", (selectedText) => {
    expect(match({ selectedText })).toBe(true)
  })

  it.each([
    "",
    "hello",
    '[{"a":1}]',
    '"hello"',
    "123",
    "null",
    "true",
    '{"a":1} trailing',
    JSON.stringify("[1,2,3]"),
    JSON.stringify("hello"),
  ])("rejects %s", (selectedText) => {
    expect(match({ selectedText })).toBe(false)
  })

  it("rejects non-string context values", () => {
    expect(match({ selectedText: null })).toBe(false)
    expect(match({ selectedText: 123 })).toBe(false)
    expect(match({})).toBe(false)
  })
})
```

- [ ] **Step 2: Run the matcher tests and verify they fail**

Run:

```bash
bunx vitest run examples/plugins/json-previewer/matcher.test.js
```

Expected: FAIL because `./matcher.js` does not exist.

- [ ] **Step 3: Write the matcher implementation**

Create `examples/plugins/json-previewer/matcher.js` with:

```js
export function match(context) {
  return parseJsonObjectSelection(context?.selectedText) !== null
}

function parseJsonObjectSelection(value) {
  if (typeof value !== "string") {
    return null
  }

  const sourceText = value.trim()
  if (!sourceText) {
    return null
  }

  const parsed = tryParseJson(sourceText)
  if (!parsed.ok) {
    return null
  }

  if (isJsonObject(parsed.value)) {
    return {
      object: parsed.value,
      sourceText,
      sourceKind: "object",
    }
  }

  if (typeof parsed.value !== "string") {
    return null
  }

  const decodedText = parsed.value.trim()
  if (!decodedText) {
    return null
  }

  const decoded = tryParseJson(decodedText)
  if (!decoded.ok || !isJsonObject(decoded.value)) {
    return null
  }

  return {
    object: decoded.value,
    sourceText,
    sourceKind: "serialized-string",
  }
}

function tryParseJson(value) {
  try {
    return {
      ok: true,
      value: JSON.parse(value),
    }
  } catch {
    return {
      ok: false,
      value: null,
    }
  }
}

function isJsonObject(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}
```

- [ ] **Step 4: Run the matcher tests and verify they pass**

Run:

```bash
bunx vitest run examples/plugins/json-previewer/matcher.test.js
```

Expected: PASS for all tests in `matcher.test.js`.

- [ ] **Step 5: Verify the matcher runs through the Rust QuickJS engine**

Modify `src-tauri/src/plugin_engine.rs` by adding this test next to the existing repository matcher tests:

```rust
#[test]
fn repository_json_previewer_matcher_runs_in_quickjs() {
    let root = example_plugins_root();
    let engine = PluginEngine::new(root);
    let plugin = example_plugin("json-previewer", 460, 420);

    assert!(engine
        .match_plugin(&plugin, r#"{"name":"oh-my-select"}"#, "en")
        .unwrap());
    assert!(engine
        .match_plugin(
            &plugin,
            r#""{\"name\":\"oh-my-select\"}""#,
            "en"
        )
        .unwrap());
    assert!(!engine.match_plugin(&plugin, "[1,2,3]", "en").unwrap());
    assert!(!engine.match_plugin(&plugin, "hello", "en").unwrap());
}
```

- [ ] **Step 6: Run the Rust matcher test and verify it passes**

Run:

```bash
cargo test repository_json_previewer_matcher_runs_in_quickjs --manifest-path src-tauri/Cargo.toml
```

Expected: PASS for `repository_json_previewer_matcher_runs_in_quickjs`.

- [ ] **Step 7: Commit Task 2**

Run:

```bash
git add examples/plugins/json-previewer/matcher.js examples/plugins/json-previewer/matcher.test.js src-tauri/src/plugin_engine.rs
git commit -m "feat: add json previewer matcher"
```

Expected: commit succeeds.

---

### Task 3: Popup

**Files:**
- Create: `examples/plugins/json-previewer/popup.test.js`
- Create: `examples/plugins/json-previewer/popup.html`

- [ ] **Step 1: Write the failing popup tests**

Create `examples/plugins/json-previewer/popup.test.js` with:

```js
import { readFile } from "node:fs/promises"
import { dirname, join } from "node:path"
import { fileURLToPath, pathToFileURL } from "node:url"
import { JSDOM, VirtualConsole } from "jsdom"
import { describe, expect, it } from "vitest"

const pluginDir = dirname(fileURLToPath(import.meta.url))

describe("json previewer popup", () => {
  it("renders direct object JSON with stored indentation", async () => {
    const dom = await loadPopup({
      selectedText: '{"name":"oh-my-select","enabled":true}',
      locale: "en",
      storageValue: 4,
    })

    const text = dom.window.document.body.textContent
    expect(text).toContain("JSON Previewer")
    expect(text).toContain("JSON object")
    expect(text).toContain('"name": "oh-my-select"')
    expect(text).toContain("Copy deserialized JSON")
    expect(text).toContain("Copy serialized JSON")
    expect(dom.window.document.querySelector("code").textContent).toContain(
      '    "name": "oh-my-select"'
    )
  })

  it("renders serialized JSON string input as the decoded object", async () => {
    const selectedText = JSON.stringify(JSON.stringify({ a: 1 }))
    const dom = await loadPopup({
      selectedText,
      locale: "en",
      storageValue: 2,
    })

    const text = dom.window.document.body.textContent
    expect(text).toContain("Serialized JSON string")
    expect(text).toContain('"a": 1')
  })

  it("renders Chinese labels", async () => {
    const dom = await loadPopup({
      selectedText: '{"name":"oh-my-select"}',
      locale: "zh-CN",
      storageValue: 2,
    })

    const text = dom.window.document.body.textContent
    expect(text).toContain("JSON 预览器")
    expect(text).toContain("复制反序列化 JSON")
    expect(text).toContain("复制序列化 JSON")
  })
})

async function loadPopup({ selectedText, locale, storageValue }) {
  const popupPath = join(pluginDir, "popup.html")
  const errors = []
  const virtualConsole = new VirtualConsole()
  virtualConsole.on("jsdomError", (error) => errors.push(error.message))

  const dom = new JSDOM(await readFile(popupPath, "utf8"), {
    url: pathToFileURL(popupPath).href,
    resources: "usable",
    runScripts: "dangerously",
    virtualConsole,
    beforeParse(window) {
      window.ohMySelect = {
        context: {
          selectedText,
          locale,
        },
        closePopup() {
          return Promise.resolve()
        },
        storage: {
          get(key) {
            return Promise.resolve(key === "indentSize" ? storageValue : null)
          },
        },
      }
    },
  })

  await new Promise((resolve) => {
    dom.window.addEventListener("load", resolve)
  })
  await new Promise((resolve) => {
    dom.window.setTimeout(resolve, 0)
  })

  expect(errors).toEqual([])
  return dom
}
```

- [ ] **Step 2: Run the popup tests and verify they fail**

Run:

```bash
bunx vitest run examples/plugins/json-previewer/popup.test.js
```

Expected: FAIL because `./popup.html` does not exist.

- [ ] **Step 3: Write the popup implementation**

Create `examples/plugins/json-previewer/popup.html` with:

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
        grid-template-rows: auto minmax(0, 1fr) auto auto;
        gap: 10px;
        padding: 12px;
      }

      .summary {
        display: grid;
        gap: 5px;
      }

      .eyebrow,
      .source-label,
      .source-kind,
      .status {
        margin: 0;
        color: #475569;
        font-size: 12px;
        line-height: 1.35;
      }

      .eyebrow {
        color: #0f172a;
        font-size: 11px;
        font-weight: 800;
        text-transform: uppercase;
      }

      .source-kind {
        font-weight: 700;
      }

      .source {
        margin: 0;
        overflow: hidden;
        color: #020617;
        font-family:
          "SFMono-Regular", Consolas, "Liberation Mono", Menlo, monospace;
        font-size: 12px;
        line-height: 1.35;
        text-overflow: ellipsis;
        white-space: nowrap;
      }

      .preview {
        min-height: 0;
        overflow: auto;
        border: 1px solid #d7dee8;
        background: #ffffff;
      }

      pre {
        min-width: max-content;
        margin: 0;
        padding: 10px;
        font-family:
          "SFMono-Regular", Consolas, "Liberation Mono", Menlo, monospace;
        font-size: 12px;
        line-height: 1.45;
        white-space: pre;
      }

      .actions {
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: 8px;
      }

      button {
        display: inline-flex;
        min-width: 0;
        height: 34px;
        align-items: center;
        justify-content: center;
        gap: 6px;
        border: 1px solid #0f766e;
        background: #0f766e;
        color: #ffffff;
        cursor: pointer;
        font-size: 12px;
        font-weight: 700;
      }

      button.secondary {
        border-color: #cbd5e1;
        background: #ffffff;
        color: #0f172a;
      }

      button:hover {
        border-color: #0369a1;
      }

      button:focus-visible {
        outline: 2px solid #0369a1;
        outline-offset: 1px;
      }

      button svg {
        flex: 0 0 auto;
      }

      .status {
        min-height: 18px;
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
    <script src="./json-core.js"></script>
    <script>
      const {
        DEFAULT_INDENT,
        formatObject,
        indentOrDefault,
        parseJsonObjectSelection,
        serializeObject,
      } = window.ohMySelectJsonCore;

      const host = window.ohMySelect || {
        context: {
          selectedText: '{"name":"oh-my-select","enabled":true}',
          locale: "en",
        },
        closePopup() {
          return Promise.resolve();
        },
        storage: {
          get() {
            return Promise.resolve(DEFAULT_INDENT);
          },
        },
      };

      const labels = {
        en: {
          title: "JSON Previewer",
          source: "Original",
          sourceObject: "JSON object",
          sourceSerialized: "Serialized JSON string",
          preview: "Formatted JSON preview",
          copyDeserialized: "Copy deserialized JSON",
          copySerialized: "Copy serialized JSON",
          unsupported: "Unsupported JSON object",
          close: "Close",
          copied: "Copied",
          copyFailed: "Copy failed",
        },
        "zh-CN": {
          title: "JSON 预览器",
          source: "原始值",
          sourceObject: "JSON 对象",
          sourceSerialized: "序列化 JSON 字符串",
          preview: "格式化 JSON 预览",
          copyDeserialized: "复制反序列化 JSON",
          copySerialized: "复制序列化 JSON",
          unsupported: "不支持的 JSON 对象",
          close: "关闭",
          copied: "已复制",
          copyFailed: "复制失败",
        },
      };

      const locale =
        host.context && host.context.locale === "zh-CN" ? "zh-CN" : "en";
      const t = labels[locale];
      const selectedText =
        typeof host.context?.selectedText === "string"
          ? host.context.selectedText
          : "";
      const parsed = parseJsonObjectSelection(selectedText);
      const app = document.getElementById("app");

      document.documentElement.lang = locale;

      if (!parsed) {
        renderError();
      } else {
        renderJson();
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

      async function renderJson() {
        const indentSize = await loadIndentSize();
        const formatted = formatObject(parsed.object, indentSize);
        const serialized = serializeObject(parsed.object);
        const sourceKind =
          parsed.sourceKind === "serialized-string"
            ? t.sourceSerialized
            : t.sourceObject;

        app.innerHTML = `
          <section class="summary" aria-label="${escapeAttribute(t.title)}">
            <p class="eyebrow">${escapeHtml(t.title)}</p>
            <p class="source-kind">${escapeHtml(sourceKind)}</p>
            <p class="source-label">${escapeHtml(t.source)}</p>
            <p class="source" title="${escapeAttribute(parsed.sourceText)}">${escapeHtml(
              parsed.sourceText
            )}</p>
          </section>
          <section class="preview" aria-label="${escapeAttribute(t.preview)}">
            <pre><code>${escapeHtml(formatted)}</code></pre>
          </section>
          <section class="actions">
            ${renderCopyButton("deserialized", t.copyDeserialized)}
            ${renderCopyButton("serialized", t.copySerialized)}
          </section>
          <p class="status" id="status" aria-live="polite"></p>
        `;

        document
          .querySelector('[data-copy-kind="deserialized"]')
          .addEventListener("click", () => copyValue(formatted));
        document
          .querySelector('[data-copy-kind="serialized"]')
          .addEventListener("click", () => copyValue(serialized));
      }

      function renderCopyButton(kind, label) {
        return `
          <button type="button" data-copy-kind="${kind}" aria-label="${escapeAttribute(
            label
          )}">
            <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
              <rect x="9" y="9" width="10" height="10" rx="1.5" fill="none" stroke="currentColor" stroke-width="2"></rect>
              <path d="M6 15H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v1" fill="none" stroke="currentColor" stroke-linecap="round" stroke-width="2"></path>
            </svg>
            <span>${escapeHtml(label)}</span>
          </button>
        `;
      }

      async function loadIndentSize() {
        try {
          if (!host.storage?.get) {
            return DEFAULT_INDENT;
          }

          const stored = await host.storage.get("indentSize");
          return indentOrDefault(stored);
        } catch {
          return DEFAULT_INDENT;
        }
      }

      async function copyValue(value) {
        const copied = await writeClipboard(value);
        showStatus(copied ? t.copied : t.copyFailed);
      }

      function showStatus(message) {
        const status = document.getElementById("status");
        status.textContent = message;

        window.clearTimeout(showStatus.timeout);
        showStatus.timeout = window.setTimeout(() => {
          status.textContent = "";
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

- [ ] **Step 4: Run the popup tests and verify they pass**

Run:

```bash
bunx vitest run examples/plugins/json-previewer/popup.test.js
```

Expected: PASS for all tests in `popup.test.js`.

- [ ] **Step 5: Commit Task 3**

Run:

```bash
git add examples/plugins/json-previewer/popup.html examples/plugins/json-previewer/popup.test.js
git commit -m "feat: add json previewer popup"
```

Expected: commit succeeds.

---

### Task 4: Settings Page

**Files:**
- Create: `examples/plugins/json-previewer/settings.test.js`
- Create: `examples/plugins/json-previewer/settings.html`

- [ ] **Step 1: Write the failing settings tests**

Create `examples/plugins/json-previewer/settings.test.js` with:

```js
import { readFile } from "node:fs/promises"
import { dirname, join } from "node:path"
import { fileURLToPath, pathToFileURL } from "node:url"
import { JSDOM, VirtualConsole } from "jsdom"
import { describe, expect, it } from "vitest"

const pluginDir = dirname(fileURLToPath(import.meta.url))

describe("json previewer settings", () => {
  it("shows the default indentation when storage is empty", async () => {
    const { dom } = await loadSettings({ locale: "en", initialValue: null })

    expect(dom.window.document.getElementById("indent").value).toBe("2")
    expect(dom.window.document.body.textContent).toContain(
      "Indent size (0-8 spaces)"
    )
  })

  it("saves valid indentation values", async () => {
    const { dom, stored } = await loadSettings({ locale: "en", initialValue: 2 })

    dom.window.document.getElementById("indent").value = "4"
    dom.window.document.getElementById("save").click()
    await tick(dom)

    expect(stored.indentSize).toBe(4)
    expect(dom.window.document.getElementById("status").textContent).toBe(
      "Saved"
    )
  })

  it("rejects invalid indentation values", async () => {
    const { dom, stored } = await loadSettings({ locale: "en", initialValue: 2 })

    dom.window.document.getElementById("indent").value = "9"
    dom.window.document.getElementById("save").click()
    await tick(dom)

    expect(stored.indentSize).toBe(2)
    expect(dom.window.document.getElementById("status").textContent).toBe(
      "Enter an integer from 0 to 8"
    )
  })

  it("renders Chinese labels", async () => {
    const { dom } = await loadSettings({ locale: "zh-CN", initialValue: 2 })

    expect(dom.window.document.body.textContent).toContain("JSON 预览器设置")
    expect(dom.window.document.body.textContent).toContain(
      "缩进大小（0-8 个空格）"
    )
    expect(dom.window.document.getElementById("save").textContent).toBe("保存")
  })
})

async function loadSettings({ locale, initialValue }) {
  const settingsPath = join(pluginDir, "settings.html")
  const stored = {}
  if (initialValue !== null) {
    stored.indentSize = initialValue
  }
  const errors = []
  const virtualConsole = new VirtualConsole()
  virtualConsole.on("jsdomError", (error) => errors.push(error.message))

  const dom = new JSDOM(await readFile(settingsPath, "utf8"), {
    url: pathToFileURL(settingsPath).href,
    resources: "usable",
    runScripts: "dangerously",
    virtualConsole,
    beforeParse(window) {
      window.ohMySelect = {
        context: {
          locale,
        },
        storage: {
          get(key) {
            return Promise.resolve(stored[key] ?? null)
          },
          set(key, value) {
            stored[key] = value
            return Promise.resolve()
          },
        },
      }
    },
  })

  await new Promise((resolve) => {
    dom.window.addEventListener("load", resolve)
  })
  await tick(dom)

  expect(errors).toEqual([])
  return { dom, stored }
}

function tick(dom) {
  return new Promise((resolve) => {
    dom.window.setTimeout(resolve, 0)
  })
}
```

- [ ] **Step 2: Run the settings tests and verify they fail**

Run:

```bash
bunx vitest run examples/plugins/json-previewer/settings.test.js
```

Expected: FAIL because `./settings.html` does not exist.

- [ ] **Step 3: Write the settings implementation**

Create `examples/plugins/json-previewer/settings.html` with:

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
        background: #ffffff;
        color: #101828;
        font-family:
          -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      }

      main {
        display: grid;
        gap: 14px;
        padding: 24px;
      }

      h1 {
        margin: 0;
        font-size: 20px;
        line-height: 1.3;
      }

      label {
        display: grid;
        gap: 6px;
        color: #344054;
        font-size: 13px;
      }

      input {
        width: 160px;
        height: 34px;
        border: 1px solid #d0d5dd;
        padding: 0 10px;
        color: #101828;
        font-size: 13px;
      }

      input:focus-visible,
      button:focus-visible {
        outline: 2px solid #0369a1;
        outline-offset: 1px;
      }

      button {
        width: fit-content;
        height: 32px;
        border: 1px solid #0f766e;
        background: #0f766e;
        color: #ffffff;
        padding: 0 12px;
        cursor: pointer;
        font-size: 13px;
        font-weight: 700;
      }

      .hint,
      .status {
        margin: 0;
        color: #475467;
        font-size: 12px;
        line-height: 1.4;
      }

      .status {
        min-height: 18px;
      }

      .status.error {
        color: #b42318;
      }
    </style>
  </head>
  <body>
    <main>
      <h1 id="title">JSON Previewer Settings</h1>
      <label for="indent">
        <span id="indent-label">Indent size (0-8 spaces)</span>
        <input id="indent" type="number" min="0" max="8" step="1" />
      </label>
      <p class="hint" id="hint">Use 0 for compact single-line JSON.</p>
      <button id="save" type="button">Save</button>
      <p class="status" id="status" aria-live="polite"></p>
    </main>
    <script src="./json-core.js"></script>
    <script>
      const { DEFAULT_INDENT, indentOrDefault, normalizeIndent } =
        window.ohMySelectJsonCore;

      const host = window.ohMySelect || {
        context: {
          locale: "en",
        },
        storage: {
          get() {
            return Promise.resolve(DEFAULT_INDENT);
          },
          set() {
            return Promise.resolve();
          },
        },
      };

      const labels = {
        en: {
          title: "JSON Previewer Settings",
          indent: "Indent size (0-8 spaces)",
          hint: "Use 0 for compact single-line JSON.",
          save: "Save",
          saved: "Saved",
          invalid: "Enter an integer from 0 to 8",
          saveFailed: "Save failed",
        },
        "zh-CN": {
          title: "JSON 预览器设置",
          indent: "缩进大小（0-8 个空格）",
          hint: "使用 0 可输出单行紧凑 JSON。",
          save: "保存",
          saved: "已保存",
          invalid: "请输入 0 到 8 的整数",
          saveFailed: "保存失败",
        },
      };

      const locale =
        host.context && host.context.locale === "zh-CN" ? "zh-CN" : "en";
      const t = labels[locale];
      const title = document.getElementById("title");
      const label = document.getElementById("indent-label");
      const hint = document.getElementById("hint");
      const input = document.getElementById("indent");
      const saveButton = document.getElementById("save");
      const status = document.getElementById("status");

      document.documentElement.lang = locale;
      title.textContent = t.title;
      label.textContent = t.indent;
      hint.textContent = t.hint;
      saveButton.textContent = t.save;

      loadSettings();

      saveButton.addEventListener("click", async () => {
        const indentSize = normalizeIndent(input.value);
        if (indentSize === null) {
          showStatus(t.invalid, true);
          return;
        }

        try {
          await host.storage.set("indentSize", indentSize);
          showStatus(t.saved, false);
        } catch {
          showStatus(t.saveFailed, true);
        }
      });

      async function loadSettings() {
        try {
          const stored = await host.storage.get("indentSize");
          input.value = String(indentOrDefault(stored));
        } catch {
          input.value = String(DEFAULT_INDENT);
        }
      }

      function showStatus(message, isError) {
        status.textContent = message;
        status.className = isError ? "status error" : "status";
      }
    </script>
  </body>
</html>
```

- [ ] **Step 4: Run the settings tests and verify they pass**

Run:

```bash
bunx vitest run examples/plugins/json-previewer/settings.test.js
```

Expected: PASS for all tests in `settings.test.js`.

- [ ] **Step 5: Commit Task 4**

Run:

```bash
git add examples/plugins/json-previewer/settings.html examples/plugins/json-previewer/settings.test.js
git commit -m "feat: add json previewer settings"
```

Expected: commit succeeds.

---

### Task 5: Manifest And Package Validation

**Files:**
- Create: `examples/plugins/json-previewer/manifest.json`
- Create: `examples/plugins/json-previewer/plugin-package.test.js`

- [ ] **Step 1: Write the failing package validation tests**

Create `examples/plugins/json-previewer/plugin-package.test.js` with:

```js
import { existsSync } from "node:fs"
import { readFile } from "node:fs/promises"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import { describe, expect, it } from "vitest"

const pluginDir = dirname(fileURLToPath(import.meta.url))

describe("json previewer plugin package", () => {
  it("has a valid manifest with storage permission only", async () => {
    const manifest = JSON.parse(
      await readFile(join(pluginDir, "manifest.json"), "utf8")
    )

    expect(manifest).toMatchObject({
      id: "json-previewer",
      name: {
        "zh-CN": "JSON 预览器",
        en: "JSON Previewer",
      },
      version: "0.1.0",
      matcher: "matcher.js",
      popup: {
        entry: "popup.html",
        width: 460,
        height: 420,
      },
      settings: {
        entry: "settings.html",
      },
      permissions: {
        openExternal: false,
        storage: true,
      },
    })
  })

  it("references files that exist in the plugin folder", async () => {
    const manifest = JSON.parse(
      await readFile(join(pluginDir, "manifest.json"), "utf8")
    )

    expect(existsSync(join(pluginDir, manifest.matcher))).toBe(true)
    expect(existsSync(join(pluginDir, manifest.popup.entry))).toBe(true)
    expect(existsSync(join(pluginDir, manifest.settings.entry))).toBe(true)
    expect(existsSync(join(pluginDir, "json-core.js"))).toBe(true)
  })

  it("loads shared core from popup and settings without module imports", async () => {
    const popup = await readFile(join(pluginDir, "popup.html"), "utf8")
    const settings = await readFile(join(pluginDir, "settings.html"), "utf8")

    expect(popup).toContain('<script src="./json-core.js"></script>')
    expect(settings).toContain('<script src="./json-core.js"></script>')
    expect(popup).not.toContain('type="module"')
    expect(settings).not.toContain('type="module"')
    expect(popup).not.toContain('from "./json-core.js"')
    expect(settings).not.toContain('from "./json-core.js"')
  })

  it("contains accessible popup controls and status feedback", async () => {
    const popup = await readFile(join(pluginDir, "popup.html"), "utf8")

    expect(popup).toContain('aria-live="polite"')
    expect(popup).toContain('aria-label="${escapeAttribute(t.preview)}"')
    expect(popup).toContain("data-copy-kind")
    expect(popup).toContain("<button")
  })
})
```

- [ ] **Step 2: Run the package validation tests and verify they fail**

Run:

```bash
bunx vitest run examples/plugins/json-previewer/plugin-package.test.js
```

Expected: FAIL because `manifest.json` does not exist.

- [ ] **Step 3: Write the manifest**

Create `examples/plugins/json-previewer/manifest.json` with:

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

- [ ] **Step 4: Run the package validation tests and verify they pass**

Run:

```bash
bunx vitest run examples/plugins/json-previewer/plugin-package.test.js
```

Expected: PASS for all tests in `plugin-package.test.js`.

- [ ] **Step 5: Run all JSON Previewer plugin tests together**

Run:

```bash
bunx vitest run examples/plugins/json-previewer
```

Expected: PASS for `json-core.test.js`, `matcher.test.js`, `popup.test.js`, `settings.test.js`, and `plugin-package.test.js`.

- [ ] **Step 6: Commit Task 5**

Run:

```bash
git add examples/plugins/json-previewer/manifest.json examples/plugins/json-previewer/plugin-package.test.js
git commit -m "feat: package json previewer plugin"
```

Expected: commit succeeds.

---

### Task 6: Documentation And Final Verification

**Files:**
- Create: `examples/plugins/json-previewer/README.md`
- Modify: `README.md`

- [ ] **Step 1: Write the plugin README**

Create `examples/plugins/json-previewer/README.md` with:

```md
# JSON Previewer

Example oh-my-select plugin for selected JSON objects.

## Supported Inputs

- Direct JSON objects, such as `{"name":"oh-my-select","enabled":true}`
- Serialized JSON string literals whose decoded value is a JSON object, such as `"{\"name\":\"oh-my-select\",\"enabled\":true}"`

The plugin trims surrounding whitespace before parsing.

## Rejected Inputs

- Arrays, including arrays of objects
- JSON primitives such as strings, numbers, booleans, and `null`
- Broken JSON
- JSON with comments, trailing commas, or JSON5 syntax
- JSON followed or preceded by non-whitespace text

## Copy Outputs

- Copy deserialized JSON copies the formatted object JSON using the configured indentation.
- Copy serialized JSON copies a JSON string literal containing compact object JSON.

For `{"a":1}`, copy deserialized JSON returns:

```json
{
  "a": 1
}
```

Copy serialized JSON returns:

```json
"{\"a\":1}"
```

## Settings

The settings page lets you configure indentation from `0` through `8` spaces.

- `0` produces compact single-line object JSON.
- The default is `2` spaces.
- Invalid values are not saved.

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
4. Open this plugin's settings page.
5. Confirm the indentation setting defaults to `2`.
6. Save indentation values `0`, `2`, and `4`.
7. Select one supported value in another application.
8. Confirm the popup shows the parsed JSON object with the configured indentation.
9. Confirm copy deserialized JSON copies formatted object JSON.
10. Confirm copy serialized JSON copies a JSON string literal.
11. Select rejected values such as `[{"a":1}]`, `"hello"`, `123`, `null`, and `{"a":1} trailing`.
12. Confirm the JSON Previewer popup does not appear for rejected values.
```

- [ ] **Step 2: Update the root README example plugin list**

Modify the `Included examples:` list in `README.md` so it reads:

```md
Included examples:

- `quick-search`: accepts non-empty selected text, displays it, and opens a configurable search URL.
- `color-converter`: accepts supported CSS color values, previews the color, and copies HEX, RGB, HSL, or OKLCH output.
- `json-previewer`: accepts JSON objects and serialized JSON object strings, previews formatted JSON, and copies deserialized or serialized JSON output.
```

- [ ] **Step 3: Run focused plugin tests**

Run:

```bash
bunx vitest run examples/plugins/json-previewer
```

Expected: PASS for all JSON Previewer plugin tests.

- [ ] **Step 4: Run the repository test suite**

Run:

```bash
bun run test
```

Expected: PASS for all Vitest tests.

- [ ] **Step 5: Run typecheck**

Run:

```bash
bun run typecheck
```

Expected: PASS with no TypeScript errors.

- [ ] **Step 6: Run lint**

Run:

```bash
bun run lint
```

Expected: PASS with no lint errors.

- [ ] **Step 7: Run the Rust plugin engine test**

Run:

```bash
cargo test repository_json_previewer_matcher_runs_in_quickjs --manifest-path src-tauri/Cargo.toml
```

Expected: PASS for the JSON Previewer matcher test.

- [ ] **Step 8: Check git status**

Run:

```bash
git status --short
```

Expected: only files intentionally changed for JSON Previewer remain unstaged. Existing unrelated `.codex/skills/ui-ux-pro-max/scripts/__pycache__/*.pyc` modifications may still appear and must not be staged.

- [ ] **Step 9: Commit Task 6**

Run:

```bash
git add README.md examples/plugins/json-previewer/README.md
git commit -m "docs: document json previewer plugin"
```

Expected: commit succeeds.

---

## Final Acceptance

After all tasks are complete, run:

```bash
bunx vitest run examples/plugins/json-previewer
bun run test
bun run typecheck
bun run lint
cargo test repository_json_previewer_matcher_runs_in_quickjs --manifest-path src-tauri/Cargo.toml
```

Expected:

- JSON Previewer plugin tests pass.
- Repository Vitest suite passes.
- Typecheck passes.
- Lint passes.
- Rust QuickJS matcher integration test passes.

Manual checks:

1. Run `bun run tauri dev`.
2. Import `examples/plugins/json-previewer` from Settings.
3. Open the plugin settings page and save indentation `4`.
4. Select `{"name":"oh-my-select","enabled":true}` in another application.
5. Confirm the popup previews the object with 4-space indentation.
6. Confirm copy deserialized JSON copies formatted object JSON.
7. Confirm copy serialized JSON copies a JSON string literal.
8. Select `"{\"name\":\"oh-my-select\",\"enabled\":true}"`.
9. Confirm the popup source kind says Serialized JSON string and previews the decoded object.
10. Select `[{"a":1}]`, `"hello"`, `123`, `null`, `true`, and `{"a":1} trailing`.
11. Confirm the JSON Previewer popup does not appear for rejected samples.

---

## Self-Review Notes

- Spec coverage: the plan covers plugin package, object-only parsing, serialized object strings, indentation settings, popup preview, both copy outputs, tests, README updates, and QuickJS matcher verification.
- Scope check: the work is a single example plugin plus one focused Rust test for matcher compatibility.
- Dependency check: no external packages are introduced.
- Git safety: do not stage unrelated `.codex/skills/ui-ux-pro-max/scripts/__pycache__` files that were dirty before this work.
