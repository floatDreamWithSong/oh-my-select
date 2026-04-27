# Plugin Selection Popup Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the first local-trusted plugin version of oh-my-select: silent tray startup, global text selection detection, ordered plugin matching, plugin-owned popup views, and a sidebar-based settings window with plugin settings pages.

**Architecture:** Rust owns app state, plugin persistence, matcher execution, tray behavior, selection monitoring, dynamic popup window creation, and custom protocol serving for plugin files. React owns the settings shell, system settings UI, plugin iframe host, popup iframe host, and bridge message handling. Plugin code runs either in `rquickjs` for synchronous matchers or in sandboxed iframes for popup/settings views.

**Tech Stack:** Tauri v2, Rust 2021, React 19, TanStack Router, Tailwind CSS, Vitest, monio, selection, rquickjs, Tauri dialog and opener plugins.

---

## Scope Check

This plan implements one coherent MVP slice from the approved spec:

- App shell and tray behavior.
- Local folder plugin import and persistence.
- Synchronous matcher chain.
- Popup host and plugin view bridge.
- Settings shell with System Settings plus plugin settings routes.
- Global drag selection monitoring.

The plan does not implement zip import, marketplace security, async matchers, keyboard selection, double-click selection, or dynamic popup resizing.

## File Structure

### Rust Backend

- Modify `src-tauri/Cargo.toml`: add Tauri features and backend dependencies.
- Modify `src-tauri/tauri.conf.json`: keep startup silent and disable global Tauri injection.
- Modify `src-tauri/capabilities/default.json`: allow main and popup host windows to use needed app APIs.
- Modify `src-tauri/src/lib.rs`: compose plugins, commands, custom protocol, tray, state, and monitor startup.
- Create `src-tauri/src/models.rs`: shared serializable DTOs for manifests, config, commands, context, and view payloads.
- Create `src-tauri/src/app_state.rs`: top-level managed state and app data path setup.
- Create `src-tauri/src/settings_manager.rs`: config and per-plugin storage persistence.
- Create `src-tauri/src/plugin_registry.rs`: plugin manifest validation, import, remove, reorder, enable/disable, and listing.
- Create `src-tauri/src/plugin_engine.rs`: synchronous matcher execution using `rquickjs`.
- Create `src-tauri/src/popup_manager.rs`: popup context storage, dynamic popup creation, close behavior, and monitor-aware positioning helpers.
- Create `src-tauri/src/plugin_protocol.rs`: `oms-plugin://` protocol handler that serves copied plugin files and injects the view bridge bootstrap into HTML.
- Create `src-tauri/src/selection_monitor.rs`: monio listener and selection crate integration.
- Create `src-tauri/src/tray.rs`: tray icon creation and settings window show/focus logic.
- Create `src-tauri/src/commands.rs`: Tauri commands used by React and plugin bridge handlers.

### React Frontend

- Modify `package.json`: add Tauri dialog API dependency.
- Modify `src/routes/__root.tsx`: update app title and devtools gating.
- Modify `src/routes/index.tsx`: render the settings shell as the main route.
- Create `src/routes/plugin-popup.tsx`: render the popup host route used by dynamic popup windows.
- Create `src/lib/i18n.ts`: small host i18n dictionary for Chinese and English.
- Create `src/lib/tauri-api.ts`: typed wrappers around Tauri commands.
- Create `src/lib/plugin-bridge.ts`: postMessage bridge protocol types and helpers.
- Create `src/components/settings/settings-shell.tsx`: sidebar plus main layout.
- Create `src/components/settings/system-settings.tsx`: language and plugin management UI.
- Create `src/components/settings/plugin-settings-host.tsx`: plugin settings iframe host.
- Create `src/components/plugin/plugin-frame.tsx`: shared iframe host for plugin popup/settings pages.
- Create `src/components/plugin/popup-host.tsx`: popup route UI and bridge behavior.
- Create `src/test/test-utils.tsx`: test render helper.
- Create frontend tests under `src/components/**/__tests__/`.

### Examples

- Create `examples/plugins/quick-search/manifest.json`.
- Create `examples/plugins/quick-search/matcher.js`.
- Create `examples/plugins/quick-search/popup.html`.
- Create `examples/plugins/quick-search/settings.html`.

## Task 1: Dependencies And App Shell Configuration

**Files:**

- Modify: `src-tauri/Cargo.toml`
- Modify: `src-tauri/tauri.conf.json`
- Modify: `src-tauri/capabilities/default.json`
- Modify: `package.json`

- [ ] **Step 1: Add Rust dependencies and Tauri features**

Change `src-tauri/Cargo.toml` dependencies to this shape:

```toml
[dependencies]
tauri = { version = "2", features = ["tray-icon", "image-png"] }
tauri-plugin-opener = "2"
tauri-plugin-dialog = "2"
serde = { version = "1", features = ["derive"] }
serde_json = "1"
monio = "0.1.1"
selection = "1.2"
rquickjs = "0.10"
url = "2"
urlencoding = "2.1"
mime_guess = "2"
thiserror = "2"
```

- [ ] **Step 2: Add the frontend dialog package**

Run:

```bash
bun add @tauri-apps/plugin-dialog@^2
```

Expected: `package.json` contains `@tauri-apps/plugin-dialog` in `dependencies`, and `bun.lock` updates.

- [ ] **Step 3: Keep the app silent at startup and remove global Tauri injection**

In `src-tauri/tauri.conf.json`, keep the only static window hidden and set `withGlobalTauri` to `false`:

```json
{
  "$schema": "https://schema.tauri.app/config/2",
  "productName": "oh-my-select",
  "version": "0.1.0",
  "identifier": "com.hanjiedeng.oh-my-select",
  "build": {
    "beforeDevCommand": "bun run dev",
    "devUrl": "http://localhost:1420",
    "beforeBuildCommand": "bun run build",
    "frontendDist": "../.output/public",
    "removeUnusedCommands": true
  },
  "app": {
    "withGlobalTauri": false,
    "windows": [
      {
        "label": "main",
        "title": "oh-my-select",
        "width": 1120,
        "height": 760,
        "center": true,
        "visible": false
      }
    ],
    "security": {
      "csp": null
    }
  },
  "bundle": {
    "active": true,
    "targets": "all",
    "icon": [
      "icons/32x32.png",
      "icons/128x128.png",
      "icons/128x128@2x.png",
      "icons/icon.icns",
      "icons/icon.ico"
    ]
  }
}
```

- [ ] **Step 4: Update capabilities for settings and popup host windows**

Replace `src-tauri/capabilities/default.json` with:

```json
{
  "$schema": "../gen/schemas/desktop-schema.json",
  "identifier": "default",
  "description": "Capability for the settings and popup host windows",
  "windows": ["main", "selection-popup"],
  "permissions": [
    "core:default",
    "opener:default",
    "dialog:allow-open"
  ]
}
```

- [ ] **Step 5: Verify dependency resolution**

Run:

```bash
bun install
cargo check --manifest-path src-tauri/Cargo.toml
```

Expected: Rust dependencies resolve. The app may still compile existing code only; feature code is added in later tasks.

- [ ] **Step 6: Commit**

```bash
git add package.json bun.lock src-tauri/Cargo.toml src-tauri/Cargo.lock src-tauri/tauri.conf.json src-tauri/capabilities/default.json
git commit -m "chore: configure tauri plugin popup dependencies"
```

## Task 2: Shared Models And Settings Persistence

**Files:**

- Create: `src-tauri/src/models.rs`
- Create: `src-tauri/src/settings_manager.rs`
- Modify: `src-tauri/src/lib.rs`

- [ ] **Step 1: Write settings persistence tests**

Create `src-tauri/src/settings_manager.rs` with tests first:

```rust
#[cfg(test)]
mod tests {
    use super::*;
    use crate::models::{AppConfig, LanguagePreference, PluginConfigEntry};
    use std::fs;

    fn temp_dir(name: &str) -> std::path::PathBuf {
        let path = std::env::temp_dir().join(format!(
            "oh-my-select-settings-test-{}-{}",
            name,
            std::process::id()
        ));
        let _ = fs::remove_dir_all(&path);
        fs::create_dir_all(&path).unwrap();
        path
    }

    #[test]
    fn reads_default_config_when_file_is_missing() {
        let manager = SettingsManager::new(temp_dir("default"));
        let config = manager.load_config().unwrap();

        assert_eq!(config.language_preference, LanguagePreference::System);
        assert!(config.plugins.is_empty());
    }

    #[test]
    fn writes_and_reads_config() {
        let manager = SettingsManager::new(temp_dir("roundtrip"));
        let config = AppConfig {
            language_preference: LanguagePreference::En,
            plugins: vec![PluginConfigEntry {
                id: "quick-search".to_string(),
                enabled: true,
            }],
        };

        manager.save_config(&config).unwrap();
        let loaded = manager.load_config().unwrap();

        assert_eq!(loaded, config);
    }

    #[test]
    fn stores_values_per_plugin() {
        let manager = SettingsManager::new(temp_dir("storage"));

        manager
            .storage_set("quick-search", "engine", serde_json::json!("google"))
            .unwrap();

        assert_eq!(
            manager.storage_get("quick-search", "engine").unwrap(),
            Some(serde_json::json!("google"))
        );

        manager.storage_remove("quick-search", "engine").unwrap();
        assert_eq!(manager.storage_get("quick-search", "engine").unwrap(), None);
    }
}
```

- [ ] **Step 2: Run tests and verify they fail because types are missing**

Run:

```bash
cargo test --manifest-path src-tauri/Cargo.toml settings_manager
```

Expected: FAIL with unresolved imports for `crate::models`, `SettingsManager`, and related types.

- [ ] **Step 3: Add shared serializable models**

Create `src-tauri/src/models.rs`:

```rust
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

pub type PluginStorageMap = BTreeMap<String, serde_json::Value>;
```

- [ ] **Step 4: Implement settings persistence**

Replace the non-test part of `src-tauri/src/settings_manager.rs` with:

```rust
use crate::models::{AppConfig, PluginStorageMap};
use serde_json::Value;
use std::fs;
use std::io;
use std::path::PathBuf;
use thiserror::Error;

#[derive(Debug, Error)]
pub enum SettingsError {
    #[error("failed to access settings file: {0}")]
    Io(#[from] io::Error),
    #[error("failed to parse settings json: {0}")]
    Json(#[from] serde_json::Error),
}

#[derive(Debug, Clone)]
pub struct SettingsManager {
    root_dir: PathBuf,
}

impl SettingsManager {
    pub fn new(root_dir: PathBuf) -> Self {
        Self { root_dir }
    }

    pub fn root_dir(&self) -> &PathBuf {
        &self.root_dir
    }

    pub fn plugins_dir(&self) -> PathBuf {
        self.root_dir.join("plugins")
    }

    pub fn plugin_storage_dir(&self) -> PathBuf {
        self.root_dir.join("plugin-storage")
    }

    pub fn ensure_dirs(&self) -> Result<(), SettingsError> {
        fs::create_dir_all(self.plugins_dir())?;
        fs::create_dir_all(self.plugin_storage_dir())?;
        Ok(())
    }

    pub fn load_config(&self) -> Result<AppConfig, SettingsError> {
        let path = self.root_dir.join("config.json");
        if !path.exists() {
            return Ok(AppConfig::default());
        }

        let content = fs::read_to_string(path)?;
        Ok(serde_json::from_str(&content)?)
    }

    pub fn save_config(&self, config: &AppConfig) -> Result<(), SettingsError> {
        self.ensure_dirs()?;
        let path = self.root_dir.join("config.json");
        let content = serde_json::to_string_pretty(config)?;
        fs::write(path, content)?;
        Ok(())
    }

    pub fn storage_get(
        &self,
        plugin_id: &str,
        key: &str,
    ) -> Result<Option<Value>, SettingsError> {
        let map = self.read_storage(plugin_id)?;
        Ok(map.get(key).cloned())
    }

    pub fn storage_set(
        &self,
        plugin_id: &str,
        key: &str,
        value: Value,
    ) -> Result<(), SettingsError> {
        let mut map = self.read_storage(plugin_id)?;
        map.insert(key.to_string(), value);
        self.write_storage(plugin_id, &map)
    }

    pub fn storage_remove(&self, plugin_id: &str, key: &str) -> Result<(), SettingsError> {
        let mut map = self.read_storage(plugin_id)?;
        map.remove(key);
        self.write_storage(plugin_id, &map)
    }

    fn storage_path(&self, plugin_id: &str) -> PathBuf {
        self.plugin_storage_dir().join(format!("{plugin_id}.json"))
    }

    fn read_storage(&self, plugin_id: &str) -> Result<PluginStorageMap, SettingsError> {
        let path = self.storage_path(plugin_id);
        if !path.exists() {
            return Ok(PluginStorageMap::default());
        }

        let content = fs::read_to_string(path)?;
        Ok(serde_json::from_str(&content)?)
    }

    fn write_storage(
        &self,
        plugin_id: &str,
        map: &PluginStorageMap,
    ) -> Result<(), SettingsError> {
        self.ensure_dirs()?;
        let path = self.storage_path(plugin_id);
        fs::write(path, serde_json::to_string_pretty(map)?)?;
        Ok(())
    }
}
```

Keep the test module from Step 1 at the bottom of the file.

- [ ] **Step 5: Export models and settings modules in `lib.rs`**

At the top of `src-tauri/src/lib.rs`, add only the modules created so far:

```rust
mod models;
mod settings_manager;
```

- [ ] **Step 6: Run tests**

Run:

```bash
cargo test --manifest-path src-tauri/Cargo.toml settings_manager
```

Expected: PASS for all settings manager tests.

- [ ] **Step 7: Commit**

```bash
git add src-tauri/src/models.rs src-tauri/src/settings_manager.rs src-tauri/src/lib.rs
git commit -m "feat: add app settings persistence"
```

## Task 3: Plugin Registry Import, Validation, And Ordering

**Files:**

- Create: `src-tauri/src/plugin_registry.rs`
- Modify: `src-tauri/src/models.rs`
- Test: `src-tauri/src/plugin_registry.rs`

- [ ] **Step 1: Write plugin registry tests**

Create `src-tauri/src/plugin_registry.rs` with tests first:

```rust
#[cfg(test)]
mod tests {
    use super::*;
    use crate::models::LanguagePreference;
    use crate::settings_manager::SettingsManager;
    use std::fs;
    use std::path::{Path, PathBuf};

    fn temp_dir(name: &str) -> PathBuf {
        let path = std::env::temp_dir().join(format!(
            "oh-my-select-registry-test-{}-{}",
            name,
            std::process::id()
        ));
        let _ = fs::remove_dir_all(&path);
        fs::create_dir_all(&path).unwrap();
        path
    }

    fn write_plugin(root: &Path, id: &str, with_settings: bool) -> PathBuf {
        let dir = root.join(id);
        fs::create_dir_all(&dir).unwrap();
        fs::write(
            dir.join("manifest.json"),
            format!(
                r#"{{
                  "id": "{id}",
                  "name": {{ "zh-CN": "{id}", "en": "{id}" }},
                  "version": "0.1.0",
                  "matcher": "matcher.js",
                  "popup": {{ "entry": "popup.html", "width": 320, "height": 180 }},
                  "settings": {settings},
                  "permissions": {{ "openExternal": true, "storage": true }}
                }}"#,
                settings = if with_settings {
                    r#"{ "entry": "settings.html" }"#
                } else {
                    "null"
                }
            ),
        )
        .unwrap();
        fs::write(dir.join("matcher.js"), "export function match() { return true }").unwrap();
        fs::write(dir.join("popup.html"), "<main>popup</main>").unwrap();
        if with_settings {
            fs::write(dir.join("settings.html"), "<main>settings</main>").unwrap();
        }
        dir
    }

    #[test]
    fn imports_valid_plugin_folder() {
        let source_root = temp_dir("source");
        let app_root = temp_dir("app");
        let source = write_plugin(&source_root, "quick-search", true);
        let manager = SettingsManager::new(app_root);
        let registry = PluginRegistry::new(manager);

        let plugin = registry.import_folder(&source).unwrap();

        assert_eq!(plugin.id, "quick-search");
        assert!(plugin.enabled);
        assert!(plugin.has_settings);
        assert!(registry.plugin_dir("quick-search").join("popup.html").exists());
    }

    #[test]
    fn rejects_duplicate_plugin_id() {
        let source_root = temp_dir("dup-source");
        let app_root = temp_dir("dup-app");
        let first = write_plugin(&source_root, "quick-search", false);
        let second = write_plugin(&source_root, "quick-search-copy", false);
        fs::write(
            second.join("manifest.json"),
            fs::read_to_string(first.join("manifest.json")).unwrap(),
        )
        .unwrap();
        let registry = PluginRegistry::new(SettingsManager::new(app_root));

        registry.import_folder(&first).unwrap();
        let error = registry.import_folder(&second).unwrap_err();

        assert!(matches!(error, PluginRegistryError::DuplicateId(id) if id == "quick-search"));
    }

    #[test]
    fn rejects_manifest_with_invalid_popup_size() {
        let source_root = temp_dir("bad-size-source");
        let app_root = temp_dir("bad-size-app");
        let source = write_plugin(&source_root, "bad-size", false);
        let manifest = fs::read_to_string(source.join("manifest.json"))
            .unwrap()
            .replace("\"width\": 320", "\"width\": 50");
        fs::write(source.join("manifest.json"), manifest).unwrap();
        let registry = PluginRegistry::new(SettingsManager::new(app_root));

        let error = registry.import_folder(&source).unwrap_err();

        assert!(matches!(error, PluginRegistryError::InvalidPopupSize));
    }

    #[test]
    fn lists_plugins_in_config_order() {
        let source_root = temp_dir("order-source");
        let app_root = temp_dir("order-app");
        let first = write_plugin(&source_root, "first", false);
        let second = write_plugin(&source_root, "second", false);
        let registry = PluginRegistry::new(SettingsManager::new(app_root));

        registry.import_folder(&first).unwrap();
        registry.import_folder(&second).unwrap();
        registry.set_plugin_order(vec!["second".to_string(), "first".to_string()]).unwrap();
        registry.set_enabled("first", false).unwrap();

        let plugins = registry.list_plugins().unwrap();

        assert_eq!(plugins[0].id, "second");
        assert_eq!(plugins[1].id, "first");
        assert!(!plugins[1].enabled);
        assert_eq!(registry.resolve_locale(LanguagePreference::En), "en");
    }
}
```

- [ ] **Step 2: Run tests and verify they fail because registry is missing**

Run:

```bash
cargo test --manifest-path src-tauri/Cargo.toml plugin_registry
```

Expected: FAIL with missing `PluginRegistry` and `PluginRegistryError`.

- [ ] **Step 3: Implement registry error type and validation helpers**

Add the non-test implementation to `src-tauri/src/plugin_registry.rs`:

```rust
use crate::models::{
    AppConfig, InstalledPlugin, LanguagePreference, PluginConfigEntry, PluginManifest,
};
use crate::settings_manager::{SettingsError, SettingsManager};
use std::collections::HashSet;
use std::fs;
use std::io;
use std::path::{Component, Path, PathBuf};
use thiserror::Error;

#[derive(Debug, Error)]
pub enum PluginRegistryError {
    #[error("failed to access plugin files: {0}")]
    Io(#[from] io::Error),
    #[error("failed to parse plugin manifest: {0}")]
    Json(#[from] serde_json::Error),
    #[error("settings error: {0}")]
    Settings(#[from] SettingsError),
    #[error("plugin manifest is missing {0}")]
    MissingFile(String),
    #[error("plugin id already exists: {0}")]
    DuplicateId(String),
    #[error("plugin id is invalid")]
    InvalidId,
    #[error("plugin path is invalid: {0}")]
    InvalidRelativePath(String),
    #[error("popup size must be between 120x80 and 800x600")]
    InvalidPopupSize,
    #[error("plugin does not exist: {0}")]
    MissingPlugin(String),
}

#[derive(Clone)]
pub struct PluginRegistry {
    settings: SettingsManager,
}

impl PluginRegistry {
    pub fn new(settings: SettingsManager) -> Self {
        Self { settings }
    }

    pub fn plugin_dir(&self, id: &str) -> PathBuf {
        self.settings.plugins_dir().join(id)
    }

    pub fn resolve_locale(&self, preference: LanguagePreference) -> String {
        match preference {
            LanguagePreference::ZhCn => "zh-CN".to_string(),
            LanguagePreference::En => "en".to_string(),
            LanguagePreference::System => {
                let lang = std::env::var("LANG").unwrap_or_default().to_lowercase();
                if lang.starts_with("zh") {
                    "zh-CN".to_string()
                } else {
                    "en".to_string()
                }
            }
        }
    }

    pub fn import_folder(&self, source: &Path) -> Result<InstalledPlugin, PluginRegistryError> {
        self.settings.ensure_dirs()?;
        let manifest = self.read_manifest(source)?;
        self.validate_manifest(source, &manifest)?;

        if self.plugin_dir(&manifest.id).exists() {
            return Err(PluginRegistryError::DuplicateId(manifest.id));
        }

        copy_dir_all(source, &self.plugin_dir(&manifest.id))?;

        let mut config = self.settings.load_config()?;
        config.plugins.push(PluginConfigEntry {
            id: manifest.id.clone(),
            enabled: true,
        });
        self.settings.save_config(&config)?;

        self.installed_plugin_from_manifest(manifest, true)
    }

    pub fn list_plugins(&self) -> Result<Vec<InstalledPlugin>, PluginRegistryError> {
        let config = self.settings.load_config()?;
        let mut plugins = Vec::new();

        for entry in config.plugins {
            let dir = self.plugin_dir(&entry.id);
            let manifest = self.read_manifest(&dir)?;
            plugins.push(self.installed_plugin_from_manifest(manifest, entry.enabled)?);
        }

        Ok(plugins)
    }

    pub fn set_enabled(&self, id: &str, enabled: bool) -> Result<(), PluginRegistryError> {
        let mut config = self.settings.load_config()?;
        let entry = config
            .plugins
            .iter_mut()
            .find(|entry| entry.id == id)
            .ok_or_else(|| PluginRegistryError::MissingPlugin(id.to_string()))?;
        entry.enabled = enabled;
        self.settings.save_config(&config)?;
        Ok(())
    }

    pub fn set_plugin_order(&self, ids: Vec<String>) -> Result<(), PluginRegistryError> {
        let mut config = self.settings.load_config()?;
        let existing: HashSet<String> = config.plugins.iter().map(|entry| entry.id.clone()).collect();
        let incoming: HashSet<String> = ids.iter().cloned().collect();
        if existing != incoming {
            return Err(PluginRegistryError::MissingPlugin("order mismatch".to_string()));
        }

        let mut reordered = Vec::new();
        for id in ids {
            let enabled = config
                .plugins
                .iter()
                .find(|entry| entry.id == id)
                .map(|entry| entry.enabled)
                .unwrap_or(true);
            reordered.push(PluginConfigEntry { id, enabled });
        }
        config.plugins = reordered;
        self.settings.save_config(&config)?;
        Ok(())
    }

    pub fn remove_plugin(&self, id: &str) -> Result<(), PluginRegistryError> {
        let mut config = self.settings.load_config()?;
        let before = config.plugins.len();
        config.plugins.retain(|entry| entry.id != id);
        if before == config.plugins.len() {
            return Err(PluginRegistryError::MissingPlugin(id.to_string()));
        }

        let dir = self.plugin_dir(id);
        if dir.exists() {
            fs::remove_dir_all(dir)?;
        }
        self.settings.save_config(&config)?;
        Ok(())
    }

    pub fn read_manifest(&self, plugin_dir: &Path) -> Result<PluginManifest, PluginRegistryError> {
        let content = fs::read_to_string(plugin_dir.join("manifest.json"))?;
        Ok(serde_json::from_str(&content)?)
    }

    pub fn validate_manifest(
        &self,
        plugin_dir: &Path,
        manifest: &PluginManifest,
    ) -> Result<(), PluginRegistryError> {
        validate_id(&manifest.id)?;
        validate_relative_path(&manifest.matcher)?;
        validate_relative_path(&manifest.popup.entry)?;
        if let Some(settings) = &manifest.settings {
            validate_relative_path(&settings.entry)?;
        }
        if manifest.popup.width < 120
            || manifest.popup.height < 80
            || manifest.popup.width > 800
            || manifest.popup.height > 600
        {
            return Err(PluginRegistryError::InvalidPopupSize);
        }

        for path in ["manifest.json", &manifest.matcher, &manifest.popup.entry] {
            if !plugin_dir.join(path).exists() {
                return Err(PluginRegistryError::MissingFile(path.to_string()));
            }
        }

        if let Some(settings) = &manifest.settings {
            if !plugin_dir.join(&settings.entry).exists() {
                return Err(PluginRegistryError::MissingFile(settings.entry.clone()));
            }
        }

        Ok(())
    }

    fn installed_plugin_from_manifest(
        &self,
        manifest: PluginManifest,
        enabled: bool,
    ) -> Result<InstalledPlugin, PluginRegistryError> {
        let has_settings = manifest
            .settings
            .as_ref()
            .map(|settings| self.plugin_dir(&manifest.id).join(&settings.entry).exists())
            .unwrap_or(false);
        Ok(InstalledPlugin {
            id: manifest.id.clone(),
            manifest,
            enabled,
            has_settings,
        })
    }
}

fn validate_id(id: &str) -> Result<(), PluginRegistryError> {
    let valid = !id.is_empty()
        && id
            .chars()
            .all(|ch| ch.is_ascii_lowercase() || ch.is_ascii_digit() || ch == '-');
    if valid {
        Ok(())
    } else {
        Err(PluginRegistryError::InvalidId)
    }
}

fn validate_relative_path(path: &str) -> Result<(), PluginRegistryError> {
    let path_buf = PathBuf::from(path);
    let valid = !path_buf.is_absolute()
        && path_buf.components().all(|component| {
            matches!(component, Component::Normal(_))
        });
    if valid {
        Ok(())
    } else {
        Err(PluginRegistryError::InvalidRelativePath(path.to_string()))
    }
}

fn copy_dir_all(source: &Path, target: &Path) -> io::Result<()> {
    fs::create_dir_all(target)?;
    for entry in fs::read_dir(source)? {
        let entry = entry?;
        let ty = entry.file_type()?;
        let target_path = target.join(entry.file_name());
        if ty.is_dir() {
            copy_dir_all(&entry.path(), &target_path)?;
        } else if ty.is_file() {
            fs::copy(entry.path(), target_path)?;
        }
    }
    Ok(())
}
```

Keep the tests from Step 1 at the bottom.

- [ ] **Step 4: Export plugin registry module in `lib.rs`**

Add this declaration near the existing module declarations:

```rust
mod plugin_registry;
```

- [ ] **Step 5: Run plugin registry tests**

Run:

```bash
cargo test --manifest-path src-tauri/Cargo.toml plugin_registry
```

Expected: PASS for import, duplicate rejection, popup size validation, and ordering tests.

- [ ] **Step 6: Commit**

```bash
git add src-tauri/src/plugin_registry.rs src-tauri/src/models.rs src-tauri/src/lib.rs
git commit -m "feat: add plugin registry"
```

## Task 4: Synchronous JavaScript Matcher Engine

**Files:**

- Create: `src-tauri/src/plugin_engine.rs`
- Test: `src-tauri/src/plugin_engine.rs`

- [ ] **Step 1: Write matcher engine tests**

Create `src-tauri/src/plugin_engine.rs` with tests first:

```rust
#[cfg(test)]
mod tests {
    use super::*;
    use crate::models::{
        InstalledPlugin, LocalizedText, PluginManifest, PluginPermissions, PopupManifest,
    };
    use std::fs;
    use std::path::{Path, PathBuf};

    fn temp_dir(name: &str) -> PathBuf {
        let path = std::env::temp_dir().join(format!(
            "oh-my-select-engine-test-{}-{}",
            name,
            std::process::id()
        ));
        let _ = fs::remove_dir_all(&path);
        fs::create_dir_all(&path).unwrap();
        path
    }

    fn plugin(root: &Path, id: &str, matcher_source: &str, enabled: bool) -> InstalledPlugin {
        let dir = root.join(id);
        fs::create_dir_all(&dir).unwrap();
        fs::write(dir.join("matcher.js"), matcher_source).unwrap();
        InstalledPlugin {
            id: id.to_string(),
            enabled,
            has_settings: false,
            manifest: PluginManifest {
                id: id.to_string(),
                name: LocalizedText {
                    zh_cn: Some(id.to_string()),
                    en: Some(id.to_string()),
                },
                version: "0.1.0".to_string(),
                matcher: "matcher.js".to_string(),
                popup: PopupManifest {
                    entry: "popup.html".to_string(),
                    width: 320,
                    height: 180,
                },
                settings: None,
                permissions: PluginPermissions::default(),
            },
        }
    }

    #[test]
    fn returns_first_enabled_matching_plugin() {
        let root = temp_dir("first-match");
        let plugins = vec![
            plugin(&root, "first", "export function match() { return false }", true),
            plugin(
                &root,
                "second",
                "export function match(context) { return context.selectedText === 'hello' }",
                true,
            ),
            plugin(&root, "third", "export function match() { return true }", true),
        ];
        let engine = PluginEngine::new(root);

        let matched = engine.match_first(&plugins, "hello", "en").unwrap().unwrap();

        assert_eq!(matched.plugin.id, "second");
    }

    #[test]
    fn skips_disabled_plugins() {
        let root = temp_dir("disabled");
        let plugins = vec![
            plugin(&root, "disabled", "export function match() { return true }", false),
            plugin(&root, "enabled", "export function match() { return true }", true),
        ];
        let engine = PluginEngine::new(root);

        let matched = engine.match_first(&plugins, "hello", "en").unwrap().unwrap();

        assert_eq!(matched.plugin.id, "enabled");
    }

    #[test]
    fn continues_after_matcher_error() {
        let root = temp_dir("error");
        let plugins = vec![
            plugin(&root, "broken", "export function match() { throw new Error('bad') }", true),
            plugin(&root, "working", "export function match() { return true }", true),
        ];
        let engine = PluginEngine::new(root);

        let matched = engine.match_first(&plugins, "hello", "en").unwrap().unwrap();

        assert_eq!(matched.plugin.id, "working");
    }

    #[test]
    fn returns_none_when_no_plugin_matches() {
        let root = temp_dir("none");
        let plugins = vec![plugin(&root, "first", "export function match() { return false }", true)];
        let engine = PluginEngine::new(root);

        let matched = engine.match_first(&plugins, "hello", "en").unwrap();

        assert!(matched.is_none());
    }
}
```

- [ ] **Step 2: Run tests and verify they fail because engine is missing**

Run:

```bash
cargo test --manifest-path src-tauri/Cargo.toml plugin_engine
```

Expected: FAIL with missing `PluginEngine` and `MatchedPlugin`.

- [ ] **Step 3: Implement matcher execution with rquickjs**

Add the implementation above the tests:

```rust
use crate::models::{InstalledPlugin, PluginViewContext};
use rquickjs::{Context, Runtime};
use serde_json::json;
use std::fs;
use std::path::PathBuf;
use thiserror::Error;

#[derive(Debug, Error)]
pub enum PluginEngineError {
    #[error("failed to read matcher file: {0}")]
    Io(#[from] std::io::Error),
    #[error("failed to serialize matcher context: {0}")]
    Json(#[from] serde_json::Error),
}

#[derive(Debug, Clone)]
pub struct MatchedPlugin {
    pub plugin: InstalledPlugin,
    pub selected_text: String,
    pub locale: String,
}

#[derive(Clone)]
pub struct PluginEngine {
    plugins_root: PathBuf,
}

impl PluginEngine {
    pub fn new(plugins_root: PathBuf) -> Self {
        Self { plugins_root }
    }

    pub fn match_first(
        &self,
        plugins: &[InstalledPlugin],
        selected_text: &str,
        locale: &str,
    ) -> Result<Option<MatchedPlugin>, PluginEngineError> {
        for plugin in plugins.iter().filter(|plugin| plugin.enabled) {
            match self.match_plugin(plugin, selected_text, locale) {
                Ok(true) => {
                    return Ok(Some(MatchedPlugin {
                        plugin: plugin.clone(),
                        selected_text: selected_text.to_string(),
                        locale: locale.to_string(),
                    }));
                }
                Ok(false) => {}
                Err(error) => {
                    eprintln!("Plugin matcher failed for {}: {error}", plugin.id);
                }
            }
        }

        Ok(None)
    }

    fn match_plugin(
        &self,
        plugin: &InstalledPlugin,
        selected_text: &str,
        locale: &str,
    ) -> Result<bool, PluginEngineError> {
        let matcher_path = self
            .plugins_root
            .join(&plugin.id)
            .join(&plugin.manifest.matcher);
        let source = fs::read_to_string(matcher_path)?;
        let normalized = normalize_matcher_source(&source);
        let context_json = serde_json::to_string(&json!({
            "selectedText": selected_text,
            "locale": locale,
            "pluginId": plugin.id,
            "pluginVersion": plugin.manifest.version,
        }))?;
        Ok(evaluate_matcher(&normalized, &context_json).unwrap_or(false))
    }
}

pub fn build_view_context(
    plugin: &InstalledPlugin,
    selected_text: Option<String>,
    locale: String,
    language_preference: crate::models::LanguagePreference,
    app_version: String,
) -> PluginViewContext {
    PluginViewContext {
        selected_text,
        locale,
        language_preference,
        plugin_id: plugin.id.clone(),
        plugin_version: plugin.manifest.version.clone(),
        app_version,
    }
}

fn normalize_matcher_source(source: &str) -> String {
    source
        .replace("export function match", "function match")
        .replace("export const match =", "const match =")
}

fn evaluate_matcher(source: &str, context_json: &str) -> Result<bool, rquickjs::Error> {
    let runtime = Runtime::new()?;
    runtime.set_memory_limit(8 * 1024 * 1024);
    runtime.set_max_stack_size(256 * 1024);
    let context = Context::full(&runtime)?;

    context.with(|ctx| {
        let script = format!(
            r#"
            {source}
            if (typeof match !== "function") {{
              throw new Error("matcher must export function match(context)");
            }}
            const __context = JSON.parse({context_json:?});
            Boolean(match(__context));
            "#
        );
        ctx.eval::<bool, _>(script)
    })
}
```

- [ ] **Step 4: Export plugin engine module in `lib.rs`**

Add this declaration near the existing module declarations:

```rust
mod plugin_engine;
```

- [ ] **Step 5: Run matcher engine tests**

Run:

```bash
cargo test --manifest-path src-tauri/Cargo.toml plugin_engine
```

Expected: PASS for all matcher engine tests.

- [ ] **Step 6: Commit**

```bash
git add src-tauri/src/plugin_engine.rs src-tauri/src/lib.rs
git commit -m "feat: add plugin matcher engine"
```

## Task 5: Popup Runtime State, Positioning, And Window Creation

**Files:**

- Create: `src-tauri/src/popup_manager.rs`
- Create: `src-tauri/src/app_state.rs`
- Modify: `src-tauri/src/lib.rs`
- Test: `src-tauri/src/popup_manager.rs`

- [ ] **Step 1: Write popup positioning tests**

Create `src-tauri/src/popup_manager.rs` with tests first:

```rust
#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn positions_popup_below_and_right_when_space_exists() {
        let monitor = MonitorBounds {
            x: 0.0,
            y: 0.0,
            width: 1440.0,
            height: 900.0,
        };

        let pos = clamp_popup_position(100.0, 120.0, 320.0, 180.0, &monitor);

        assert_eq!(pos, PopupPosition { x: 110.0, y: 130.0 });
    }

    #[test]
    fn flips_left_near_right_edge() {
        let monitor = MonitorBounds {
            x: 0.0,
            y: 0.0,
            width: 1440.0,
            height: 900.0,
        };

        let pos = clamp_popup_position(1400.0, 120.0, 320.0, 180.0, &monitor);

        assert_eq!(pos, PopupPosition { x: 1070.0, y: 130.0 });
    }

    #[test]
    fn flips_up_near_bottom_edge() {
        let monitor = MonitorBounds {
            x: 0.0,
            y: 0.0,
            width: 1440.0,
            height: 900.0,
        };

        let pos = clamp_popup_position(100.0, 880.0, 320.0, 180.0, &monitor);

        assert_eq!(pos, PopupPosition { x: 110.0, y: 690.0 });
    }

    #[test]
    fn clamps_on_negative_monitor_coordinates() {
        let monitor = MonitorBounds {
            x: -1280.0,
            y: -720.0,
            width: 1280.0,
            height: 720.0,
        };

        let pos = clamp_popup_position(-1278.0, -718.0, 320.0, 180.0, &monitor);

        assert_eq!(pos, PopupPosition { x: -1270.0, y: -710.0 });
    }
}
```

- [ ] **Step 2: Run tests and verify they fail because helpers are missing**

Run:

```bash
cargo test --manifest-path src-tauri/Cargo.toml popup_manager
```

Expected: FAIL with missing `MonitorBounds`, `PopupPosition`, and `clamp_popup_position`.

- [ ] **Step 3: Implement popup runtime state and geometry helpers**

Add this implementation above the tests:

```rust
use crate::models::{InstalledPlugin, LanguagePreference, PluginViewContext};
use std::collections::HashMap;
use std::sync::atomic::{AtomicU64, Ordering};
use tauri::{AppHandle, LogicalPosition, Manager, WebviewUrl, WebviewWindowBuilder};
use thiserror::Error;

static SELECTION_COUNTER: AtomicU64 = AtomicU64::new(1);

#[derive(Debug, Clone, Copy, PartialEq)]
pub struct MonitorBounds {
    pub x: f64,
    pub y: f64,
    pub width: f64,
    pub height: f64,
}

#[derive(Debug, Clone, Copy, PartialEq)]
pub struct PopupPosition {
    pub x: f64,
    pub y: f64,
}

#[derive(Debug, Clone)]
pub struct PopupSelection {
    pub selection_id: String,
    pub plugin: InstalledPlugin,
    pub context: PluginViewContext,
}

#[derive(Debug, Default)]
pub struct PopupRuntimeState {
    selections: HashMap<String, PopupSelection>,
}

impl PopupRuntimeState {
    pub fn insert(&mut self, selection: PopupSelection) {
        self.selections.insert(selection.selection_id.clone(), selection);
    }

    pub fn get(&self, selection_id: &str) -> Option<PopupSelection> {
        self.selections.get(selection_id).cloned()
    }
}

#[derive(Debug, Error)]
pub enum PopupManagerError {
    #[error("failed to create popup window: {0}")]
    Window(#[from] tauri::Error),
}

pub fn next_selection_id() -> String {
    SELECTION_COUNTER.fetch_add(1, Ordering::Relaxed).to_string()
}

pub fn clamp_popup_position(
    mouse_x: f64,
    mouse_y: f64,
    popup_w: f64,
    popup_h: f64,
    monitor: &MonitorBounds,
) -> PopupPosition {
    let offset = 10.0;
    let mut x = mouse_x + offset;
    let mut y = mouse_y + offset;
    let right = monitor.x + monitor.width;
    let bottom = monitor.y + monitor.height;

    if x + popup_w > right {
        x = mouse_x - popup_w - offset;
    }
    if y + popup_h > bottom {
        y = mouse_y - popup_h - offset;
    }

    PopupPosition {
        x: x.max(monitor.x).min(right - popup_w),
        y: y.max(monitor.y).min(bottom - popup_h),
    }
}

pub fn close_selection_popup(app: &AppHandle) {
    if let Some(win) = app.get_webview_window("selection-popup") {
        let _ = win.close();
    }
}

pub fn show_selection_popup(
    app: &AppHandle,
    selection_id: &str,
    plugin: &InstalledPlugin,
    mouse_x: f64,
    mouse_y: f64,
) -> Result<(), PopupManagerError> {
    close_selection_popup(app);

    let url = format!("/plugin-popup?selectionId={selection_id}");
    let popup = WebviewWindowBuilder::new(
        app,
        "selection-popup",
        WebviewUrl::App(url.into()),
    )
    .title("")
    .inner_size(plugin.manifest.popup.width as f64, plugin.manifest.popup.height as f64)
    .decorations(false)
    .always_on_top(true)
    .skip_taskbar(true)
    .resizable(false)
    .visible(true)
    .focused(false)
    .build()?;

    if let Some(position) = resolve_popup_position(
        app,
        mouse_x,
        mouse_y,
        plugin.manifest.popup.width as f64,
        plugin.manifest.popup.height as f64,
    ) {
        popup.set_position(tauri::Position::Logical(LogicalPosition::new(
            position.x, position.y,
        )))?;
    }

    Ok(())
}

fn resolve_popup_position(
    app: &AppHandle,
    mouse_x: f64,
    mouse_y: f64,
    popup_w: f64,
    popup_h: f64,
) -> Option<PopupPosition> {
    let monitors = app.available_monitors().ok()?;
    for monitor in monitors {
        let scale = monitor.scale_factor();
        let phys_x = monitor.position().x as f64;
        let phys_y = monitor.position().y as f64;
        let phys_w = monitor.size().width as f64;
        let phys_h = monitor.size().height as f64;

        let mouse_in_monitor = mouse_x >= phys_x
            && mouse_x < phys_x + phys_w
            && mouse_y >= phys_y
            && mouse_y < phys_y + phys_h;

        if mouse_in_monitor {
            #[cfg(target_os = "macos")]
            let (mouse_x_logical, mouse_y_logical) = (mouse_x, mouse_y);
            #[cfg(not(target_os = "macos"))]
            let (mouse_x_logical, mouse_y_logical) = (mouse_x / scale, mouse_y / scale);

            let bounds = MonitorBounds {
                x: phys_x / scale,
                y: phys_y / scale,
                width: phys_w / scale,
                height: phys_h / scale,
            };
            return Some(clamp_popup_position(
                mouse_x_logical,
                mouse_y_logical,
                popup_w,
                popup_h,
                &bounds,
            ));
        }
    }

    None
}
```

- [ ] **Step 4: Add app state construction**

Create `src-tauri/src/app_state.rs`:

```rust
use crate::settings_manager::{SettingsError, SettingsManager};
use std::sync::{Arc, Mutex};
use tauri::{AppHandle, Manager};
use thiserror::Error;

#[derive(Debug, Error)]
pub enum AppStateError {
    #[error("failed to resolve app data directory: {0}")]
    AppDataDir(#[from] tauri::Error),
    #[error("failed to initialize settings: {0}")]
    Settings(#[from] SettingsError),
}

#[derive(Clone)]
pub struct AppState {
    pub settings: SettingsManager,
    pub popup: Arc<Mutex<crate::popup_manager::PopupRuntimeState>>,
}

impl AppState {
    pub fn from_app(app: &AppHandle) -> Result<Self, AppStateError> {
        let root_dir = app.path().app_data_dir()?;
        let settings = SettingsManager::new(root_dir);
        settings.ensure_dirs()?;

        Ok(Self {
            settings,
            popup: Arc::new(Mutex::new(crate::popup_manager::PopupRuntimeState::default())),
        })
    }
}
```

- [ ] **Step 5: Export popup and app state modules in `lib.rs`**

Add these declarations near the existing module declarations:

```rust
mod app_state;
mod popup_manager;
```

- [ ] **Step 6: Run popup tests**

Run:

```bash
cargo test --manifest-path src-tauri/Cargo.toml popup_manager
```

Expected: PASS for popup geometry tests.

- [ ] **Step 7: Commit**

```bash
git add src-tauri/src/popup_manager.rs src-tauri/src/app_state.rs src-tauri/src/lib.rs
git commit -m "feat: add popup runtime manager"
```

## Task 6: Plugin File Protocol And Bridge Bootstrap

**Files:**

- Create: `src-tauri/src/plugin_protocol.rs`
- Modify: `src-tauri/src/lib.rs`
- Test: `src-tauri/src/plugin_protocol.rs`

- [ ] **Step 1: Write protocol helper tests**

Create `src-tauri/src/plugin_protocol.rs` with tests first:

```rust
#[cfg(test)]
mod tests {
    use super::*;
    use crate::models::{LanguagePreference, PluginViewContext};

    #[test]
    fn injects_bridge_before_head_close() {
        let html = "<html><head><title>X</title></head><body>Body</body></html>";
        let context = PluginViewContext {
            selected_text: Some("hello".to_string()),
            locale: "en".to_string(),
            language_preference: LanguagePreference::En,
            plugin_id: "quick-search".to_string(),
            plugin_version: "0.1.0".to_string(),
            app_version: "0.1.0".to_string(),
        };

        let injected = inject_bridge(html, &context, "popup").unwrap();

        assert!(injected.contains("window.ohMySelect"));
        assert!(injected.contains("\"selectedText\":\"hello\""));
        assert!(injected.find("window.ohMySelect").unwrap() < injected.find("</head>").unwrap());
    }

    #[test]
    fn detects_content_type_from_path() {
        assert_eq!(content_type_for_path("popup.html"), "text/html; charset=utf-8");
        assert_eq!(content_type_for_path("style.css"), "text/css");
        assert_eq!(content_type_for_path("icon.png"), "image/png");
    }
}
```

- [ ] **Step 2: Run tests and verify helpers are missing**

Run:

```bash
cargo test --manifest-path src-tauri/Cargo.toml plugin_protocol
```

Expected: FAIL with missing `inject_bridge` and `content_type_for_path`.

- [ ] **Step 3: Implement bridge injection helpers**

Add this implementation above the tests:

```rust
use crate::models::PluginViewContext;
use serde_json::json;
use thiserror::Error;

#[derive(Debug, Error)]
pub enum PluginProtocolError {
    #[error("failed to serialize plugin context: {0}")]
    Json(#[from] serde_json::Error),
}

pub fn content_type_for_path(path: &str) -> &'static str {
    match mime_guess::from_path(path).first_raw() {
        Some("text/html") => "text/html; charset=utf-8",
        Some(value) => value,
        None => "application/octet-stream",
    }
}

pub fn inject_bridge(
    html: &str,
    context: &PluginViewContext,
    view_kind: &str,
) -> Result<String, PluginProtocolError> {
    let context_json = serde_json::to_string(context)?;
    let bootstrap = format!(
        r#"<script>
(() => {{
  const context = {context_json};
  const viewKind = {view_kind_json};
  const callHost = (method, args = []) => {{
    const id = `${{Date.now()}}-${{Math.random().toString(16).slice(2)}}`;
    window.parent.postMessage({{
      source: "oh-my-select-plugin",
      id,
      pluginId: context.pluginId,
      viewKind,
      method,
      args
    }}, "*");
    return new Promise((resolve, reject) => {{
      const onMessage = (event) => {{
        const message = event.data;
        if (!message || message.source !== "oh-my-select-host" || message.id !== id) return;
        window.removeEventListener("message", onMessage);
        if (message.ok) resolve(message.value);
        else reject(new Error(message.error || "Host bridge call failed"));
      }};
      window.addEventListener("message", onMessage);
    }});
  }};
  window.ohMySelect = {{
    context,
    closePopup: () => callHost("closePopup"),
    openExternal: (url) => callHost("openExternal", [url]),
    storage: {{
      get: (key) => callHost("storage.get", [key]),
      set: (key, value) => callHost("storage.set", [key, value]),
      remove: (key) => callHost("storage.remove", [key])
    }}
  }};
}})();
</script>"#,
        view_kind_json = serde_json::to_string(view_kind)?,
    );

    if let Some(index) = html.find("</head>") {
        let mut output = String::with_capacity(html.len() + bootstrap.len());
        output.push_str(&html[..index]);
        output.push_str(&bootstrap);
        output.push_str(&html[index..]);
        Ok(output)
    } else {
        Ok(format!("{bootstrap}{html}"))
    }
}
```

- [ ] **Step 4: Add the custom protocol registration function**

Append:

```rust
use crate::app_state::AppState;
use crate::plugin_engine::build_view_context;
use crate::plugin_registry::PluginRegistry;
use crate::popup_manager::PopupSelection;
use tauri::{http, Manager};

pub fn register_plugin_protocol<R: tauri::Runtime>(
    builder: tauri::Builder<R>,
) -> tauri::Builder<R> {
    builder.register_asynchronous_uri_scheme_protocol("oms-plugin", |ctx, request, responder| {
        let app = ctx.app_handle().clone();
        let uri = request.uri().clone();
        std::thread::spawn(move || {
            let response = handle_protocol_request(&app, uri.to_string());
            responder.respond(response);
        });
    })
}

fn handle_protocol_request(
    app: &tauri::AppHandle,
    uri: String,
) -> http::Response<Vec<u8>> {
    match build_protocol_response(app, &uri) {
        Ok((content_type, body)) => http::Response::builder()
            .status(http::StatusCode::OK)
            .header(http::header::CONTENT_TYPE, content_type)
            .body(body)
            .unwrap(),
        Err(error) => http::Response::builder()
            .status(http::StatusCode::BAD_REQUEST)
            .header(http::header::CONTENT_TYPE, "text/plain; charset=utf-8")
            .body(error.into_bytes())
            .unwrap(),
    }
}

fn build_protocol_response(
    app: &tauri::AppHandle,
    uri: &str,
) -> Result<(&'static str, Vec<u8>), String> {
    let url = url::Url::parse(uri).map_err(|error| error.to_string())?;
    let plugin_id = url
        .host_str()
        .ok_or_else(|| "missing plugin id".to_string())?;
    let path = url.path().trim_start_matches('/');
    let view_kind = url
        .query_pairs()
        .find(|(key, _)| key == "viewKind")
        .map(|(_, value)| value.to_string())
        .unwrap_or_else(|| "settings".to_string());
    let selection_id = url
        .query_pairs()
        .find(|(key, _)| key == "selectionId")
        .map(|(_, value)| value.to_string());

    let state = app.state::<AppState>();
    let registry = PluginRegistry::new(state.settings.clone());
    let plugin_dir = registry.plugin_dir(plugin_id);
    let file_path = plugin_dir.join(path);
    if !file_path.starts_with(&plugin_dir) {
        return Err("invalid plugin file path".to_string());
    }

    let mut body = std::fs::read(&file_path).map_err(|error| error.to_string())?;
    let content_type = content_type_for_path(path);

    if content_type.starts_with("text/html") {
        let html = String::from_utf8(body).map_err(|error| error.to_string())?;
        let plugins = registry.list_plugins().map_err(|error| error.to_string())?;
        let plugin = plugins
            .into_iter()
            .find(|plugin| plugin.id == plugin_id)
            .ok_or_else(|| "plugin not found".to_string())?;
        let config = state.settings.load_config().map_err(|error| error.to_string())?;
        let locale = registry.resolve_locale(config.language_preference);
        let selected_text = selection_id
            .as_deref()
            .and_then(|id| state.popup.lock().ok().and_then(|popup| popup.get(id)))
            .map(|selection: PopupSelection| selection.context.selected_text)
            .flatten();
        let context = build_view_context(
            &plugin,
            selected_text,
            locale,
            config.language_preference,
            app.package_info().version.to_string(),
        );
        body = inject_bridge(&html, &context, &view_kind)
            .map_err(|error| error.to_string())?
            .into_bytes();
    }

    Ok((content_type, body))
}
```

- [ ] **Step 5: Wire protocol registration in `lib.rs`**

Add this declaration near the existing module declarations:

```rust
mod plugin_protocol;
```

When building the Tauri app in `src-tauri/src/lib.rs`, wrap the builder:

```rust
let builder = tauri::Builder::default();
let builder = plugin_protocol::register_plugin_protocol(builder);
```

Use the resulting `builder` for plugin setup in Task 8.

- [ ] **Step 6: Run protocol tests**

Run:

```bash
cargo test --manifest-path src-tauri/Cargo.toml plugin_protocol
```

Expected: PASS for bridge injection and content type tests.

- [ ] **Step 7: Commit**

```bash
git add src-tauri/src/plugin_protocol.rs src-tauri/src/lib.rs
git commit -m "feat: serve plugin views through custom protocol"
```

## Task 7: Backend Commands For Settings And Plugin Bridge

**Files:**

- Create: `src-tauri/src/commands.rs`
- Modify: `src-tauri/src/lib.rs`

- [ ] **Step 1: Define command return types**

Add to `src-tauri/src/models.rs`:

```rust
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PopupPayload {
    pub selection_id: String,
    pub plugin: InstalledPlugin,
    pub context: PluginViewContext,
    pub entry_url: String,
}
```

- [ ] **Step 2: Implement commands**

Create `src-tauri/src/commands.rs`:

```rust
use crate::app_state::AppState;
use crate::models::{
    AppSettingsSnapshot, LanguagePreference, PluginSettingsPayload, PopupPayload,
};
use crate::plugin_engine::build_view_context;
use crate::plugin_registry::PluginRegistry;
use crate::popup_manager::close_selection_popup;
use serde_json::Value;
use tauri::{AppHandle, Manager};
use tauri_plugin_opener::OpenerExt;

#[tauri::command]
pub fn get_settings_snapshot(app: AppHandle) -> Result<AppSettingsSnapshot, String> {
    let state = app.state::<AppState>();
    let registry = PluginRegistry::new(state.settings.clone());
    let config = state.settings.load_config().map_err(|error| error.to_string())?;
    let locale = registry.resolve_locale(config.language_preference);
    let plugins = registry.list_plugins().map_err(|error| error.to_string())?;
    Ok(AppSettingsSnapshot {
        language_preference: config.language_preference,
        locale,
        plugins,
        app_version: app.package_info().version.to_string(),
    })
}

#[tauri::command]
pub fn set_language_preference(
    app: AppHandle,
    language_preference: LanguagePreference,
) -> Result<AppSettingsSnapshot, String> {
    let state = app.state::<AppState>();
    let mut config = state.settings.load_config().map_err(|error| error.to_string())?;
    config.language_preference = language_preference;
    state.settings.save_config(&config).map_err(|error| error.to_string())?;
    get_settings_snapshot(app)
}

#[tauri::command]
pub fn import_plugin_folder(app: AppHandle, path: String) -> Result<AppSettingsSnapshot, String> {
    let state = app.state::<AppState>();
    let registry = PluginRegistry::new(state.settings.clone());
    registry
        .import_folder(std::path::Path::new(&path))
        .map_err(|error| error.to_string())?;
    get_settings_snapshot(app)
}

#[tauri::command]
pub fn set_plugin_enabled(
    app: AppHandle,
    plugin_id: String,
    enabled: bool,
) -> Result<AppSettingsSnapshot, String> {
    let state = app.state::<AppState>();
    let registry = PluginRegistry::new(state.settings.clone());
    registry
        .set_enabled(&plugin_id, enabled)
        .map_err(|error| error.to_string())?;
    get_settings_snapshot(app)
}

#[tauri::command]
pub fn set_plugin_order(app: AppHandle, plugin_ids: Vec<String>) -> Result<AppSettingsSnapshot, String> {
    let state = app.state::<AppState>();
    let registry = PluginRegistry::new(state.settings.clone());
    registry
        .set_plugin_order(plugin_ids)
        .map_err(|error| error.to_string())?;
    get_settings_snapshot(app)
}

#[tauri::command]
pub fn remove_plugin(app: AppHandle, plugin_id: String) -> Result<AppSettingsSnapshot, String> {
    let state = app.state::<AppState>();
    let registry = PluginRegistry::new(state.settings.clone());
    registry
        .remove_plugin(&plugin_id)
        .map_err(|error| error.to_string())?;
    get_settings_snapshot(app)
}

#[tauri::command]
pub fn get_popup_payload(app: AppHandle, selection_id: String) -> Result<PopupPayload, String> {
    let state = app.state::<AppState>();
    let popup = state.popup.lock().map_err(|_| "popup state lock failed".to_string())?;
    let selection = popup
        .get(&selection_id)
        .ok_or_else(|| "selection context not found".to_string())?;
    let entry_url = format!(
        "oms-plugin://{}/{}?viewKind=popup&selectionId={}",
        selection.plugin.id, selection.plugin.manifest.popup.entry, selection_id
    );
    Ok(PopupPayload {
        selection_id,
        plugin: selection.plugin,
        context: selection.context,
        entry_url,
    })
}

#[tauri::command]
pub fn get_plugin_settings_payload(
    app: AppHandle,
    plugin_id: String,
) -> Result<PluginSettingsPayload, String> {
    let state = app.state::<AppState>();
    let registry = PluginRegistry::new(state.settings.clone());
    let config = state.settings.load_config().map_err(|error| error.to_string())?;
    let locale = registry.resolve_locale(config.language_preference);
    let plugin = registry
        .list_plugins()
        .map_err(|error| error.to_string())?
        .into_iter()
        .find(|plugin| plugin.id == plugin_id)
        .ok_or_else(|| "plugin not found".to_string())?;
    let entry_url = plugin.manifest.settings.as_ref().map(|settings| {
        format!(
            "oms-plugin://{}/{}?viewKind=settings",
            plugin.id, settings.entry
        )
    });
    let context = build_view_context(
        &plugin,
        None,
        locale,
        config.language_preference,
        app.package_info().version.to_string(),
    );
    Ok(PluginSettingsPayload {
        plugin,
        entry_url,
        context,
    })
}

#[tauri::command]
pub fn plugin_storage_get(app: AppHandle, plugin_id: String, key: String) -> Result<Option<Value>, String> {
    let state = app.state::<AppState>();
    state
        .settings
        .storage_get(&plugin_id, &key)
        .map_err(|error| error.to_string())
}

#[tauri::command]
pub fn plugin_storage_set(
    app: AppHandle,
    plugin_id: String,
    key: String,
    value: Value,
) -> Result<(), String> {
    let state = app.state::<AppState>();
    state
        .settings
        .storage_set(&plugin_id, &key, value)
        .map_err(|error| error.to_string())
}

#[tauri::command]
pub fn plugin_storage_remove(app: AppHandle, plugin_id: String, key: String) -> Result<(), String> {
    let state = app.state::<AppState>();
    state
        .settings
        .storage_remove(&plugin_id, &key)
        .map_err(|error| error.to_string())
}

#[tauri::command]
pub fn bridge_open_external(app: AppHandle, url: String) -> Result<(), String> {
    app.opener()
        .open_url(url, None::<&str>)
        .map_err(|error| error.to_string())
}

#[tauri::command]
pub fn bridge_close_popup(app: AppHandle) -> Result<(), String> {
    close_selection_popup(&app);
    Ok(())
}
```

- [ ] **Step 3: Register commands in `lib.rs`**

Add this declaration near the existing module declarations:

```rust
mod commands;
```

Add these command names to `tauri::generate_handler!`:

```rust
commands::get_settings_snapshot,
commands::set_language_preference,
commands::import_plugin_folder,
commands::set_plugin_enabled,
commands::set_plugin_order,
commands::remove_plugin,
commands::get_popup_payload,
commands::get_plugin_settings_payload,
commands::plugin_storage_get,
commands::plugin_storage_set,
commands::plugin_storage_remove,
commands::bridge_open_external,
commands::bridge_close_popup
```

- [ ] **Step 4: Run Rust checks**

Run:

```bash
cargo check --manifest-path src-tauri/Cargo.toml
```

Expected: PASS or fail only for Task 8 wiring that has not been added. If failures reference command names, fix the registration list before continuing.

- [ ] **Step 5: Commit**

```bash
git add src-tauri/src/commands.rs src-tauri/src/models.rs src-tauri/src/lib.rs
git commit -m "feat: add plugin settings commands"
```

## Task 8: React Settings Shell, i18n, And Plugin Management UI

**Files:**

- Create: `src/lib/i18n.ts`
- Create: `src/lib/tauri-api.ts`
- Create: `src/components/settings/settings-shell.tsx`
- Create: `src/components/settings/system-settings.tsx`
- Modify: `src/routes/index.tsx`
- Modify: `src/routes/__root.tsx`
- Test: `src/components/settings/__tests__/settings-shell.test.tsx`

- [ ] **Step 1: Add typed frontend API wrappers**

Create `src/lib/tauri-api.ts`:

```ts
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
  return invoke<AppSettingsSnapshot>("set_plugin_enabled", { pluginId, enabled })
}

export function setPluginOrder(pluginIds: Array<string>) {
  return invoke<AppSettingsSnapshot>("set_plugin_order", { pluginIds })
}

export function removePlugin(pluginId: string) {
  return invoke<AppSettingsSnapshot>("remove_plugin", { pluginId })
}
```

- [ ] **Step 2: Add host i18n helper**

Create `src/lib/i18n.ts`:

```ts
export type Locale = "zh-CN" | "en"

const dictionaries = {
  "zh-CN": {
    appGroup: "应用",
    pluginGroup: "插件",
    systemSettings: "系统设置",
    language: "系统语言",
    followSystem: "跟随系统",
    chinese: "中文",
    english: "英文",
    importPlugin: "导入插件",
    noPlugins: "还没有导入插件",
    enabled: "启用",
    disabled: "禁用",
    moveUp: "上移",
    moveDown: "下移",
    remove: "移除",
    pluginSettingsEmpty: "该插件未提供设置页面",
  },
  en: {
    appGroup: "App",
    pluginGroup: "Plugins",
    systemSettings: "System Settings",
    language: "System Language",
    followSystem: "Follow System",
    chinese: "Chinese",
    english: "English",
    importPlugin: "Import Plugin",
    noPlugins: "No plugins imported",
    enabled: "Enabled",
    disabled: "Disabled",
    moveUp: "Move Up",
    moveDown: "Move Down",
    remove: "Remove",
    pluginSettingsEmpty: "This plugin does not provide a settings page",
  },
} satisfies Record<Locale, Record<string, string>>

export type MessageKey = keyof (typeof dictionaries)["en"]

export function t(locale: Locale, key: MessageKey) {
  return dictionaries[locale][key]
}

export function localizedName(
  locale: Locale,
  name: { "zh-CN"?: string; en?: string },
) {
  return locale === "zh-CN"
    ? (name["zh-CN"] ?? name.en ?? "Unnamed Plugin")
    : (name.en ?? name["zh-CN"] ?? "Unnamed Plugin")
}
```

- [ ] **Step 3: Write settings shell test**

Create `src/components/settings/__tests__/settings-shell.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"
import { SettingsShell } from "../settings-shell"
import type { AppSettingsSnapshot } from "@/lib/tauri-api"

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
    render(<SettingsShell initialSnapshot={snapshot} />)

    expect(screen.getByText("oh-my-select")).toBeInTheDocument()
    expect(screen.getByText("Version 0.1.0")).toBeInTheDocument()
    expect(screen.getByText("System Settings")).toBeInTheDocument()
    expect(screen.getByText("Quick Search")).toBeInTheDocument()
    expect(screen.getByText("System settings content")).toBeInTheDocument()
  })
})
```

- [ ] **Step 4: Run frontend test and verify it fails**

Run:

```bash
bun test src/components/settings/__tests__/settings-shell.test.tsx
```

Expected: FAIL because `SettingsShell` does not exist.

- [ ] **Step 5: Implement settings shell**

Create `src/components/settings/settings-shell.tsx`:

```tsx
import { useMemo, useState } from "react"
import { Settings, SlidersHorizontal } from "lucide-react"
import { cn } from "@/lib/utils"
import { localizedName, t } from "@/lib/i18n"
import type { AppSettingsSnapshot } from "@/lib/tauri-api"
import { SystemSettings } from "./system-settings"
import { PluginSettingsHost } from "./plugin-settings-host"

type ActiveRoute =
  | { type: "system" }
  | { type: "plugin"; pluginId: string }

export function SettingsShell({
  initialSnapshot,
}: {
  initialSnapshot: AppSettingsSnapshot
}) {
  const [snapshot, setSnapshot] = useState(initialSnapshot)
  const [activeRoute, setActiveRoute] = useState<ActiveRoute>({ type: "system" })
  const locale = snapshot.locale
  const activePluginId = activeRoute.type === "plugin" ? activeRoute.pluginId : null
  const activePlugin = useMemo(
    () => snapshot.plugins.find((plugin) => plugin.id === activePluginId),
    [activePluginId, snapshot.plugins],
  )

  return (
    <main className="grid h-svh grid-cols-[260px_1fr] overflow-hidden bg-background text-foreground">
      <aside className="flex min-h-0 flex-col border-r bg-sidebar">
        <div className="border-b p-5">
          <div className="text-base font-semibold">oh-my-select</div>
          <div className="mt-1 text-xs text-muted-foreground">
            Version {snapshot.appVersion}
          </div>
        </div>

        <nav className="min-h-0 flex-1 overflow-y-auto p-3">
          <div className="mb-5">
            <div className="mb-2 px-2 text-[11px] font-medium uppercase text-muted-foreground">
              {t(locale, "appGroup")}
            </div>
            <button
              className={navButtonClass(activeRoute.type === "system")}
              onClick={() => setActiveRoute({ type: "system" })}
              type="button"
            >
              <Settings className="size-4" />
              <span>{t(locale, "systemSettings")}</span>
            </button>
          </div>

          <div>
            <div className="mb-2 px-2 text-[11px] font-medium uppercase text-muted-foreground">
              {t(locale, "pluginGroup")}
            </div>
            <div className="flex flex-col gap-1">
              {snapshot.plugins.map((plugin) => (
                <button
                  key={plugin.id}
                  className={navButtonClass(activePluginId === plugin.id)}
                  onClick={() => setActiveRoute({ type: "plugin", pluginId: plugin.id })}
                  type="button"
                >
                  <SlidersHorizontal className="size-4" />
                  <span className="min-w-0 flex-1 truncate text-left">
                    {localizedName(locale, plugin.manifest.name)}
                  </span>
                  {!plugin.enabled && (
                    <span className="text-[10px] text-muted-foreground">
                      {t(locale, "disabled")}
                    </span>
                  )}
                </button>
              ))}
            </div>
          </div>
        </nav>
      </aside>

      <section className="min-h-0 overflow-y-auto">
        {activeRoute.type === "system" ? (
          <SystemSettings snapshot={snapshot} onSnapshotChange={setSnapshot} />
        ) : activePlugin ? (
          <PluginSettingsHost pluginId={activePlugin.id} snapshot={snapshot} />
        ) : (
          <SystemSettings snapshot={snapshot} onSnapshotChange={setSnapshot} />
        )}
      </section>
    </main>
  )
}

function navButtonClass(active: boolean) {
  return cn(
    "flex h-9 w-full items-center gap-2 px-2 text-left text-sm transition-colors",
    active
      ? "bg-primary text-primary-foreground"
      : "text-sidebar-foreground hover:bg-sidebar-accent",
  )
}
```

- [ ] **Step 6: Implement SystemSettings UI**

Create `src/components/settings/system-settings.tsx`:

```tsx
import { open } from "@tauri-apps/plugin-dialog"
import { ArrowDown, ArrowUp, FolderPlus, Power, Trash2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { localizedName, t } from "@/lib/i18n"
import {
  importPluginFolder,
  removePlugin,
  setLanguagePreference,
  setPluginEnabled,
  setPluginOrder,
  type AppSettingsSnapshot,
  type LanguagePreference,
} from "@/lib/tauri-api"

export function SystemSettings({
  snapshot,
  onSnapshotChange,
}: {
  snapshot: AppSettingsSnapshot
  onSnapshotChange: (snapshot: AppSettingsSnapshot) => void
}) {
  const locale = snapshot.locale

  async function choosePluginFolder() {
    const selected = await open({ directory: true, multiple: false })
    if (typeof selected === "string") {
      onSnapshotChange(await importPluginFolder(selected))
    }
  }

  async function updateLanguage(value: LanguagePreference) {
    onSnapshotChange(await setLanguagePreference(value))
  }

  async function movePlugin(index: number, direction: -1 | 1) {
    const ids = snapshot.plugins.map((plugin) => plugin.id)
    const target = index + direction
    if (target < 0 || target >= ids.length) return
    const next = [...ids]
    ;[next[index], next[target]] = [next[target], next[index]]
    onSnapshotChange(await setPluginOrder(next))
  }

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-8 p-8">
      <header>
        <h1 className="text-xl font-semibold">{t(locale, "systemSettings")}</h1>
      </header>

      <section className="flex flex-col gap-3">
        <label className="text-sm font-medium" htmlFor="language">
          {t(locale, "language")}
        </label>
        <select
          id="language"
          className="h-9 w-56 border bg-background px-2 text-sm"
          value={snapshot.languagePreference}
          onChange={(event) => updateLanguage(event.target.value as LanguagePreference)}
        >
          <option value="system">{t(locale, "followSystem")}</option>
          <option value="zh-CN">{t(locale, "chinese")}</option>
          <option value="en">{t(locale, "english")}</option>
        </select>
      </section>

      <section className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-medium">{t(locale, "pluginGroup")}</h2>
          <Button onClick={choosePluginFolder} type="button">
            <FolderPlus />
            {t(locale, "importPlugin")}
          </Button>
        </div>

        {snapshot.plugins.length === 0 ? (
          <div className="border p-8 text-sm text-muted-foreground">
            {t(locale, "noPlugins")}
          </div>
        ) : (
          <div className="divide-y border">
            {snapshot.plugins.map((plugin, index) => (
              <div key={plugin.id} className="flex items-center gap-3 p-3">
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium">
                    {localizedName(locale, plugin.manifest.name)}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {plugin.id} · {plugin.manifest.version}
                  </div>
                </div>
                <Button
                  aria-label={t(locale, "moveUp")}
                  disabled={index === 0}
                  onClick={() => movePlugin(index, -1)}
                  size="icon-sm"
                  type="button"
                  variant="outline"
                >
                  <ArrowUp />
                </Button>
                <Button
                  aria-label={t(locale, "moveDown")}
                  disabled={index === snapshot.plugins.length - 1}
                  onClick={() => movePlugin(index, 1)}
                  size="icon-sm"
                  type="button"
                  variant="outline"
                >
                  <ArrowDown />
                </Button>
                <Button
                  onClick={async () =>
                    onSnapshotChange(await setPluginEnabled(plugin.id, !plugin.enabled))
                  }
                  type="button"
                  variant="outline"
                >
                  <Power />
                  {plugin.enabled ? t(locale, "enabled") : t(locale, "disabled")}
                </Button>
                <Button
                  onClick={async () => onSnapshotChange(await removePlugin(plugin.id))}
                  size="icon-sm"
                  type="button"
                  variant="destructive"
                  aria-label={t(locale, "remove")}
                >
                  <Trash2 />
                </Button>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  )
}
```

- [ ] **Step 7: Add temporary plugin settings host**

Create `src/components/settings/plugin-settings-host.tsx`:

```tsx
import { t } from "@/lib/i18n"
import type { AppSettingsSnapshot } from "@/lib/tauri-api"

export function PluginSettingsHost({
  snapshot,
}: {
  pluginId: string
  snapshot: AppSettingsSnapshot
}) {
  return (
    <div className="flex min-h-svh items-center justify-center p-8 text-sm text-muted-foreground">
      {t(snapshot.locale, "pluginSettingsEmpty")}
    </div>
  )
}
```

This temporary component is replaced by the real iframe host in Task 9.

- [ ] **Step 8: Wire settings shell route**

Replace `src/routes/index.tsx`:

```tsx
import { createFileRoute } from "@tanstack/react-router"
import { useEffect, useState } from "react"
import { SettingsShell } from "@/components/settings/settings-shell"
import { getSettingsSnapshot, type AppSettingsSnapshot } from "@/lib/tauri-api"

export const Route = createFileRoute("/")({ component: App })

function App() {
  const [snapshot, setSnapshot] = useState<AppSettingsSnapshot | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    getSettingsSnapshot().then(setSnapshot).catch((reason) => {
      setError(reason instanceof Error ? reason.message : String(reason))
    })
  }, [])

  if (error) {
    return <main className="p-8 text-sm text-destructive">{error}</main>
  }

  if (!snapshot) {
    return <main className="p-8 text-sm text-muted-foreground">Loading...</main>
  }

  return <SettingsShell initialSnapshot={snapshot} />
}
```

- [ ] **Step 9: Update document title and devtools gating**

In `src/routes/__root.tsx`, change the title to `oh-my-select` and render devtools only in development:

```tsx
{import.meta.env.DEV && (
  <TanStackDevtools
    config={{ position: "bottom-right" }}
    plugins={[
      {
        name: "Tanstack Router",
        render: <TanStackRouterDevtoolsPanel />,
      },
    ]}
  />
)}
```

- [ ] **Step 10: Run frontend tests**

Run:

```bash
bun test src/components/settings/__tests__/settings-shell.test.tsx
bun run typecheck
```

Expected: PASS for the settings shell test and TypeScript.

- [ ] **Step 11: Commit**

```bash
git add src/lib/i18n.ts src/lib/tauri-api.ts src/components/settings src/routes/index.tsx src/routes/__root.tsx package.json bun.lock
git commit -m "feat: add settings shell"
```

## Task 9: Plugin Iframe Host, Popup Route, And Bridge Handling

**Files:**

- Create: `src/lib/plugin-bridge.ts`
- Create: `src/components/plugin/plugin-frame.tsx`
- Create: `src/components/plugin/popup-host.tsx`
- Create: `src/routes/plugin-popup.tsx`
- Modify: `src/components/settings/plugin-settings-host.tsx`
- Modify: `src/lib/tauri-api.ts`
- Test: `src/lib/plugin-bridge.test.ts`

- [ ] **Step 1: Extend frontend API wrappers**

Append to `src/lib/tauri-api.ts`:

```ts
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
  return invoke<PluginSettingsPayload>("get_plugin_settings_payload", { pluginId })
}

export function bridgeOpenExternal(url: string) {
  return invoke<void>("bridge_open_external", { url })
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
```

- [ ] **Step 2: Write bridge helper test**

Create `src/lib/plugin-bridge.test.ts`:

```ts
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
      }),
    ).toBe(true)
  })

  it("rejects unrelated messages", () => {
    expect(isPluginBridgeRequest({ source: "other" })).toBe(false)
  })
})
```

- [ ] **Step 3: Implement bridge protocol helpers**

Create `src/lib/plugin-bridge.ts`:

```ts
export type PluginBridgeRequest = {
  source: "oh-my-select-plugin"
  id: string
  pluginId: string
  viewKind: "popup" | "settings"
  method:
    | "closePopup"
    | "openExternal"
    | "storage.get"
    | "storage.set"
    | "storage.remove"
  args: Array<unknown>
}

export type PluginBridgeResponse = {
  source: "oh-my-select-host"
  id: string
  ok: boolean
  value?: unknown
  error?: string
}

export function isPluginBridgeRequest(value: unknown): value is PluginBridgeRequest {
  if (!value || typeof value !== "object") return false
  const record = value as Record<string, unknown>
  return (
    record.source === "oh-my-select-plugin" &&
    typeof record.id === "string" &&
    typeof record.pluginId === "string" &&
    (record.viewKind === "popup" || record.viewKind === "settings") &&
    typeof record.method === "string" &&
    Array.isArray(record.args)
  )
}

export function postBridgeResponse(
  target: Window,
  response: PluginBridgeResponse,
) {
  target.postMessage(response, "*")
}
```

- [ ] **Step 4: Implement shared plugin frame**

Create `src/components/plugin/plugin-frame.tsx`:

```tsx
import { useEffect } from "react"
import {
  bridgeClosePopup,
  bridgeOpenExternal,
  pluginStorageGet,
  pluginStorageRemove,
  pluginStorageSet,
} from "@/lib/tauri-api"
import {
  isPluginBridgeRequest,
  postBridgeResponse,
  type PluginBridgeRequest,
} from "@/lib/plugin-bridge"

export function PluginFrame({
  pluginId,
  entryUrl,
  title,
  className,
}: {
  pluginId: string
  entryUrl: string
  title: string
  className?: string
}) {
  useEffect(() => {
    async function handleRequest(request: PluginBridgeRequest) {
      if (request.pluginId !== pluginId) return

      try {
        const value = await dispatchBridgeRequest(request)
        postBridgeResponse(window, {
          source: "oh-my-select-host",
          id: request.id,
          ok: true,
          value,
        })
      } catch (error) {
        postBridgeResponse(window, {
          source: "oh-my-select-host",
          id: request.id,
          ok: false,
          error: error instanceof Error ? error.message : String(error),
        })
      }
    }

    function onMessage(event: MessageEvent) {
      if (isPluginBridgeRequest(event.data)) {
        void handleRequest(event.data)
      }
    }

    window.addEventListener("message", onMessage)
    return () => window.removeEventListener("message", onMessage)
  }, [pluginId])

  return (
    <iframe
      className={className}
      sandbox="allow-scripts allow-forms allow-popups"
      src={entryUrl}
      title={title}
    />
  )
}

async function dispatchBridgeRequest(request: PluginBridgeRequest) {
  const [first, second] = request.args
  switch (request.method) {
    case "closePopup":
      return bridgeClosePopup()
    case "openExternal":
      return bridgeOpenExternal(String(first))
    case "storage.get":
      return pluginStorageGet(request.pluginId, String(first))
    case "storage.set":
      return pluginStorageSet(request.pluginId, String(first), second)
    case "storage.remove":
      return pluginStorageRemove(request.pluginId, String(first))
  }
}
```

- [ ] **Step 5: Implement popup host**

Create `src/components/plugin/popup-host.tsx`:

```tsx
import { useEffect, useState } from "react"
import { PluginFrame } from "./plugin-frame"
import { getPopupPayload, type PopupPayload } from "@/lib/tauri-api"

export function PopupHost({ selectionId }: { selectionId: string }) {
  const [payload, setPayload] = useState<PopupPayload | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    getPopupPayload(selectionId).then(setPayload).catch((reason) => {
      setError(reason instanceof Error ? reason.message : String(reason))
    })
  }, [selectionId])

  if (error) {
    return (
      <main className="flex h-svh items-center justify-center p-3 text-xs text-destructive">
        {error}
      </main>
    )
  }

  if (!payload) {
    return (
      <main className="flex h-svh items-center justify-center p-3 text-xs text-muted-foreground">
        Loading...
      </main>
    )
  }

  return (
    <PluginFrame
      className="h-svh w-screen border-0"
      entryUrl={payload.entryUrl}
      pluginId={payload.plugin.id}
      title={payload.plugin.id}
    />
  )
}
```

- [ ] **Step 6: Add popup route**

Create `src/routes/plugin-popup.tsx`:

```tsx
import { createFileRoute } from "@tanstack/react-router"
import { PopupHost } from "@/components/plugin/popup-host"

export const Route = createFileRoute("/plugin-popup")({
  validateSearch: (search) => ({
    selectionId: String(search.selectionId ?? ""),
  }),
  component: PluginPopupRoute,
})

function PluginPopupRoute() {
  const { selectionId } = Route.useSearch()
  return <PopupHost selectionId={selectionId} />
}
```

- [ ] **Step 7: Replace plugin settings host with real iframe host**

Replace `src/components/settings/plugin-settings-host.tsx`:

```tsx
import { useEffect, useState } from "react"
import { PluginFrame } from "@/components/plugin/plugin-frame"
import { t } from "@/lib/i18n"
import {
  getPluginSettingsPayload,
  type AppSettingsSnapshot,
  type PluginSettingsPayload,
} from "@/lib/tauri-api"

export function PluginSettingsHost({
  pluginId,
  snapshot,
}: {
  pluginId: string
  snapshot: AppSettingsSnapshot
}) {
  const [payload, setPayload] = useState<PluginSettingsPayload | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    setPayload(null)
    setError(null)
    getPluginSettingsPayload(pluginId).then(setPayload).catch((reason) => {
      setError(reason instanceof Error ? reason.message : String(reason))
    })
  }, [pluginId])

  if (error) {
    return <div className="p-8 text-sm text-destructive">{error}</div>
  }

  if (!payload) {
    return <div className="p-8 text-sm text-muted-foreground">Loading...</div>
  }

  if (!payload.entryUrl) {
    return (
      <div className="flex min-h-svh items-center justify-center p-8 text-sm text-muted-foreground">
        {t(snapshot.locale, "pluginSettingsEmpty")}
      </div>
    )
  }

  return (
    <PluginFrame
      className="h-svh w-full border-0"
      entryUrl={payload.entryUrl}
      pluginId={payload.plugin.id}
      title={payload.plugin.id}
    />
  )
}
```

- [ ] **Step 8: Run tests and typecheck**

Run:

```bash
bun test src/lib/plugin-bridge.test.ts
bun run typecheck
```

Expected: PASS.

- [ ] **Step 9: Commit**

```bash
git add src/lib/plugin-bridge.ts src/lib/plugin-bridge.test.ts src/lib/tauri-api.ts src/components/plugin src/components/settings/plugin-settings-host.tsx src/routes/plugin-popup.tsx
git commit -m "feat: host plugin popup and settings views"
```

## Task 10: Tray, Selection Monitor, And Runtime Wiring

**Files:**

- Create: `src-tauri/src/tray.rs`
- Create: `src-tauri/src/selection_monitor.rs`
- Modify: `src-tauri/src/lib.rs`

- [ ] **Step 1: Implement tray behavior**

Create `src-tauri/src/tray.rs`:

```rust
use tauri::{
    menu::{MenuBuilder, MenuItemBuilder},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    App, Manager,
};

pub fn setup_tray(app: &mut App) -> tauri::Result<()> {
    let show = MenuItemBuilder::with_id("show_settings", "Settings").build(app)?;
    let quit = MenuItemBuilder::with_id("quit", "Quit").build(app)?;
    let menu = MenuBuilder::new(app).items(&[&show, &quit]).build()?;

    TrayIconBuilder::with_id("main-tray")
        .icon(app.default_window_icon().unwrap().clone())
        .menu(&menu)
        .show_menu_on_left_click(false)
        .on_menu_event(|app, event| match event.id().as_ref() {
            "show_settings" => show_settings_window(app),
            "quit" => app.exit(0),
            _ => {}
        })
        .on_tray_icon_event(|tray, event| {
            if let TrayIconEvent::Click {
                button: MouseButton::Left,
                button_state: MouseButtonState::Up,
                ..
            } = event
            {
                show_settings_window(&tray.app_handle());
            }
        })
        .build(app)?;

    Ok(())
}

fn show_settings_window(app: &tauri::AppHandle) {
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.unminimize();
        let _ = window.show();
        let _ = window.set_focus();
    }
}
```

- [ ] **Step 2: Implement selection monitor**

Create `src-tauri/src/selection_monitor.rs`:

```rust
use crate::app_state::AppState;
use crate::plugin_engine::{build_view_context, PluginEngine};
use crate::plugin_registry::PluginRegistry;
use crate::popup_manager::{
    close_selection_popup, next_selection_id, show_selection_popup, PopupSelection,
};
use std::sync::{Arc, Mutex};
use std::thread;
use std::time::Duration;
use tauri::{AppHandle, Manager};

#[derive(Debug)]
struct SelectionState {
    is_dragging: bool,
    drag_start_x: f64,
    drag_start_y: f64,
    last_selected_text: String,
}

impl Default for SelectionState {
    fn default() -> Self {
        Self {
            is_dragging: false,
            drag_start_x: 0.0,
            drag_start_y: 0.0,
            last_selected_text: String::new(),
        }
    }
}

pub fn start_input_monitoring(app: AppHandle) {
    let state = Arc::new(Mutex::new(SelectionState::default()));

    thread::spawn(move || {
        let result = monio::listen(move |event| match event.event_type {
            monio::EventType::MousePressed => {
                if let Some(mouse) = &event.mouse {
                    if mouse.button == Some(monio::Button::Left) {
                        close_selection_popup(&app);
                        if let Ok(mut state) = state.lock() {
                            state.is_dragging = true;
                            state.drag_start_x = mouse.x;
                            state.drag_start_y = mouse.y;
                        }
                    }
                }
            }
            monio::EventType::MouseReleased => {
                if let Some(mouse) = &event.mouse {
                    if mouse.button != Some(monio::Button::Left) {
                        return;
                    }

                    let should_handle = {
                        let mut state = match state.lock() {
                            Ok(state) => state,
                            Err(_) => return,
                        };
                        if !state.is_dragging {
                            return;
                        }
                        state.is_dragging = false;
                        let dx = mouse.x - state.drag_start_x;
                        let dy = mouse.y - state.drag_start_y;
                        (dx * dx + dy * dy).sqrt() > 5.0
                    };

                    if should_handle {
                        thread::sleep(Duration::from_millis(50));
                        handle_selection(app.clone(), state.clone());
                    }
                }
            }
            _ => {}
        });

        if let Err(error) = result {
            eprintln!("Monio listener error: {error:?}");
        }
    });
}

fn handle_selection(app: AppHandle, state: Arc<Mutex<SelectionState>>) {
    let selected_text = selection::get_text();
    if selected_text.trim().is_empty() {
        return;
    }

    {
        let mut state = match state.lock() {
            Ok(state) => state,
            Err(_) => return,
        };
        if state.last_selected_text == selected_text {
            return;
        }
        state.last_selected_text = selected_text.clone();
    }

    let (mouse_x, mouse_y) = monio::mouse_position().unwrap_or((0.0, 0.0));
    let app_state = app.state::<AppState>();
    let registry = PluginRegistry::new(app_state.settings.clone());
    let config = match app_state.settings.load_config() {
        Ok(config) => config,
        Err(error) => {
            eprintln!("Failed to load config: {error}");
            return;
        }
    };
    let locale = registry.resolve_locale(config.language_preference);
    let plugins = match registry.list_plugins() {
        Ok(plugins) => plugins,
        Err(error) => {
            eprintln!("Failed to list plugins: {error}");
            return;
        }
    };

    let engine = PluginEngine::new(app_state.settings.plugins_dir());
    let matched = match engine.match_first(&plugins, &selected_text, &locale) {
        Ok(matched) => matched,
        Err(error) => {
            eprintln!("Failed to run plugin matchers: {error}");
            return;
        }
    };

    let Some(matched) = matched else {
        return;
    };

    let selection_id = next_selection_id();
    let context = build_view_context(
        &matched.plugin,
        Some(matched.selected_text),
        matched.locale,
        config.language_preference,
        app.package_info().version.to_string(),
    );

    if let Ok(mut popup) = app_state.popup.lock() {
        popup.insert(PopupSelection {
            selection_id: selection_id.clone(),
            plugin: matched.plugin.clone(),
            context,
        });
    }

    if let Err(error) = show_selection_popup(&app, &selection_id, &matched.plugin, mouse_x, mouse_y) {
        eprintln!("Failed to show selection popup: {error}");
    }
}
```

- [ ] **Step 3: Wire Tauri builder in `lib.rs`**

Add these declarations near the existing module declarations:

```rust
mod selection_monitor;
mod tray;
```

Replace `src-tauri/src/lib.rs` run function with:

```rust
use tauri_plugin_opener::OpenerExt;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let builder = tauri::Builder::default();
    let builder = plugin_protocol::register_plugin_protocol(builder);

    builder
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(external_navigation_plugin())
        .setup(|app| {
            tray::setup_tray(app)?;
            let state = app_state::AppState::from_app(&app.handle().clone())
                .map_err(|error| tauri::Error::Anyhow(anyhow::anyhow!(error.to_string())))?;
            app.manage(state);
            selection_monitor::start_input_monitoring(app.handle().clone());
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::get_settings_snapshot,
            commands::set_language_preference,
            commands::import_plugin_folder,
            commands::set_plugin_enabled,
            commands::set_plugin_order,
            commands::remove_plugin,
            commands::get_popup_payload,
            commands::get_plugin_settings_payload,
            commands::plugin_storage_get,
            commands::plugin_storage_set,
            commands::plugin_storage_remove,
            commands::bridge_open_external,
            commands::bridge_close_popup
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
```

Also remove the existing `on_page_load` behavior that shows the main window automatically.

- [ ] **Step 4: Add anyhow if needed**

If the `tauri::Error::Anyhow` conversion requires `anyhow`, add to `src-tauri/Cargo.toml`:

```toml
anyhow = "1"
```

Use this exact conversion in `lib.rs`:

```rust
.map_err(|error| tauri::Error::Anyhow(anyhow::anyhow!(error.to_string())))?;
```

- [ ] **Step 5: Run Rust checks**

Run:

```bash
cargo check --manifest-path src-tauri/Cargo.toml
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src-tauri/src/tray.rs src-tauri/src/selection_monitor.rs src-tauri/src/lib.rs src-tauri/Cargo.toml src-tauri/Cargo.lock
git commit -m "feat: wire tray and selection monitoring"
```

## Task 11: Example Plugin And End-To-End Manual Path

**Files:**

- Create: `examples/plugins/quick-search/manifest.json`
- Create: `examples/plugins/quick-search/matcher.js`
- Create: `examples/plugins/quick-search/popup.html`
- Create: `examples/plugins/quick-search/settings.html`
- Modify: `README.md`

- [ ] **Step 1: Add example plugin manifest**

Create `examples/plugins/quick-search/manifest.json`:

```json
{
  "id": "quick-search",
  "name": {
    "zh-CN": "快速搜索",
    "en": "Quick Search"
  },
  "version": "0.1.0",
  "matcher": "matcher.js",
  "popup": {
    "entry": "popup.html",
    "width": 360,
    "height": 220
  },
  "settings": {
    "entry": "settings.html"
  },
  "permissions": {
    "openExternal": true,
    "storage": true
  }
}
```

- [ ] **Step 2: Add example matcher**

Create `examples/plugins/quick-search/matcher.js`:

```js
export function match(context) {
  return context.selectedText.trim().length > 0
}
```

- [ ] **Step 3: Add example popup**

Create `examples/plugins/quick-search/popup.html`:

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <style>
      * {
        box-sizing: border-box;
      }
      body {
        margin: 0;
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
        background: #ffffff;
        color: #101828;
      }
      main {
        display: flex;
        min-height: 100vh;
        flex-direction: column;
        gap: 12px;
        padding: 14px;
      }
      .text {
        min-height: 58px;
        overflow: hidden;
        border: 1px solid #d0d5dd;
        padding: 10px;
        font-size: 12px;
        line-height: 1.4;
      }
      .actions {
        display: flex;
        gap: 8px;
      }
      button {
        height: 32px;
        border: 1px solid #0f766e;
        background: #0f766e;
        color: #ffffff;
        padding: 0 10px;
        font-size: 12px;
        cursor: pointer;
      }
      button.secondary {
        border-color: #d0d5dd;
        background: #ffffff;
        color: #344054;
      }
    </style>
  </head>
  <body>
    <main>
      <div class="text" id="selected"></div>
      <div class="actions">
        <button id="search">Search</button>
        <button class="secondary" id="close">Close</button>
      </div>
    </main>
    <script>
      const selectedText = window.ohMySelect.context.selectedText || "";
      document.getElementById("selected").textContent = selectedText;
      document.getElementById("search").addEventListener("click", async () => {
        await window.ohMySelect.openExternal(
          `https://www.google.com/search?q=${encodeURIComponent(selectedText)}`,
        );
        await window.ohMySelect.closePopup();
      });
      document.getElementById("close").addEventListener("click", () => {
        window.ohMySelect.closePopup();
      });
    </script>
  </body>
</html>
```

- [ ] **Step 4: Add example settings page**

Create `examples/plugins/quick-search/settings.html`:

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <style>
      body {
        margin: 0;
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
        color: #101828;
      }
      main {
        display: grid;
        gap: 12px;
        padding: 24px;
      }
      label {
        display: grid;
        gap: 6px;
        font-size: 13px;
      }
      input {
        height: 34px;
        border: 1px solid #d0d5dd;
        padding: 0 10px;
      }
      button {
        width: fit-content;
        height: 32px;
        border: 1px solid #0f766e;
        background: #0f766e;
        color: #ffffff;
        padding: 0 12px;
        cursor: pointer;
      }
    </style>
  </head>
  <body>
    <main>
      <h1 id="title">Quick Search</h1>
      <label>
        Search engine URL
        <input id="engine" value="https://www.google.com/search?q=" />
      </label>
      <button id="save">Save</button>
    </main>
    <script>
      const input = document.getElementById("engine");
      const title = document.getElementById("title");
      if (window.ohMySelect.context.locale === "zh-CN") {
        title.textContent = "快速搜索";
      }
      window.ohMySelect.storage.get("engine").then((value) => {
        if (typeof value === "string") input.value = value;
      });
      document.getElementById("save").addEventListener("click", () => {
        window.ohMySelect.storage.set("engine", input.value);
      });
    </script>
  </body>
</html>
```

- [ ] **Step 5: Update README with development instructions**

Append to `README.md`:

````markdown
## Development

Run the desktop app:

```bash
bun run tauri dev
```

The app starts hidden in the system tray. Click the tray icon to open Settings.

## Example plugin

An example local plugin lives at:

```text
examples/plugins/quick-search
```

Open Settings, import that folder, select text in another application, and the plugin popup should appear near the cursor.
````

- [ ] **Step 6: Run full static checks**

Run:

```bash
bun run typecheck
bun run lint
cargo test --manifest-path src-tauri/Cargo.toml
cargo check --manifest-path src-tauri/Cargo.toml
```

Expected: all commands pass.

- [ ] **Step 7: Commit**

```bash
git add examples/plugins/quick-search README.md
git commit -m "docs: add quick search example plugin"
```

## Task 12: Final Verification

**Files:**

- Modify only files needed to fix verification failures discovered in this task.

- [ ] **Step 1: Run frontend build**

Run:

```bash
bun run build
```

Expected: build succeeds and writes the frontend output used by Tauri.

- [ ] **Step 2: Run Tauri dev app**

Run:

```bash
bun run tauri dev
```

Expected:

- The app starts without showing the settings window.
- A tray icon appears.
- Clicking the tray icon opens the settings window.

- [ ] **Step 3: Import example plugin**

In Settings:

- Click Import Plugin.
- Choose `/Users/hanjiedeng/Desktop/oh-my-select/examples/plugins/quick-search`.
- Verify Quick Search appears in the plugin section.
- Click Quick Search in the sidebar.
- Verify its settings page renders in the main area.

- [ ] **Step 4: Verify language switching**

In System Settings:

- Set language to Chinese.
- Verify host labels switch to Chinese.
- Click Quick Search.
- Verify the plugin settings page receives `locale` and switches its title to `快速搜索`.
- Set language to English.
- Verify host labels switch back to English.

- [ ] **Step 5: Verify selection popup**

Grant macOS Accessibility permission if prompted, then:

- Select text by dragging in another app.
- Verify the Quick Search popup opens near the cursor.
- Verify the popup shows the selected text.
- Click Search and verify the browser opens an external search URL.
- Select unmatched text only after disabling the plugin and verify no popup appears.

- [ ] **Step 6: Verify edge positioning**

Move the cursor near the right and bottom display edges, select text, and verify the popup stays fully on-screen.

- [ ] **Step 7: Run final command suite**

Run:

```bash
bun run typecheck
bun run lint
bun run build
cargo test --manifest-path src-tauri/Cargo.toml
cargo check --manifest-path src-tauri/Cargo.toml
```

Expected: all commands pass.

- [ ] **Step 8: Commit final fixes**

If Step 7 required fixes:

```bash
git add .
git commit -m "fix: stabilize plugin popup verification"
```

If Step 7 required no fixes, do not create an empty commit.

## Self-Review Notes

- Spec coverage: tasks cover tray startup, settings window, folder import, order/enabled state, synchronous matching, plugin popup view, plugin settings view, bridge methods, locale propagation, no-match silence, and manual edge-position verification.
- Type consistency: Rust uses `LanguagePreference`, `InstalledPlugin`, `PluginViewContext`, `PopupPayload`, and `PluginSettingsPayload`; TypeScript mirrors those names in camelCase.
- Execution order: backend persistence and registry land before commands; commands land before frontend API wrappers; popup context and protocol land before popup host route; tray and monitor are wired after all called modules exist.
