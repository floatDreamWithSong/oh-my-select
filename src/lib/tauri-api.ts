import { invoke } from "@tauri-apps/api/core"

export type LanguagePreference = "system" | "zh-CN" | "en"

export type LocalizedText = {
  "zh-CN"?: string
  en?: string
}

export type InstalledPlugin = {
  id: string
  manifest: {
    id: string
    name: LocalizedText
    version: string
    matcher: string
    popup: {
      entry: string
      width: number
      height: number
    }
    settings?: {
      entry: string
    } | null
    permissions: {
      openExternal: boolean
      storage: boolean
    }
  }
  enabled: boolean
  hasSettings: boolean
}

export type AppSettingsSnapshot = {
  languagePreference: LanguagePreference
  locale: "zh-CN" | "en"
  plugins: Array<InstalledPlugin>
  appVersion: string
}

export function getSettingsSnapshot() {
  return invoke<AppSettingsSnapshot>("get_settings_snapshot")
}

export function setLanguagePreference(languagePreference: LanguagePreference) {
  return invoke<AppSettingsSnapshot>("set_language_preference", {
    languagePreference,
  })
}

export function importPluginFolder(path: string) {
  return invoke<AppSettingsSnapshot>("import_plugin_folder", { path })
}

export function setPluginEnabled(pluginId: string, enabled: boolean) {
  return invoke<AppSettingsSnapshot>("set_plugin_enabled", {
    pluginId,
    enabled,
  })
}

export function setPluginOrder(pluginIds: Array<string>) {
  return invoke<AppSettingsSnapshot>("set_plugin_order", { pluginIds })
}

export function removePlugin(pluginId: string) {
  return invoke<AppSettingsSnapshot>("remove_plugin", { pluginId })
}

export type PluginViewContext = {
  selectedText?: string | null
  locale: "zh-CN" | "en"
  languagePreference: LanguagePreference
  pluginId: string
  pluginVersion: string
  appVersion: string
}

export type PopupPayload = {
  selectionId: string
  plugin: InstalledPlugin
  context: PluginViewContext
  entryUrl: string
}

export type PluginSettingsPayload = {
  plugin: InstalledPlugin
  entryUrl?: string | null
  context: PluginViewContext
}

export function getPopupPayload(selectionId: string) {
  return invoke<PopupPayload>("get_popup_payload", { selectionId })
}

export function getPluginSettingsPayload(pluginId: string) {
  return invoke<PluginSettingsPayload>("get_plugin_settings_payload", {
    pluginId,
  })
}

export function getPluginViewHtml(entryUrl: string) {
  return invoke<string>("get_plugin_view_html", { entryUrl })
}

export function bridgeOpenExternal(pluginId: string, url: string) {
  return invoke<void>("bridge_open_external", { pluginId, url })
}

export function bridgeClosePopup() {
  return invoke<void>("bridge_close_popup")
}

export function pluginStorageGet(pluginId: string, key: string) {
  return invoke<unknown>("plugin_storage_get", { pluginId, key })
}

export function pluginStorageSet(pluginId: string, key: string, value: unknown) {
  return invoke<void>("plugin_storage_set", { pluginId, key, value })
}

export function pluginStorageRemove(pluginId: string, key: string) {
  return invoke<void>("plugin_storage_remove", { pluginId, key })
}
