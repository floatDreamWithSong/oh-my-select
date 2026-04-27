import { describe, expect, it } from "vitest"
import {
  assertPopupBridgeRequest,
  getRequiredStringBridgeArg,
  isPluginBridgeRequest,
} from "./plugin-bridge"

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

describe("getRequiredStringBridgeArg", () => {
  it("returns string arguments", () => {
    expect(
      getRequiredStringBridgeArg(
        {
          source: "oh-my-select-plugin",
          id: "1",
          pluginId: "quick-search",
          viewKind: "popup",
          method: "storage.get",
          args: ["engine"],
        },
        0
      )
    ).toBe("engine")
  })

  it("rejects missing or non-string arguments", () => {
    expect(() =>
      getRequiredStringBridgeArg(
        {
          source: "oh-my-select-plugin",
          id: "1",
          pluginId: "quick-search",
          viewKind: "popup",
          method: "openExternal",
          args: [],
        },
        0
      )
    ).toThrow("Invalid bridge args for openExternal")

    expect(() =>
      getRequiredStringBridgeArg(
        {
          source: "oh-my-select-plugin",
          id: "1",
          pluginId: "quick-search",
          viewKind: "popup",
          method: "storage.remove",
          args: [undefined],
        },
        0
      )
    ).toThrow("Invalid bridge args for storage.remove")
  })
})

describe("assertPopupBridgeRequest", () => {
  it("rejects closePopup from settings views", () => {
    expect(() =>
      assertPopupBridgeRequest({
        source: "oh-my-select-plugin",
        id: "1",
        pluginId: "quick-search",
        viewKind: "settings",
        method: "closePopup",
        args: [],
      })
    ).toThrow("closePopup is only available from popup views")
  })
})
