import { describe, expect, it } from "vitest"
import { isPluginBridgeRequest } from "./plugin-bridge"

describe("isPluginBridgeRequest", () => {
  it("accepts valid bridge requests", () => {
    expect(
      isPluginBridgeRequest({
        source: "oh-my-select-plugin",
        id: "1",
        pluginId: "quick-search",
        viewKind: "popup",
        method: "storage.get",
        args: ["engine"],
      })
    ).toBe(true)
  })

  it("rejects unrelated messages", () => {
    expect(isPluginBridgeRequest({ source: "other" })).toBe(false)
  })

  it("rejects invalid methods and view kinds", () => {
    expect(
      isPluginBridgeRequest({
        source: "oh-my-select-plugin",
        id: "1",
        pluginId: "quick-search",
        viewKind: "panel",
        method: "storage.get",
        args: ["engine"],
      })
    ).toBe(false)

    expect(
      isPluginBridgeRequest({
        source: "oh-my-select-plugin",
        id: "1",
        pluginId: "quick-search",
        viewKind: "settings",
        method: "storage.clear",
        args: ["engine"],
      })
    ).toBe(false)
  })
})
