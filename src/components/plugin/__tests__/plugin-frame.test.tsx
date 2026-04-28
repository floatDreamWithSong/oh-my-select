import { describe, expect, it, vi } from "vitest"
import {
  PLUGIN_IFRAME_SANDBOX,
  buildPluginFrameEntryUrl,
  shouldFetchPluginFrameHtml,
} from "../plugin-frame"

vi.mock("@/lib/tauri-api", () => ({
  bridgeClosePopup: vi.fn(),
  bridgeOpenExternal: vi.fn(),
  getPluginViewHtml: vi.fn(),
  pluginStorageGet: vi.fn(),
  pluginStorageRemove: vi.fn(),
  pluginStorageSet: vi.fn(),
}))

describe("PluginFrame", () => {
  it("does not allow custom protocols to trigger top-level navigation", () => {
    expect(PLUGIN_IFRAME_SANDBOX).not.toContain(
      "allow-top-navigation-to-custom-protocols"
    )
  })

  it("uses the custom protocol URL only as a backend entry lookup", () => {
    const entryUrl = buildPluginFrameEntryUrl(
      "oms-plugin://localhost/color-converter/popup.html?viewKind=popup&selectionId=1",
      "session-1"
    )

    expect(entryUrl).toBe(
      "oms-plugin://localhost/color-converter/popup.html?viewKind=popup&selectionId=1&bridgeSession=session-1"
    )
  })

  it("skips fetching iframe html when preloaded html is available", () => {
    expect(shouldFetchPluginFrameHtml("<main>Ready</main>")).toBe(false)
    expect(shouldFetchPluginFrameHtml()).toBe(true)
  })
})
