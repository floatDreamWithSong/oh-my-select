import { readFile } from "node:fs/promises"
import { dirname, join } from "node:path"
import { fileURLToPath, pathToFileURL } from "node:url"
import { JSDOM, VirtualConsole } from "jsdom"
import { describe, expect, it, vi } from "vitest"

const pluginDir = dirname(fileURLToPath(import.meta.url))
const settingsPath = join(pluginDir, "settings.html")

describe("json previewer settings", () => {
  it("defaults to 2 with English labels when storage is empty", async () => {
    let dom

    try {
      ;({ dom } = await loadSettings({ locale: "en" }))

      expect(dom.window.document.body.textContent).toContain(
        "Indent size (0-8 spaces)"
      )
      expect(dom.window.document.getElementById("indent").value).toBe("2")
    } finally {
      dom?.window.close()
    }
  })

  it("saves a valid indent size", async () => {
    const stored = {}
    let dom

    try {
      ;({ dom } = await loadSettings({ locale: "en", stored }))

      dom.window.document.getElementById("indent").value = "4"
      dom.window.document.getElementById("save").click()
      await flushTimers(dom.window)

      expect(stored.indentSize).toBe(4)
      expect(dom.window.document.getElementById("status").textContent).toBe(
        "Saved"
      )
    } finally {
      dom?.window.close()
    }
  })

  it("rejects invalid indent sizes without overwriting storage", async () => {
    const stored = { indentSize: 2 }
    let dom

    try {
      ;({ dom } = await loadSettings({ locale: "en", stored }))

      dom.window.document.getElementById("indent").value = "9"
      dom.window.document.getElementById("save").click()
      await flushTimers(dom.window)

      expect(stored.indentSize).toBe(2)
      expect(dom.window.document.getElementById("status").textContent).toBe(
        "Enter an integer from 0 to 8"
      )
    } finally {
      dom?.window.close()
    }
  })

  it("renders Chinese labels", async () => {
    let dom

    try {
      ;({ dom } = await loadSettings({ locale: "zh-CN" }))

      const text = dom.window.document.body.textContent
      expect(text).toContain("JSON 预览器设置")
      expect(text).toContain("缩进大小（0-8 个空格）")
      expect(dom.window.document.getElementById("save").textContent).toBe(
        "保存"
      )
    } finally {
      dom?.window.close()
    }
  })
})

async function loadSettings({ locale, stored = {} }) {
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
          get: vi.fn((key) => Promise.resolve(stored[key])),
          set: vi.fn((key, value) => {
            stored[key] = value
            return Promise.resolve()
          }),
        },
      }
    },
  })

  await waitForLoad(dom.window)
  await flushTimers(dom.window)

  expect(errors).toEqual([])
  return { dom, stored }
}

function waitForLoad(window) {
  if (window.document.readyState === "complete") {
    return Promise.resolve()
  }

  return new Promise((resolve) => {
    window.addEventListener("load", resolve, { once: true })
  })
}

function flushTimers(window) {
  return new Promise((resolve) => {
    window.setTimeout(resolve, 0)
  })
}
