use serde::{Deserialize, Serialize};
use std::collections::BTreeMap;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum LanguagePreference {
    #[serde(rename = "system")]
    System,
    #[serde(rename = "zh-CN")]
    ZhCn,
    #[serde(rename = "en")]
    En,
}

impl Default for LanguagePreference {
    fn default() -> Self {
        Self::System
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct PluginConfigEntry {
    pub id: String,
    pub enabled: bool,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct AppConfig {
    #[serde(default)]
    pub language_preference: LanguagePreference,
    #[serde(default)]
    pub plugins: Vec<PluginConfigEntry>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PluginManifest {
    pub id: String,
    pub name: LocalizedText,
    pub version: String,
    pub matcher: String,
    pub popup: PopupManifest,
    #[serde(default)]
    pub settings: Option<SettingsManifest>,
    #[serde(default)]
    pub permissions: PluginPermissions,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, Default)]
pub struct LocalizedText {
    #[serde(rename = "zh-CN")]
    pub zh_cn: Option<String>,
    pub en: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct PopupManifest {
    pub entry: String,
    pub width: u32,
    pub height: u32,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct SettingsManifest {
    pub entry: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct PluginPermissions {
    #[serde(default)]
    pub open_external: bool,
    #[serde(default)]
    pub storage: bool,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct InstalledPlugin {
    pub id: String,
    pub manifest: PluginManifest,
    pub enabled: bool,
    pub has_settings: bool,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PluginViewContext {
    pub selected_text: Option<String>,
    pub locale: String,
    pub language_preference: LanguagePreference,
    pub plugin_id: String,
    pub plugin_version: String,
    pub app_version: String,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AppSettingsSnapshot {
    pub language_preference: LanguagePreference,
    pub locale: String,
    pub plugins: Vec<InstalledPlugin>,
    pub app_version: String,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PluginSettingsPayload {
    pub plugin: InstalledPlugin,
    pub entry_url: Option<String>,
    pub context: PluginViewContext,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PopupPayload {
    pub selection_id: String,
    pub plugin: InstalledPlugin,
    pub context: PluginViewContext,
    pub entry_url: String,
}

pub type PluginStorageMap = BTreeMap<String, serde_json::Value>;
