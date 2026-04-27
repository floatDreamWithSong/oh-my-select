// @vitest-environment jsdom

import { createRequire } from "node:module"
import { render } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"
import { SettingsShell } from "../settings-shell"
import type { AppSettingsSnapshot } from "@/lib/tauri-api"

if (typeof document === "undefined") {
  const require = createRequire(import.meta.url)
  const { JSDOM } = require("jsdom") as {
    JSDOM: new (html: string) => {
      window: Window & typeof globalThis
    }
  }
  const dom = new JSDOM("<!doctype html><html><body></body></html>")

  Object.defineProperties(globalThis, {
    window: { value: dom.window },
    document: { value: dom.window.document },
    HTMLElement: { value: dom.window.HTMLElement },
    Node: { value: dom.window.Node },
    navigator: { value: dom.window.navigator },
  })
}

vi.mock("@/components/settings/system-settings", () => ({
  SystemSettings: () => <div>System settings content</div>,
}))

vi.mock("@/components/settings/plugin-settings-host", () => ({
  PluginSettingsHost: ({ pluginId }: { pluginId: string }) => (
    <div>Plugin settings {pluginId}</div>
  ),
}))

const snapshot: AppSettingsSnapshot = {
  languagePreference: "en",
  locale: "en",
  appVersion: "0.1.0",
  plugins: [
    {
      id: "quick-search",
      enabled: true,
      hasSettings: true,
      manifest: {
        id: "quick-search",
        name: { en: "Quick Search", "zh-CN": "快速搜索" },
        version: "0.1.0",
        matcher: "matcher.js",
        popup: { entry: "popup.html", width: 320, height: 180 },
        settings: { entry: "settings.html" },
        permissions: { openExternal: true, storage: true },
      },
    },
  ],
}

describe("SettingsShell", () => {
  it("renders app identity, system route, and plugin routes", () => {
    const { getByText } = render(<SettingsShell initialSnapshot={snapshot} />)

    expect(getByText("oh-my-select")).toBeTruthy()
    expect(getByText("Version 0.1.0")).toBeTruthy()
    expect(getByText("System Settings")).toBeTruthy()
    expect(getByText("Quick Search")).toBeTruthy()
    expect(getByText("System settings content")).toBeTruthy()
  })
})
