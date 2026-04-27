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
