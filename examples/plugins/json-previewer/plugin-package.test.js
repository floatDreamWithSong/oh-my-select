import { existsSync } from "node:fs"
import { readFile } from "node:fs/promises"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import { describe, expect, it } from "vitest"

const pluginDir = dirname(fileURLToPath(import.meta.url))

describe("json previewer plugin package", () => {
  it("has a valid manifest with storage and settings enabled", async () => {
    const manifest = JSON.parse(
      await readFile(join(pluginDir, "manifest.json"), "utf8")
    )

    expect(manifest).toEqual({
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

  it("loads the JSON core from popup and settings without module imports", async () => {
    const popup = await readFile(join(pluginDir, "popup.html"), "utf8")
    const settings = await readFile(join(pluginDir, "settings.html"), "utf8")

    for (const html of [popup, settings]) {
      expect(html).toContain('<script src="./json-core.js"></script>')
      expect(html).not.toContain('type="module"')
      expect(html).not.toContain('from "./json-core.js"')
    }
  })

  it("keeps popup copy and status affordances accessible", async () => {
    const popup = await readFile(join(pluginDir, "popup.html"), "utf8")

    expect(popup).toContain('aria-live="polite"')
    expect(popup).toContain('aria-label="${escapeAttribute(')
    expect(popup).toContain("data-copy")
    expect(popup).toContain("<button")
  })
})
