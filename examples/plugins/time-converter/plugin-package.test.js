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
