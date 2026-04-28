import { readFile } from "node:fs/promises"
import { dirname, join } from "node:path"
import { fileURLToPath, pathToFileURL } from "node:url"
import { JSDOM, VirtualConsole } from "jsdom"
import { describe, expect, it } from "vitest"

const pluginDir = dirname(fileURLToPath(import.meta.url))

describe("color converter popup", () => {
  it("renders a detected color after loading the shared color core script", async () => {
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
            selectedText: "#22c55e",
            locale: "en",
          },
          closePopup() {
            return Promise.resolve()
          },
        }
      },
    })

    await new Promise((resolve) => {
      dom.window.addEventListener("load", resolve)
    })

    expect(errors).toEqual([])
    expect(dom.window.document.body.textContent).toContain("Detected color")
    expect(dom.window.document.body.textContent).toContain("#22c55e")
    expect(dom.window.document.body.textContent).toContain("#22C55E")
    expect(
      dom.window.document.getElementById("swatch-color").style.backgroundColor
    ).toBe("rgb(34, 197, 94)")
  })
})
