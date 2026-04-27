# Color Converter Plugin Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add `examples/plugins/color-converter`, a second example plugin that matches supported CSS color selections, previews the color, converts it to HEX/RGB/HSL/OKLCH, and lets the user copy each output.

**Architecture:** The example plugin stays inside `examples/plugins/color-converter` and uses the existing local plugin protocol. `matcher.js` is self-contained because the Rust matcher engine evaluates it directly with `rquickjs`; `color-core.js` is an ESM helper used by `popup.html` and Vitest so parsing and conversion logic can be tested. The popup is a compact browser UI rendered inside the existing sandboxed plugin iframe.

**Tech Stack:** Tauri v2 plugin host, plain HTML/CSS/JavaScript, ESM in plugin popup, Vitest, existing oh-my-select bridge.

---

## Scope Check

This plan implements one coherent example-plugin slice from the approved design. It does not modify the host plugin API, add a built-in plugin installer, add a settings page, or add third-party dependencies.

## File Structure

- Create `examples/plugins/color-converter/manifest.json`: plugin metadata, popup size, disabled permissions.
- Create `examples/plugins/color-converter/matcher.js`: synchronous conservative matcher for supported color formats.
- Create `examples/plugins/color-converter/matcher.test.js`: Vitest coverage for accepted and rejected matcher inputs.
- Create `examples/plugins/color-converter/color-core.js`: parser, conversion math, formatting helpers, and swatch CSS helper for the popup.
- Create `examples/plugins/color-converter/color-core.test.js`: Vitest coverage for parsing, conversion, uppercase HEX output, alpha, and invalid values.
- Create `examples/plugins/color-converter/popup.html`: compact color preview UI with conversion rows and copy buttons.
- Create `examples/plugins/color-converter/plugin-package.test.js`: package-level checks for manifest shape and referenced files.
- Create `examples/plugins/color-converter/README.md`: local usage and sample values.
- Modify `README.md`: mention both example plugins.

## Task 1: Matcher

**Files:**

- Create: `examples/plugins/color-converter/matcher.test.js`
- Create: `examples/plugins/color-converter/matcher.js`

- [ ] **Step 1: Write failing matcher tests**

Create `examples/plugins/color-converter/matcher.test.js`:

```js
import { describe, expect, it } from "vitest"
import { match } from "./matcher.js"

describe("color converter matcher", () => {
  it.each([
    "#fff",
    "#FFFF",
    "#22c55e",
    "#22C55Ecc",
    "rgb(34, 197, 94)",
    "rgba(34, 197, 94, .8)",
    "rgb(34 197 94 / 80%)",
    "hsl(142 71% 45%)",
    "hsla(142, 71%, 45%, .8)",
    "oklch(0.72 0.19 149.6)",
    "oklch(0.72 0.19 149.6 / .8)",
  ])("accepts %s", (selectedText) => {
    expect(match({ selectedText })).toBe(true)
  })

  it.each([
    "",
    "hello",
    "123456",
    "rgb()",
    "rgba(34, 197)",
    "rgb(34 197 94 / 140%)",
    "hsl(142 71 45)",
    "oklch(0.72 0.19)",
    "#12",
    "#xyzxyz",
  ])("rejects %s", (selectedText) => {
    expect(match({ selectedText })).toBe(false)
  })

  it("trims the selected text before matching", () => {
    expect(match({ selectedText: "  #22c55e\n" })).toBe(true)
  })

  it("rejects non-string context values", () => {
    expect(match({ selectedText: null })).toBe(false)
    expect(match({})).toBe(false)
  })
})
```

- [ ] **Step 2: Run the matcher tests to verify they fail**

Run:

```bash
bun run test -- examples/plugins/color-converter/matcher.test.js
```

Expected: FAIL because `examples/plugins/color-converter/matcher.js` does not exist yet.

- [ ] **Step 3: Implement the matcher**

Create `examples/plugins/color-converter/matcher.js`:

```js
export function match(context) {
  const selectedText =
    typeof context?.selectedText === "string" ? context.selectedText.trim() : ""

  return isSupportedColor(selectedText)
}

function isSupportedColor(value) {
  return (
    isHexColor(value) ||
    isRgbColor(value) ||
    isHslColor(value) ||
    isOklchColor(value)
  )
}

function isHexColor(value) {
  return /^#(?:[0-9a-f]{3}|[0-9a-f]{4}|[0-9a-f]{6}|[0-9a-f]{8})$/i.test(
    value
  )
}

function isRgbColor(value) {
  const parsed = parseFunction(value, ["rgb", "rgba"])
  if (!parsed) {
    return false
  }

  const args = splitColorArgs(parsed.body)
  return (
    args !== null &&
    args.channels.length === 3 &&
    args.channels.every(isByte) &&
    isOptionalAlpha(args.alpha)
  )
}

function isHslColor(value) {
  const parsed = parseFunction(value, ["hsl", "hsla"])
  if (!parsed) {
    return false
  }

  const args = splitColorArgs(parsed.body)
  return (
    args !== null &&
    args.channels.length === 3 &&
    isFiniteNumber(args.channels[0]) &&
    isPercent(args.channels[1]) &&
    isPercent(args.channels[2]) &&
    isOptionalAlpha(args.alpha)
  )
}

function isOklchColor(value) {
  const parsed = parseFunction(value, ["oklch"])
  if (!parsed) {
    return false
  }

  const args = splitColorArgs(parsed.body)
  return (
    args !== null &&
    args.channels.length === 3 &&
    args.channels.every(isFiniteNumber) &&
    isOptionalAlpha(args.alpha)
  )
}

function parseFunction(value, names) {
  const matchResult = /^([a-z]+)\((.*)\)$/i.exec(value)
  if (!matchResult || !names.includes(matchResult[1].toLowerCase())) {
    return null
  }

  return {
    name: matchResult[1].toLowerCase(),
    body: matchResult[2].trim(),
  }
}

function splitColorArgs(body) {
  if (!body) {
    return null
  }

  if (body.includes(",")) {
    const parts = body
      .split(",")
      .map((part) => part.trim())
      .filter(Boolean)

    return {
      channels: parts.slice(0, 3),
      alpha: parts.length === 4 ? parts[3] : null,
    }
  }

  const slashParts = body.split("/")
  if (slashParts.length > 2) {
    return null
  }

  const channels = slashParts[0].trim().split(/\s+/).filter(Boolean)
  return {
    channels,
    alpha: slashParts.length === 2 ? slashParts[1].trim() : null,
  }
}

function isOptionalAlpha(value) {
  return value === null || isAlpha(value)
}

function isAlpha(value) {
  if (value.endsWith("%")) {
    const numeric = Number(value.slice(0, -1))
    return Number.isFinite(numeric) && numeric >= 0 && numeric <= 100
  }

  const numeric = Number(value)
  return Number.isFinite(numeric) && numeric >= 0 && numeric <= 1
}

function isByte(value) {
  const numeric = Number(value)
  return Number.isFinite(numeric) && numeric >= 0 && numeric <= 255
}

function isPercent(value) {
  if (!value.endsWith("%")) {
    return false
  }

  const numeric = Number(value.slice(0, -1))
  return Number.isFinite(numeric) && numeric >= 0 && numeric <= 100
}

function isFiniteNumber(value) {
  return Number.isFinite(Number(value))
}
```

- [ ] **Step 4: Run the matcher tests to verify they pass**

Run:

```bash
bun run test -- examples/plugins/color-converter/matcher.test.js
```

Expected: PASS for all matcher tests.

- [ ] **Step 5: Commit matcher work**

```bash
git add examples/plugins/color-converter/matcher.js examples/plugins/color-converter/matcher.test.js
git commit -m "feat: add color converter matcher"
```

## Task 2: Conversion Core

**Files:**

- Create: `examples/plugins/color-converter/color-core.test.js`
- Create: `examples/plugins/color-converter/color-core.js`

- [ ] **Step 1: Write failing conversion tests**

Create `examples/plugins/color-converter/color-core.test.js`:

```js
import { describe, expect, it } from "vitest"
import {
  colorToCss,
  formatColorOutputs,
  parseColor,
} from "./color-core.js"

describe("color core", () => {
  it("parses HEX case-insensitively and outputs uppercase HEX", () => {
    const color = parseColor("#22c55ecc")

    expect(color).toMatchObject({
      r: 34,
      g: 197,
      b: 94,
      sourceFormat: "HEX",
    })
    expect(color.a).toBeCloseTo(0.8, 5)
    expect(formatColorOutputs(color).hex).toBe("#22C55ECC")
  })

  it("expands short HEX values", () => {
    expect(formatColorOutputs(parseColor("#fff")).hex).toBe("#FFFFFF")
    expect(formatColorOutputs(parseColor("#FFFF")).hex).toBe("#FFFFFFFF")
  })

  it("parses RGB comma and modern slash syntax", () => {
    expect(formatColorOutputs(parseColor("rgb(34, 197, 94)")).rgb).toBe(
      "rgb(34 197 94)"
    )
    expect(formatColorOutputs(parseColor("rgb(34 197 94 / 80%)")).rgb).toBe(
      "rgb(34 197 94 / 0.8)"
    )
  })

  it("parses HSL and converts it to RGB", () => {
    const outputs = formatColorOutputs(parseColor("hsl(142 71% 45%)"))

    expect(outputs.hex).toBe("#21C45D")
    expect(outputs.rgb).toBe("rgb(33 196 93)")
  })

  it("parses OKLCH values", () => {
    const color = parseColor("oklch(0.72 0.19 149.6 / .8)")
    const outputs = formatColorOutputs(color)

    expect(color.sourceFormat).toBe("OKLCH")
    expect(color.a).toBeCloseTo(0.8, 5)
    expect(outputs.oklch).toContain(" / 0.8)")
    expect(outputs.hex).toMatch(/^#[0-9A-F]{8}$/)
  })

  it("returns null for unsupported values", () => {
    expect(parseColor("hello")).toBeNull()
    expect(parseColor("#12")).toBeNull()
    expect(parseColor("rgb()")).toBeNull()
  })

  it("returns a CSS rgba color for swatch rendering", () => {
    expect(colorToCss(parseColor("rgba(34, 197, 94, .8)"))).toBe(
      "rgba(34, 197, 94, 0.8)"
    )
  })
})
```

- [ ] **Step 2: Run the conversion tests to verify they fail**

Run:

```bash
bun run test -- examples/plugins/color-converter/color-core.test.js
```

Expected: FAIL because `examples/plugins/color-converter/color-core.js` does not exist yet.

- [ ] **Step 3: Implement the conversion core**

Create `examples/plugins/color-converter/color-core.js`:

```js
const HEX_RE = /^#([0-9a-f]{3}|[0-9a-f]{4}|[0-9a-f]{6}|[0-9a-f]{8})$/i

export function parseColor(value) {
  const sourceText = typeof value === "string" ? value.trim() : ""

  return (
    parseHex(sourceText) ||
    parseRgb(sourceText) ||
    parseHsl(sourceText) ||
    parseOklch(sourceText)
  )
}

export function formatColorOutputs(color) {
  if (!color) {
    return null
  }

  const hsl = rgbToHsl(color.r, color.g, color.b)
  const oklch = rgbToOklch(color.r, color.g, color.b)

  return {
    hex: formatHex(color),
    rgb: formatRgb(color),
    hsl: `hsl(${formatNumber(hsl.h, 1)} ${formatNumber(
      hsl.s,
      1
    )}% ${formatNumber(hsl.l, 1)}%${formatAlphaPart(color.a)})`,
    oklch: `oklch(${formatNumber(oklch.l, 3)} ${formatNumber(
      oklch.c,
      3
    )} ${formatNumber(oklch.h, 1)}${formatAlphaPart(color.a)})`,
  }
}

export function colorToCss(color) {
  if (!color) {
    return "rgba(0, 0, 0, 0)"
  }

  return `rgba(${color.r}, ${color.g}, ${color.b}, ${formatAlpha(color.a)})`
}

function parseHex(value) {
  const match = HEX_RE.exec(value)
  if (!match) {
    return null
  }

  let hex = match[1].toUpperCase()
  if (hex.length === 3 || hex.length === 4) {
    hex = [...hex].map((character) => character + character).join("")
  }

  return normalizeColor({
    r: Number.parseInt(hex.slice(0, 2), 16),
    g: Number.parseInt(hex.slice(2, 4), 16),
    b: Number.parseInt(hex.slice(4, 6), 16),
    a: hex.length === 8 ? Number.parseInt(hex.slice(6, 8), 16) / 255 : 1,
    sourceFormat: "HEX",
    sourceText: value,
  })
}

function parseRgb(value) {
  const parsed = parseFunction(value, ["rgb", "rgba"])
  if (!parsed) {
    return null
  }

  const args = splitColorArgs(parsed.body)
  if (!args || args.channels.length !== 3 || !isOptionalAlpha(args.alpha)) {
    return null
  }

  const channels = args.channels.map(parseByte)
  if (channels.some((channel) => channel === null)) {
    return null
  }

  return normalizeColor({
    r: channels[0],
    g: channels[1],
    b: channels[2],
    a: args.alpha === null ? 1 : parseAlpha(args.alpha),
    sourceFormat: "RGB",
    sourceText: value,
  })
}

function parseHsl(value) {
  const parsed = parseFunction(value, ["hsl", "hsla"])
  if (!parsed) {
    return null
  }

  const args = splitColorArgs(parsed.body)
  if (
    !args ||
    args.channels.length !== 3 ||
    !isPercent(args.channels[1]) ||
    !isPercent(args.channels[2]) ||
    !isOptionalAlpha(args.alpha)
  ) {
    return null
  }

  const h = Number(args.channels[0])
  const s = parsePercent(args.channels[1])
  const l = parsePercent(args.channels[2])
  const rgb = hslToRgb(h, s, l)
  if (!rgb) {
    return null
  }

  return normalizeColor({
    ...rgb,
    a: args.alpha === null ? 1 : parseAlpha(args.alpha),
    sourceFormat: "HSL",
    sourceText: value,
  })
}

function parseOklch(value) {
  const parsed = parseFunction(value, ["oklch"])
  if (!parsed) {
    return null
  }

  const args = splitColorArgs(parsed.body)
  if (
    !args ||
    args.channels.length !== 3 ||
    !args.channels.every(isFiniteNumber) ||
    !isOptionalAlpha(args.alpha)
  ) {
    return null
  }

  const rgb = oklchToRgb(
    Number(args.channels[0]),
    Number(args.channels[1]),
    Number(args.channels[2])
  )

  return normalizeColor({
    ...rgb,
    a: args.alpha === null ? 1 : parseAlpha(args.alpha),
    sourceFormat: "OKLCH",
    sourceText: value,
  })
}

function parseFunction(value, names) {
  const match = /^([a-z]+)\((.*)\)$/i.exec(value)
  if (!match || !names.includes(match[1].toLowerCase())) {
    return null
  }

  return {
    name: match[1].toLowerCase(),
    body: match[2].trim(),
  }
}

function splitColorArgs(body) {
  if (!body) {
    return null
  }

  if (body.includes(",")) {
    const parts = body
      .split(",")
      .map((part) => part.trim())
      .filter(Boolean)

    return {
      channels: parts.slice(0, 3),
      alpha: parts.length === 4 ? parts[3] : null,
    }
  }

  const slashParts = body.split("/")
  if (slashParts.length > 2) {
    return null
  }

  return {
    channels: slashParts[0].trim().split(/\s+/).filter(Boolean),
    alpha: slashParts.length === 2 ? slashParts[1].trim() : null,
  }
}

function parseByte(value) {
  const numeric = Number(value)
  if (!Number.isFinite(numeric) || numeric < 0 || numeric > 255) {
    return null
  }

  return clamp(Math.round(numeric), 0, 255)
}

function parsePercent(value) {
  if (!isPercent(value)) {
    return null
  }

  return Number(value.slice(0, -1))
}

function parseAlpha(value) {
  if (value.endsWith("%")) {
    return Number(value.slice(0, -1)) / 100
  }

  return Number(value)
}

function isOptionalAlpha(value) {
  return value === null || isAlpha(value)
}

function isAlpha(value) {
  if (typeof value !== "string" || value.length === 0) {
    return false
  }

  if (value.endsWith("%")) {
    const numeric = Number(value.slice(0, -1))
    return Number.isFinite(numeric) && numeric >= 0 && numeric <= 100
  }

  const numeric = Number(value)
  return Number.isFinite(numeric) && numeric >= 0 && numeric <= 1
}

function isPercent(value) {
  if (typeof value !== "string" || !value.endsWith("%")) {
    return false
  }

  const numeric = Number(value.slice(0, -1))
  return Number.isFinite(numeric) && numeric >= 0 && numeric <= 100
}

function isFiniteNumber(value) {
  return Number.isFinite(Number(value))
}

function normalizeColor(color) {
  if (
    [color.r, color.g, color.b, color.a].some(
      (channel) => !Number.isFinite(channel)
    )
  ) {
    return null
  }

  return {
    r: clamp(Math.round(color.r), 0, 255),
    g: clamp(Math.round(color.g), 0, 255),
    b: clamp(Math.round(color.b), 0, 255),
    a: clamp(color.a, 0, 1),
    sourceFormat: color.sourceFormat,
    sourceText: color.sourceText,
  }
}

function formatHex(color) {
  const alpha = color.a < 1 ? toHexByte(Math.round(color.a * 255)) : ""
  return `#${toHexByte(color.r)}${toHexByte(color.g)}${toHexByte(color.b)}${alpha}`
}

function formatRgb(color) {
  return `rgb(${color.r} ${color.g} ${color.b}${formatAlphaPart(color.a)})`
}

function formatAlphaPart(alpha) {
  return alpha < 1 ? ` / ${formatAlpha(alpha)}` : ""
}

function formatAlpha(alpha) {
  return formatNumber(alpha, 3)
}

function formatNumber(value, precision) {
  return Number(value.toFixed(precision)).toString()
}

function toHexByte(value) {
  return clamp(value, 0, 255).toString(16).padStart(2, "0").toUpperCase()
}

function hslToRgb(h, s, l) {
  if (![h, s, l].every(Number.isFinite)) {
    return null
  }

  const hue = wrapHue(h) / 360
  const saturation = s / 100
  const lightness = l / 100

  if (saturation === 0) {
    const channel = lightness * 255
    return { r: channel, g: channel, b: channel }
  }

  const q =
    lightness < 0.5
      ? lightness * (1 + saturation)
      : lightness + saturation - lightness * saturation
  const p = 2 * lightness - q

  return {
    r: hueToRgb(p, q, hue + 1 / 3) * 255,
    g: hueToRgb(p, q, hue) * 255,
    b: hueToRgb(p, q, hue - 1 / 3) * 255,
  }
}

function hueToRgb(p, q, t) {
  let wrapped = t
  if (wrapped < 0) {
    wrapped += 1
  }
  if (wrapped > 1) {
    wrapped -= 1
  }
  if (wrapped < 1 / 6) {
    return p + (q - p) * 6 * wrapped
  }
  if (wrapped < 1 / 2) {
    return q
  }
  if (wrapped < 2 / 3) {
    return p + (q - p) * (2 / 3 - wrapped) * 6
  }
  return p
}

function rgbToHsl(r, g, b) {
  const red = r / 255
  const green = g / 255
  const blue = b / 255
  const max = Math.max(red, green, blue)
  const min = Math.min(red, green, blue)
  const lightness = (max + min) / 2

  if (max === min) {
    return { h: 0, s: 0, l: lightness * 100 }
  }

  const delta = max - min
  const saturation =
    lightness > 0.5
      ? delta / (2 - max - min)
      : delta / (max + min)
  let hue

  if (max === red) {
    hue = (green - blue) / delta + (green < blue ? 6 : 0)
  } else if (max === green) {
    hue = (blue - red) / delta + 2
  } else {
    hue = (red - green) / delta + 4
  }

  return {
    h: hue * 60,
    s: saturation * 100,
    l: lightness * 100,
  }
}

function oklchToRgb(l, c, h) {
  const hue = (wrapHue(h) * Math.PI) / 180
  const a = Math.cos(hue) * c
  const b = Math.sin(hue) * c
  const lPrime = l + 0.3963377774 * a + 0.2158037573 * b
  const mPrime = l - 0.1055613458 * a - 0.0638541728 * b
  const sPrime = l - 0.0894841775 * a - 1.291485548 * b
  const long = lPrime ** 3
  const medium = mPrime ** 3
  const short = sPrime ** 3

  return {
    r: linearToSrgb(
      4.0767416621 * long - 3.3077115913 * medium + 0.2309699292 * short
    ),
    g: linearToSrgb(
      -1.2684380046 * long + 2.6097574011 * medium - 0.3413193965 * short
    ),
    b: linearToSrgb(
      -0.0041960863 * long - 0.7034186147 * medium + 1.707614701 * short
    ),
  }
}

function rgbToOklch(r, g, b) {
  const red = srgbToLinear(r / 255)
  const green = srgbToLinear(g / 255)
  const blue = srgbToLinear(b / 255)
  const long = 0.4122214708 * red + 0.5363325363 * green + 0.0514459929 * blue
  const medium =
    0.2119034982 * red + 0.6806995451 * green + 0.1073969566 * blue
  const short = 0.0883024619 * red + 0.2817188376 * green + 0.6299787005 * blue
  const longRoot = Math.cbrt(long)
  const mediumRoot = Math.cbrt(medium)
  const shortRoot = Math.cbrt(short)
  const lightness =
    0.2104542553 * longRoot +
    0.793617785 * mediumRoot -
    0.0040720468 * shortRoot
  const a =
    1.9779984951 * longRoot -
    2.428592205 * mediumRoot +
    0.4505937099 * shortRoot
  const bAxis =
    0.0259040371 * longRoot +
    0.7827717662 * mediumRoot -
    0.808675766 * shortRoot
  const chroma = Math.sqrt(a ** 2 + bAxis ** 2)
  const hue = wrapHue((Math.atan2(bAxis, a) * 180) / Math.PI)

  return { l: lightness, c: chroma, h: hue }
}

function srgbToLinear(value) {
  return value <= 0.04045
    ? value / 12.92
    : ((value + 0.055) / 1.055) ** 2.4
}

function linearToSrgb(value) {
  const normalized =
    value <= 0.0031308 ? value * 12.92 : 1.055 * value ** (1 / 2.4) - 0.055

  return clamp(Math.round(normalized * 255), 0, 255)
}

function wrapHue(value) {
  return ((value % 360) + 360) % 360
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max)
}
```

- [ ] **Step 4: Run the conversion tests to verify they pass**

Run:

```bash
bun run test -- examples/plugins/color-converter/color-core.test.js
```

Expected: PASS for all conversion core tests.

- [ ] **Step 5: Commit conversion core work**

```bash
git add examples/plugins/color-converter/color-core.js examples/plugins/color-converter/color-core.test.js
git commit -m "feat: add color converter parsing logic"
```

## Task 3: Plugin Package And Popup UI

**Files:**

- Create: `examples/plugins/color-converter/plugin-package.test.js`
- Create: `examples/plugins/color-converter/manifest.json`
- Create: `examples/plugins/color-converter/popup.html`

- [ ] **Step 1: Write failing package tests**

Create `examples/plugins/color-converter/plugin-package.test.js`:

```js
import { existsSync } from "node:fs"
import { readFile } from "node:fs/promises"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import { describe, expect, it } from "vitest"

const pluginDir = dirname(fileURLToPath(import.meta.url))

describe("color converter plugin package", () => {
  it("has a valid manifest with no privileged permissions", async () => {
    const manifest = JSON.parse(
      await readFile(join(pluginDir, "manifest.json"), "utf8")
    )

    expect(manifest).toMatchObject({
      id: "color-converter",
      name: {
        "zh-CN": "颜色转换器",
        en: "Color Converter",
      },
      version: "0.1.0",
      matcher: "matcher.js",
      popup: {
        entry: "popup.html",
        width: 380,
        height: 300,
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
    expect(existsSync(join(pluginDir, "color-core.js"))).toBe(true)
  })

  it("loads the conversion core from the popup", async () => {
    const popup = await readFile(join(pluginDir, "popup.html"), "utf8")

    expect(popup).toContain('from "./color-core.js"')
    expect(popup).toContain('id="swatch-color"')
    expect(popup).toContain('aria-live="polite"')
  })
})
```

- [ ] **Step 2: Run the package tests to verify they fail**

Run:

```bash
bun run test -- examples/plugins/color-converter/plugin-package.test.js
```

Expected: FAIL because `manifest.json` and `popup.html` do not exist yet.

- [ ] **Step 3: Add the plugin manifest**

Create `examples/plugins/color-converter/manifest.json`:

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

- [ ] **Step 4: Add the popup HTML**

Create `examples/plugins/color-converter/popup.html`:

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
        gap: 12px;
        padding: 12px;
      }

      .preview {
        display: grid;
        grid-template-columns: 82px 1fr;
        gap: 12px;
        align-items: stretch;
      }

      .swatch {
        min-height: 82px;
        border: 1px solid #94a3b8;
        background-color: #ffffff;
        background-image:
          linear-gradient(45deg, #cbd5e1 25%, transparent 25%),
          linear-gradient(-45deg, #cbd5e1 25%, transparent 25%),
          linear-gradient(45deg, transparent 75%, #cbd5e1 75%),
          linear-gradient(-45deg, transparent 75%, #cbd5e1 75%);
        background-position:
          0 0,
          0 8px,
          8px -8px,
          -8px 0;
        background-size: 16px 16px;
      }

      .swatch-color {
        height: 100%;
        min-height: 80px;
      }

      .summary {
        display: grid;
        align-content: center;
        gap: 6px;
        min-width: 0;
      }

      .eyebrow {
        margin: 0;
        color: #475569;
        font-size: 11px;
        font-weight: 700;
        letter-spacing: 0;
        text-transform: uppercase;
      }

      .source {
        margin: 0;
        overflow: hidden;
        color: #020617;
        font-size: 16px;
        font-weight: 700;
        line-height: 1.25;
        text-overflow: ellipsis;
        white-space: nowrap;
      }

      .source-meta {
        margin: 0;
        color: #475569;
        font-size: 12px;
        line-height: 1.35;
      }

      .rows {
        display: grid;
        gap: 6px;
      }

      .row {
        display: grid;
        min-height: 38px;
        grid-template-columns: 58px minmax(0, 1fr) 34px;
        gap: 8px;
        align-items: center;
        border: 1px solid #e2e8f0;
        background: #ffffff;
        padding: 6px 7px;
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
        transition:
          background-color 160ms ease,
          border-color 160ms ease,
          color 160ms ease;
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
      }

      .error {
        display: grid;
        min-height: 100vh;
        align-content: center;
        gap: 12px;
        padding: 16px;
      }

      .error-title {
        margin: 0;
        font-size: 16px;
        font-weight: 700;
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
    <script type="module">
      import {
        colorToCss,
        formatColorOutputs,
        parseColor,
      } from "./color-core.js";

      const host = window.ohMySelect || {
        context: {
          selectedText: "#22c55e",
          locale: "en",
        },
        closePopup() {
          return Promise.resolve();
        },
      };

      const labels = {
        en: {
          title: "Detected color",
          description: "Converted to common CSS formats",
          unsupported: "Unsupported color value",
          close: "Close",
          copied: "Copied",
          copyFailed: "Copy failed",
          copyValue(format) {
            return `Copy ${format} value`;
          },
        },
        "zh-CN": {
          title: "识别到颜色",
          description: "已转换为常用 CSS 格式",
          unsupported: "不支持的颜色值",
          close: "关闭",
          copied: "已复制",
          copyFailed: "复制失败",
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
      const color = parseColor(selectedText);
      const app = document.getElementById("app");

      if (!color) {
        renderError();
      } else {
        renderColor();
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

      function renderColor() {
        const outputs = formatColorOutputs(color);
        const rows = [
          ["HEX", outputs.hex],
          ["RGB", outputs.rgb],
          ["HSL", outputs.hsl],
          ["OKLCH", outputs.oklch],
        ];

        app.innerHTML = `
          <section class="preview" aria-label="${escapeHtml(t.title)}">
            <div class="swatch" aria-hidden="true">
              <div class="swatch-color" id="swatch-color"></div>
            </div>
            <div class="summary">
              <p class="eyebrow">${escapeHtml(t.title)}</p>
              <p class="source" title="${escapeAttribute(selectedText)}">${escapeHtml(
                selectedText
              )}</p>
              <p class="source-meta">${escapeHtml(color.sourceFormat)} · ${escapeHtml(
                t.description
              )}</p>
            </div>
          </section>
          <section class="rows" aria-label="Converted values">
            ${rows
              .map(
                ([format, value], index) => `
                  <div class="row">
                    <span class="format">${format}</span>
                    <span class="value" title="${escapeAttribute(value)}">${escapeHtml(
                      value
                    )}</span>
                    <button type="button" data-copy-index="${index}" aria-label="${escapeAttribute(
                      t.copyValue(format)
                    )}">
                      <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
                        <rect x="9" y="9" width="10" height="10" rx="1.5" fill="none" stroke="currentColor" stroke-width="2"></rect>
                        <path d="M6 15H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v1" fill="none" stroke="currentColor" stroke-linecap="round" stroke-width="2"></path>
                      </svg>
                    </button>
                  </div>
                `
              )
              .join("")}
          </section>
          <p class="status" id="status" aria-live="polite"></p>
        `;

        document.getElementById("swatch-color").style.backgroundColor =
          colorToCss(color);
        document.querySelectorAll("[data-copy-index]").forEach((button) => {
          button.addEventListener("click", () => {
            const index = Number(button.getAttribute("data-copy-index"));
            copyValue(rows[index][1]);
          });
        });
      }

      async function copyValue(value) {
        const status = document.getElementById("status");
        const copied = await writeClipboard(value);
        status.textContent = copied ? t.copied : t.copyFailed;
        window.clearTimeout(copyValue.timeout);
        copyValue.timeout = window.setTimeout(() => {
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

- [ ] **Step 5: Run package tests**

Run:

```bash
bun run test -- examples/plugins/color-converter/plugin-package.test.js
```

Expected: PASS for all package tests.

- [ ] **Step 6: Run all color converter tests**

Run:

```bash
bun run test -- examples/plugins/color-converter
```

Expected: PASS for matcher, conversion core, and package tests.

- [ ] **Step 7: Commit package and popup work**

```bash
git add examples/plugins/color-converter/manifest.json examples/plugins/color-converter/popup.html examples/plugins/color-converter/plugin-package.test.js
git commit -m "feat: add color converter popup"
```

## Task 4: Documentation And Verification

**Files:**

- Create: `examples/plugins/color-converter/README.md`
- Modify: `README.md`

- [ ] **Step 1: Add plugin README**

Create `examples/plugins/color-converter/README.md`:

```markdown
# Color Converter

Example oh-my-select plugin for selected CSS color values.

## Supported Inputs

- `#rgb`, `#rgba`, `#rrggbb`, `#rrggbbaa`
- `rgb()` and `rgba()`
- `hsl()` and `hsla()`
- `oklch()`

HEX matching is case-insensitive. HEX output is uppercase.

## Try These Values

```text
#fff
#FFFF
#22c55e
#22C55Ecc
rgb(34, 197, 94)
rgba(34, 197, 94, .8)
rgb(34 197 94 / 80%)
hsl(142 71% 45%)
hsla(142, 71%, 45%, .8)
oklch(0.72 0.19 149.6)
oklch(0.72 0.19 149.6 / .8)
```

## Manual Check

1. Run the app with `bun run tauri dev`.
2. Open Settings from the tray.
3. Import this folder.
4. Select one supported value in another application.
5. Confirm the popup shows a swatch and HEX, RGB, HSL, and OKLCH rows.
6. Click each copy button and confirm the row reports `Copied`.
```

- [ ] **Step 2: Update root README example plugin section**

Replace the root `README.md` "Example Plugin" section with:

```markdown
## Example Plugins

Example local plugins live under:

```text
examples/plugins
```

Open Settings, import one of the plugin folders, select text in another application, and the matching plugin popup should appear near the cursor.

Included examples:

- `quick-search`: accepts non-empty selected text, displays it, and opens a configurable search URL.
- `color-converter`: accepts supported CSS color values, previews the color, and copies HEX, RGB, HSL, or OKLCH output.
```

- [ ] **Step 3: Run focused tests**

Run:

```bash
bun run test -- examples/plugins/color-converter
```

Expected: PASS for all color converter plugin tests.

- [ ] **Step 4: Run project verification**

Run:

```bash
bun run test
bun run typecheck
bun run lint
```

Expected:

- `bun run test`: all Vitest suites pass.
- `bun run typecheck`: TypeScript checks pass, including `examples/plugins/**/*.js`.
- `bun run lint`: ESLint reports no errors.

- [ ] **Step 5: Run manual import and copy verification**

Run:

```bash
bun run tauri dev
```

Expected manual flow:

1. The app starts hidden in the tray.
2. Open Settings from the tray.
3. Import `/Users/hanjiedeng/Desktop/oh-my-select/examples/plugins/color-converter`.
4. Select `#22c55e` in another application.
5. Confirm the color converter popup opens near the cursor.
6. Confirm the swatch is green and the HEX output is `#22C55E`.
7. Click the HEX copy button and confirm the row status becomes `Copied`.
8. Select `#22C55Ecc` and confirm the swatch shows transparency over the checkerboard.
9. Select `hello` and confirm the color converter popup does not appear.

If both `navigator.clipboard.writeText` and the textarea fallback fail inside the plugin iframe, stop implementation and revise the design before adding any host clipboard bridge.

- [ ] **Step 6: Commit documentation and verification updates**

```bash
git add README.md examples/plugins/color-converter/README.md
git commit -m "docs: document color converter plugin"
```

## Task 5: Final Review

**Files:**

- Review: `examples/plugins/color-converter/manifest.json`
- Review: `examples/plugins/color-converter/matcher.js`
- Review: `examples/plugins/color-converter/color-core.js`
- Review: `examples/plugins/color-converter/popup.html`
- Review: `examples/plugins/color-converter/*.test.js`
- Review: `README.md`
- Review: `examples/plugins/color-converter/README.md`

- [ ] **Step 1: Check final git diff**

Run:

```bash
git diff --stat HEAD~4..HEAD
git diff HEAD~4..HEAD -- examples/plugins/color-converter README.md
```

Expected: The diff contains only the color converter plugin files and README updates.

- [ ] **Step 2: Run final verification commands**

Run:

```bash
bun run test
bun run typecheck
bun run lint
```

Expected: all commands pass.

- [ ] **Step 3: Confirm manual verification result in the final response**

Report:

- Whether import verification succeeded.
- Whether copy verification succeeded.
- Whether transparent swatch verification succeeded.
- Any command that could not be run, with the concrete reason.

Do not claim the plugin is complete until the commands and manual checks have been run or explicitly marked as unavailable.

## Self-Review

- Spec coverage: Tasks cover the example plugin directory, conservative matcher, supported formats, case-insensitive HEX matching, uppercase HEX output, color preview, four output formats, copy buttons, localized labels, no settings page, no privileged permissions, error handling, focused tests, README updates, and manual import verification.
- Placeholder scan: This plan contains no deferred implementation markers.
- Type consistency: `parseColor`, `formatColorOutputs`, and `colorToCss` are introduced in Task 2 and imported by `popup.html` in Task 3 with matching names.
