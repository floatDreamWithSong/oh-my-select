import { describe, expect, it } from "vitest"
import { PLUGIN_IFRAME_SANDBOX } from "../plugin-frame"

describe("PluginFrame", () => {
  it("does not allow custom protocols to trigger top-level navigation", () => {
    expect(PLUGIN_IFRAME_SANDBOX).not.toContain(
      "allow-top-navigation-to-custom-protocols"
    )
  })
})
