export type Locale = "zh-CN" | "en"

const dictionaries = {
  "zh-CN": {
    appGroup: "应用",
    pluginGroup: "插件",
    systemSettings: "系统设置",
    language: "语言",
    closeWindowBehavior: "关闭窗口时",
    quitApp: "退出应用",
    minimizeToTray: "最小化到托盘",
    followSystem: "跟随系统",
    chinese: "中文",
    english: "英文",
    importCustomPlugin: "导入自定义插件",
    importBundledPlugin: "导入内置插件",
    importBundledPluginDialogTitle: "导入内置插件",
    importSelected: "导入选中项",
    cancel: "取消",
    installed: "已安装",
    noBundledPlugins: "暂无内置插件",
    noPlugins: "暂无插件",
    enabled: "已启用",
    disabled: "已禁用",
    moveUp: "上移",
    moveDown: "下移",
    remove: "移除",
    version: "版本",
    pluginSettingsEmpty: "该插件暂未提供设置页面。",
  },
  en: {
    appGroup: "App",
    pluginGroup: "Plugins",
    systemSettings: "System Settings",
    language: "Language",
    closeWindowBehavior: "When closing window",
    quitApp: "Quit app",
    minimizeToTray: "Minimize to tray",
    followSystem: "Follow System",
    chinese: "Chinese",
    english: "English",
    importCustomPlugin: "Import Custom Plugin",
    importBundledPlugin: "Import Built-in Plugin",
    importBundledPluginDialogTitle: "Import Built-in Plugin",
    importSelected: "Import Selected",
    cancel: "Cancel",
    installed: "Installed",
    noBundledPlugins: "No built-in plugins available",
    noPlugins: "No plugins installed",
    enabled: "Enabled",
    disabled: "Disabled",
    moveUp: "Move Up",
    moveDown: "Move Down",
    remove: "Remove",
    version: "Version",
    pluginSettingsEmpty: "This plugin does not have settings yet.",
  },
} satisfies Record<Locale, Record<string, string>>

export type MessageKey = keyof (typeof dictionaries)["en"]

export function t(locale: Locale, key: MessageKey) {
  return dictionaries[locale][key]
}

export function localizedName(
  locale: Locale,
  name: { "zh-CN"?: string; en?: string }
) {
  return locale === "zh-CN"
    ? (name["zh-CN"] ?? name.en ?? "Unnamed Plugin")
    : (name.en ?? name["zh-CN"] ?? "Unnamed Plugin")
}
