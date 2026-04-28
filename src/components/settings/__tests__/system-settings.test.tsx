// @vitest-environment jsdom

import { createRequire } from "node:module"
import { cleanup, fireEvent, render, waitFor } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { SystemSettings } from "../system-settings"
import type { AppSettingsSnapshot } from "@/lib/tauri-api"
import {
  importBundledPlugins,
  importPluginFolder,
  listBundledPlugins,
  removePlugin,
  setLanguagePreference,
  setPluginEnabled,
  setPluginOrder,
} from "@/lib/tauri-api"

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

vi.mock("@/lib/tauri-api", () => ({
  importBundledPlugins: vi.fn(),
  importPluginFolder: vi.fn(),
  listBundledPlugins: vi.fn(),
  removePlugin: vi.fn(),
  setLanguagePreference: vi.fn(),
  setPluginEnabled: vi.fn(),
  setPluginOrder: vi.fn(),
}))

vi.mock("@tauri-apps/plugin-dialog", () => ({
  open: vi.fn(),
}))

const tauriApi = {
  importBundledPlugins: importBundledPlugins as ReturnType<typeof vi.fn>,
  importPluginFolder: importPluginFolder as ReturnType<typeof vi.fn>,
  listBundledPlugins: listBundledPlugins as ReturnType<typeof vi.fn>,
  removePlugin: removePlugin as ReturnType<typeof vi.fn>,
  setLanguagePreference: setLanguagePreference as ReturnType<typeof vi.fn>,
  setPluginEnabled: setPluginEnabled as ReturnType<typeof vi.fn>,
  setPluginOrder: setPluginOrder as ReturnType<typeof vi.fn>,
}

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
    {
      id: "notes",
      enabled: false,
      hasSettings: false,
      manifest: {
        id: "notes",
        name: { en: "Notes" },
        version: "0.2.0",
        matcher: "matcher.js",
        popup: { entry: "popup.html", width: 300, height: 160 },
        permissions: { openExternal: false, storage: true },
      },
    },
  ],
}

describe("SystemSettings", () => {
  beforeEach(() => {
    cleanup()
    vi.clearAllMocks()
  })

  it("renders failed async actions in an alert", async () => {
    tauriApi.setLanguagePreference.mockRejectedValueOnce(
      new Error("language failed")
    )

    const { findByRole, getByLabelText } = render(
      <SystemSettings snapshot={snapshot} onSnapshotChange={vi.fn()} />
    )

    fireEvent.change(getByLabelText("Language"), {
      target: { value: "zh-CN" },
    })

    expect((await findByRole("alert")).textContent).toContain("language failed")
  })

  it("prevents overlapping actions while a mutation is pending", async () => {
    tauriApi.setPluginEnabled.mockReturnValueOnce(new Promise(() => undefined))

    const { getAllByLabelText, getByLabelText, getByRole, getAllByText } =
      render(<SystemSettings snapshot={snapshot} onSnapshotChange={vi.fn()} />)

    fireEvent.click(getAllByText("Enabled")[1])

    await waitFor(() => {
      expect(
        (
          getByRole("button", {
            name: "Import Custom Plugin",
          }) as HTMLButtonElement
        ).disabled
      ).toBe(true)
      expect((getByLabelText("Language") as HTMLSelectElement).disabled).toBe(
        true
      )
      expect(
        getAllByLabelText("Move Down").every(
          (button) => (button as HTMLButtonElement).disabled
        )
      ).toBe(true)
    })
  })

  it("opens bundled plugin dialog and imports selected plugins", async () => {
    tauriApi.listBundledPlugins.mockResolvedValueOnce([
      {
        id: "json-previewer",
        manifest: {
          id: "json-previewer",
          name: { en: "JSON Previewer", "zh-CN": "JSON 预览" },
          version: "0.1.0",
          matcher: "matcher.js",
          popup: { entry: "popup.html", width: 360, height: 260 },
          permissions: { openExternal: false, storage: true },
        },
      },
      {
        id: "quick-search",
        manifest: snapshot.plugins[0]!.manifest,
      },
    ])
    tauriApi.importBundledPlugins.mockResolvedValueOnce({
      ...snapshot,
      plugins: [
        ...snapshot.plugins,
        {
          id: "json-previewer",
          enabled: true,
          hasSettings: false,
          manifest: {
            id: "json-previewer",
            name: { en: "JSON Previewer", "zh-CN": "JSON 预览" },
            version: "0.1.0",
            matcher: "matcher.js",
            popup: { entry: "popup.html", width: 360, height: 260 },
            permissions: { openExternal: false, storage: true },
          },
        },
      ],
    })
    const onSnapshotChange = vi.fn()

    const { findByRole, getByLabelText, getByRole } = render(
      <SystemSettings
        snapshot={snapshot}
        onSnapshotChange={onSnapshotChange}
      />
    )

    fireEvent.click(getByRole("button", { name: "Import Built-in Plugin" }))

    expect((await findByRole("dialog")).textContent).toContain("JSON Previewer")
    expect((getByLabelText("Quick Search") as HTMLInputElement).disabled).toBe(
      true
    )

    fireEvent.click(getByLabelText("JSON Previewer"))
    fireEvent.click(getByRole("button", { name: "Import Selected" }))

    await waitFor(() => {
      expect(tauriApi.importBundledPlugins).toHaveBeenCalledWith([
        "json-previewer",
      ])
      expect(onSnapshotChange).toHaveBeenCalled()
    })
  })
})
