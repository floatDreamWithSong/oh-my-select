use crate::models::{InstalledPlugin, LanguagePreference, PluginConfigEntry, PluginManifest};
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

        let final_dir = self.plugin_dir(&manifest.id);
        let temp_dir = self
            .settings
            .plugins_dir()
            .join(format!(".importing-{}", manifest.id));

        remove_path_if_exists(&temp_dir)?;
        if final_dir.exists() {
            return Err(PluginRegistryError::DuplicateId(manifest.id));
        }

        if let Err(error) = copy_dir_all(source, &temp_dir) {
            let _ = remove_path_if_exists(&temp_dir);
            return Err(error.into());
        }

        if let Err(error) = fs::rename(&temp_dir, &final_dir) {
            let _ = remove_path_if_exists(&temp_dir);
            return Err(error.into());
        }

        let mut config = match self.settings.load_config() {
            Ok(config) => config,
            Err(error) => {
                let _ = remove_path_if_exists(&final_dir);
                return Err(error.into());
            }
        };
        config.plugins.push(PluginConfigEntry {
            id: manifest.id.clone(),
            enabled: true,
        });
        if let Err(error) = self.settings.save_config(&config) {
            let _ = remove_path_if_exists(&final_dir);
            return Err(error.into());
        }

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
        let existing: HashSet<String> = config
            .plugins
            .iter()
            .map(|entry| entry.id.clone())
            .collect();
        let incoming: HashSet<String> = ids.iter().cloned().collect();
        if ids.len() != config.plugins.len() || incoming.len() != ids.len() || existing != incoming
        {
            return Err(PluginRegistryError::MissingPlugin(
                "order mismatch".to_string(),
            ));
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

        let final_dir = self.plugin_dir(id);
        let temp_dir = self.settings.plugins_dir().join(format!(".removing-{id}"));
        let moved_plugin_dir = final_dir.exists();

        if moved_plugin_dir {
            remove_path_if_exists(&temp_dir)?;
            fs::rename(&final_dir, &temp_dir)?;
        }

        if let Err(error) = self.settings.save_config(&config) {
            if moved_plugin_dir && temp_dir.exists() && !final_dir.exists() {
                let _ = fs::rename(&temp_dir, &final_dir);
            }
            return Err(error.into());
        }

        if moved_plugin_dir {
            fs::remove_dir_all(temp_dir)?;
        }
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
            ensure_required_file(plugin_dir, path)?;
        }

        if let Some(settings) = &manifest.settings {
            ensure_required_file(plugin_dir, &settings.entry)?;
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
            .map(|settings| is_regular_file(&self.plugin_dir(&manifest.id).join(&settings.entry)))
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
    let valid = !path.is_empty()
        && !path_buf.is_absolute()
        && path_buf
            .components()
            .all(|component| matches!(component, Component::Normal(_)));
    if valid {
        Ok(())
    } else {
        Err(PluginRegistryError::InvalidRelativePath(path.to_string()))
    }
}

fn ensure_required_file(plugin_dir: &Path, path: &str) -> Result<(), PluginRegistryError> {
    if is_regular_file(&plugin_dir.join(path)) {
        Ok(())
    } else {
        Err(PluginRegistryError::MissingFile(path.to_string()))
    }
}

fn is_regular_file(path: &Path) -> bool {
    fs::symlink_metadata(path)
        .map(|metadata| metadata.file_type().is_file())
        .unwrap_or(false)
}

fn remove_path_if_exists(path: &Path) -> io::Result<()> {
    match fs::symlink_metadata(path) {
        Ok(metadata) => {
            if metadata.file_type().is_dir() {
                fs::remove_dir_all(path)
            } else {
                fs::remove_file(path)
            }
        }
        Err(error) if error.kind() == io::ErrorKind::NotFound => Ok(()),
        Err(error) => Err(error),
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
        fs::write(
            dir.join("matcher.js"),
            "export function match() { return true }",
        )
        .unwrap();
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
        assert!(registry
            .plugin_dir("quick-search")
            .join("popup.html")
            .exists());
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
    fn duplicate_import_cleans_stale_temp_without_removing_installed_plugin() {
        let source_root = temp_dir("dup-temp-source");
        let app_root = temp_dir("dup-temp-app");
        let first = write_plugin(&source_root, "quick-search", false);
        let second = write_plugin(&source_root, "quick-search-copy", false);
        fs::write(
            second.join("manifest.json"),
            fs::read_to_string(first.join("manifest.json")).unwrap(),
        )
        .unwrap();
        let registry = PluginRegistry::new(SettingsManager::new(app_root.clone()));
        registry.import_folder(&first).unwrap();
        let temp_dir = app_root.join("plugins").join(".importing-quick-search");
        fs::create_dir_all(&temp_dir).unwrap();
        fs::write(temp_dir.join("stale.txt"), "stale").unwrap();

        let error = registry.import_folder(&second).unwrap_err();

        assert!(matches!(error, PluginRegistryError::DuplicateId(id) if id == "quick-search"));
        assert!(!temp_dir.exists());
        assert!(registry
            .plugin_dir("quick-search")
            .join("popup.html")
            .exists());
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
        registry
            .set_plugin_order(vec!["second".to_string(), "first".to_string()])
            .unwrap();
        registry.set_enabled("first", false).unwrap();

        let plugins = registry.list_plugins().unwrap();

        assert_eq!(plugins[0].id, "second");
        assert_eq!(plugins[1].id, "first");
        assert!(!plugins[1].enabled);
        assert_eq!(registry.resolve_locale(LanguagePreference::En), "en");
    }

    #[test]
    fn rejects_duplicate_plugin_order_ids() {
        let source_root = temp_dir("duplicate-order-source");
        let app_root = temp_dir("duplicate-order-app");
        let first = write_plugin(&source_root, "first", false);
        let second = write_plugin(&source_root, "second", false);
        let registry = PluginRegistry::new(SettingsManager::new(app_root));

        registry.import_folder(&first).unwrap();
        registry.import_folder(&second).unwrap();

        let error = registry
            .set_plugin_order(vec!["first".to_string(), "first".to_string()])
            .unwrap_err();
        let plugins = registry.list_plugins().unwrap();

        assert!(matches!(
            error,
            PluginRegistryError::MissingPlugin(message) if message == "order mismatch"
        ));
        assert_eq!(plugins[0].id, "first");
        assert_eq!(plugins[1].id, "second");
    }

    #[test]
    fn rejects_empty_matcher_path() {
        let source_root = temp_dir("empty-matcher-source");
        let app_root = temp_dir("empty-matcher-app");
        let source = write_plugin(&source_root, "empty-matcher", false);
        let manifest = fs::read_to_string(source.join("manifest.json"))
            .unwrap()
            .replace("\"matcher\": \"matcher.js\"", "\"matcher\": \"\"");
        fs::write(source.join("manifest.json"), manifest).unwrap();
        let registry = PluginRegistry::new(SettingsManager::new(app_root));

        let error = registry.import_folder(&source).unwrap_err();

        assert!(matches!(error, PluginRegistryError::InvalidRelativePath(path) if path.is_empty()));
    }

    #[test]
    fn rejects_directory_popup_entry() {
        let source_root = temp_dir("directory-popup-source");
        let app_root = temp_dir("directory-popup-app");
        let source = write_plugin(&source_root, "directory-popup", false);
        fs::remove_file(source.join("popup.html")).unwrap();
        fs::create_dir(source.join("popup.html")).unwrap();
        let registry = PluginRegistry::new(SettingsManager::new(app_root));

        let error = registry.import_folder(&source).unwrap_err();

        assert!(matches!(
            error,
            PluginRegistryError::MissingFile(path) if path == "popup.html"
        ));
    }

    #[cfg(unix)]
    #[test]
    fn rejects_symlink_popup_entry() {
        use std::os::unix::fs::symlink;

        let source_root = temp_dir("symlink-popup-source");
        let app_root = temp_dir("symlink-popup-app");
        let source = write_plugin(&source_root, "symlink-popup", false);
        fs::remove_file(source.join("popup.html")).unwrap();
        symlink(source.join("matcher.js"), source.join("popup.html")).unwrap();
        let registry = PluginRegistry::new(SettingsManager::new(app_root));

        let error = registry.import_folder(&source).unwrap_err();

        assert!(matches!(
            error,
            PluginRegistryError::MissingFile(path) if path == "popup.html"
        ));
    }

    #[test]
    fn cleans_imported_directory_if_config_save_fails() {
        let source_root = temp_dir("save-failure-source");
        let app_root = temp_dir("save-failure-app");
        let source = write_plugin(&source_root, "save-failure", false);
        let registry = PluginRegistry::new(SettingsManager::new(app_root.clone()));
        fs::create_dir_all(app_root.join("config.tmp")).unwrap();

        let error = registry.import_folder(&source).unwrap_err();

        assert!(matches!(error, PluginRegistryError::Settings(_)));
        assert!(!registry.plugin_dir("save-failure").exists());
        assert!(!app_root
            .join("plugins")
            .join(".importing-save-failure")
            .exists());
    }

    #[test]
    fn cleans_imported_directory_if_config_load_fails_after_rename() {
        let source_root = temp_dir("load-failure-source");
        let app_root = temp_dir("load-failure-app");
        let source = write_plugin(&source_root, "load-failure", false);
        let registry = PluginRegistry::new(SettingsManager::new(app_root.clone()));
        fs::create_dir_all(app_root.join("plugins")).unwrap();
        fs::write(app_root.join("config.json"), "{ broken json").unwrap();

        let error = registry.import_folder(&source).unwrap_err();

        assert!(matches!(error, PluginRegistryError::Settings(_)));
        assert!(!registry.plugin_dir("load-failure").exists());
        assert!(!app_root
            .join("plugins")
            .join(".importing-load-failure")
            .exists());
    }

    #[test]
    fn cleans_stale_import_temp_directory_before_import() {
        let source_root = temp_dir("stale-temp-source");
        let app_root = temp_dir("stale-temp-app");
        let source = write_plugin(&source_root, "stale-temp", false);
        let registry = PluginRegistry::new(SettingsManager::new(app_root.clone()));
        let temp_dir = app_root.join("plugins").join(".importing-stale-temp");
        fs::create_dir_all(&temp_dir).unwrap();
        fs::write(temp_dir.join("stale.txt"), "stale").unwrap();

        registry.import_folder(&source).unwrap();

        assert!(registry
            .plugin_dir("stale-temp")
            .join("popup.html")
            .exists());
        assert!(!temp_dir.exists());
    }

    #[test]
    fn keeps_plugin_directory_if_remove_config_save_fails() {
        let source_root = temp_dir("remove-save-failure-source");
        let app_root = temp_dir("remove-save-failure-app");
        let source = write_plugin(&source_root, "remove-save-failure", false);
        let registry = PluginRegistry::new(SettingsManager::new(app_root.clone()));
        registry.import_folder(&source).unwrap();
        fs::create_dir_all(app_root.join("config.tmp")).unwrap();

        let error = registry.remove_plugin("remove-save-failure").unwrap_err();

        assert!(matches!(error, PluginRegistryError::Settings(_)));
        assert!(registry.plugin_dir("remove-save-failure").exists());
        assert!(!app_root
            .join("plugins")
            .join(".removing-remove-save-failure")
            .exists());

        fs::remove_dir_all(app_root.join("config.tmp")).unwrap();
        registry.remove_plugin("remove-save-failure").unwrap();

        assert!(!registry.plugin_dir("remove-save-failure").exists());
    }
}
