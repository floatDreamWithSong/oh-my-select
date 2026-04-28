import { readFile } from "node:fs/promises"
import { dirname, join } from "node:path"
import { fileURLToPath, pathToFileURL } from "node:url"
import { JSDOM, VirtualConsole } from "jsdom"
import { describe, expect, it } from "vitest"

const pluginDir = dirname(fileURLToPath(import.meta.url))

describe("json previewer popup", () => {
  it("renders direct object JSON with stored indentation", async () => {
    let dom

    try {
      dom = await loadPopup({
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
      expect(dom.window.document.querySelector(".preview").tabIndex).toBe(0)
      expect(
        dom.window.document.querySelector(".actions").hasAttribute("aria-label")
      ).toBe(false)
    } finally {
      dom?.window.close()
    }
  })

  it("renders serialized JSON string input as the decoded object", async () => {
    const selectedText = JSON.stringify(JSON.stringify({ a: 1 }))
    let dom

    try {
      dom = await loadPopup({
        selectedText,
        locale: "en",
        storageValue: 2,
      })

      const text = dom.window.document.body.textContent
      expect(text).toContain("Serialized JSON string")
      expect(text).toContain('"a": 1')
    } finally {
      dom?.window.close()
    }
  })

  it("renders Chinese labels", async () => {
    let dom

    try {
      dom = await loadPopup({
        selectedText: '{"name":"oh-my-select"}',
        locale: "zh-CN",
        storageValue: 2,
      })

      const text = dom.window.document.body.textContent
      expect(text).toContain("JSON 预览器")
      expect(text).toContain("复制反序列化 JSON")
      expect(text).toContain("复制序列化 JSON")
    } finally {
      dom?.window.close()
    }
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
