import { describe, expect, it } from "vitest"
import {
  assertPopupBridgeRequest,
  createPluginBridgeSession,
  getRequiredStringBridgeArg,
  isPluginBridgeRequest,
  recordPluginFrameLoad,
  resetPluginBridgeSession,
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

describe("plugin frame bridge session", () => {
  it("enables bridge for the first oms-plugin load", () => {
    const session = createPluginBridgeSession("oms-plugin://quick-search/popup")

    expect(session.bridgeEnabled).toBe(false)
    expect(recordPluginFrameLoad(session)).toEqual({
      bridgeEnabled: true,
      shouldResetFrame: false,
    })
    expect(session.bridgeEnabled).toBe(true)
  })

  it("disables bridge and requests reset after subsequent loads", () => {
    const session = createPluginBridgeSession("oms-plugin://quick-search/popup")

    recordPluginFrameLoad(session)

    expect(recordPluginFrameLoad(session)).toEqual({
      bridgeEnabled: false,
      shouldResetFrame: true,
    })
    expect(session.bridgeEnabled).toBe(false)
  })

  it("keeps bridge disabled for non-plugin entry URLs", () => {
    const session = createPluginBridgeSession("https://example.com/popup")

    expect(recordPluginFrameLoad(session)).toEqual({
      bridgeEnabled: false,
      shouldResetFrame: true,
    })
  })

  it("resets load tracking on prop-driven entry URL changes", () => {
    const session = createPluginBridgeSession("oms-plugin://old/popup")

    recordPluginFrameLoad(session)
    recordPluginFrameLoad(session)
    resetPluginBridgeSession(session, "oms-plugin://new/popup")

    expect(recordPluginFrameLoad(session)).toEqual({
      bridgeEnabled: true,
      shouldResetFrame: false,
    })
  })
})
