import { readFile } from "node:fs/promises"
import { dirname, join } from "node:path"
import { fileURLToPath, pathToFileURL } from "node:url"
import { JSDOM, VirtualConsole } from "jsdom"
import { afterEach, describe, expect, it, vi } from "vitest"

const pluginDir = dirname(fileURLToPath(import.meta.url))
const popupPath = join(pluginDir, "popup.html")
const activeDoms = []

afterEach(() => {
  while (activeDoms.length > 0) {
    activeDoms.pop().window.close()
  }
})

describe("time converter popup", () => {
  it("renders English conversion rows after loading the shared time core script", async () => {
    const selectedText = "2024-01-02T03:04:05Z"
    const date = new Date(selectedText)
    const { document, errors } = await loadPopup({
      selectedText,
      locale: "en",
    })
    const text = document.body.textContent

    expect(errors).toEqual([])
    expect(text).toContain("Detected time")
    expect(text).toContain(selectedText)
    expect(document.querySelectorAll("[data-copy-index]")).toHaveLength(6)
    expect(text).toContain("Unix")
    expect(text).toContain(String(Math.floor(date.getTime() / 1000)))
    expect(text).toContain("Millis")
    expect(text).toContain(String(date.getTime()))
    expect(text).toContain("ISO UTC")
    expect(text).toContain("2024-01-02T03:04:05.000Z")
    expect(text).toContain("Local time")
    expect(text).toContain(formatLocalDateTime(date))
    expect(text).toContain("Local date")
    expect(text).toContain(formatLocalDate(date))
    expect(text).toContain("RFC 2822")
    expect(text).toContain(date.toUTCString())
  })

  it("renders unsupported English input and closes through the host", async () => {
    const { closePopup, document, errors } = await loadPopup({
      selectedText: "next sometime-ish",
      locale: "en",
    })

    expect(errors).toEqual([])
    expect(document.body.textContent).toContain("Unsupported time value")

    document.getElementById("close").click()

    expect(closePopup).toHaveBeenCalledTimes(1)
  })

  it("renders zh-CN copy status after clipboard copy succeeds", async () => {
    const { clipboardWriteText, document, errors, window } = await loadPopup({
      selectedText: "1704067200",
      locale: "zh-CN",
    })

    expect(errors).toEqual([])
    expect(document.body.textContent).toContain("识别到时间")

    document.querySelector("[data-copy-index]").click()
    await waitFor(() => {
      expect(document.body.textContent).toContain("已复制")
    }, window)

    expect(clipboardWriteText).toHaveBeenCalledWith("1704067200")
  })
})

async function loadPopup({ selectedText, locale }) {
  const errors = []
  const closePopup = vi.fn(() => Promise.resolve())
  const clipboardWriteText = vi.fn(() => Promise.resolve())
  const virtualConsole = new VirtualConsole()

  virtualConsole.on("jsdomError", (error) => errors.push(error.message))

  const dom = new JSDOM(await readFile(popupPath, "utf8"), {
    url: pathToFileURL(popupPath).href,
    resources: "usable",
    runScripts: "dangerously",
    virtualConsole,
    beforeParse(window) {
      Object.defineProperty(window.navigator, "clipboard", {
        value: {
          writeText: clipboardWriteText,
        },
        configurable: true,
      })
      window.ohMySelect = {
        context: {
          selectedText,
          locale,
        },
        closePopup,
      }
    },
  })
  activeDoms.push(dom)

  await waitForLoad(dom.window)

  return {
    clipboardWriteText,
    closePopup,
    document: dom.window.document,
    errors,
    window: dom.window,
  }
}

function waitForLoad(window) {
  if (window.document.readyState === "complete") {
    return Promise.resolve()
  }

  return new Promise((resolve) => {
    window.addEventListener("load", resolve, { once: true })
  })
}

async function waitFor(assertion, window) {
  const startedAt = Date.now()
  let lastError

  while (Date.now() - startedAt < 1000) {
    try {
      assertion()
      return
    } catch (error) {
      lastError = error
      await new Promise((resolve) => window.setTimeout(resolve, 10))
    }
  }

  throw lastError
}

function formatLocalDateTime(date) {
  return `${formatLocalDate(date)} ${pad2(date.getHours())}:${pad2(
    date.getMinutes()
  )}:${pad2(date.getSeconds())}`
}

function formatLocalDate(date) {
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(
    date.getDate()
  )}`
}

function pad2(value) {
  return String(value).padStart(2, "0")
}
