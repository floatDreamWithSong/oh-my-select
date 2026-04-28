import { describe, expect, it } from "vitest"
import {
  appendPluginBridgeSession,
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
        bridgeSession: "session-1",
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
        bridgeSession: "session-1",
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
        bridgeSession: "session-1",
        method: "storage.clear",
        args: ["engine"],
      })
    ).toBe(false)
  })

  it("rejects requests without a bridge session", () => {
    expect(
      isPluginBridgeRequest({
        source: "oh-my-select-plugin",
        id: "1",
        pluginId: "quick-search",
        viewKind: "popup",
        method: "storage.get",
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
          bridgeSession: "session-1",
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
          bridgeSession: "session-1",
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
          bridgeSession: "session-1",
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
        bridgeSession: "session-1",
        method: "closePopup",
        args: [],
      })
    ).toThrow("closePopup is only available from popup views")
  })
})

describe("appendPluginBridgeSession", () => {
  it("adds the bridge session while preserving existing query params", () => {
    expect(
      appendPluginBridgeSession(
        "oms-plugin://localhost/quick-search/popup.html?viewKind=popup&selectionId=abc",
        "session-1"
      )
    ).toBe(
      "oms-plugin://localhost/quick-search/popup.html?viewKind=popup&selectionId=abc&bridgeSession=session-1"
    )
  })

  it("replaces stale bridge session params", () => {
    expect(
      appendPluginBridgeSession(
        "oms-plugin://localhost/quick-search/settings.html?bridgeSession=old",
        "session-2"
      )
    ).toBe(
      "oms-plugin://localhost/quick-search/settings.html?bridgeSession=session-2"
    )
  })

  it("throws for non-plugin URLs", () => {
    expect(() =>
      appendPluginBridgeSession("https://example.com/popup.html", "session-1")
    ).toThrow("Plugin iframe entry URL must use oms-plugin:")
  })
})
