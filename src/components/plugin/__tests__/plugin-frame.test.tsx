import { describe, expect, it } from "vitest"
import { PLUGIN_IFRAME_SANDBOX, buildPluginFrameSrc } from "../plugin-frame"

describe("PluginFrame", () => {
  it("does not allow custom protocols to trigger top-level navigation", () => {
    expect(PLUGIN_IFRAME_SANDBOX).not.toContain(
      "allow-top-navigation-to-custom-protocols"
    )
  })

  it("preserves the custom protocol URL for iframe navigation", () => {
    const src = buildPluginFrameSrc(
      "oms-plugin://localhost/color-converter/popup.html?viewKind=popup&selectionId=1",
      "session-1"
    )

    expect(src).toBe(
      "oms-plugin://localhost/color-converter/popup.html?viewKind=popup&selectionId=1&bridgeSession=session-1"
    )
  })
})
