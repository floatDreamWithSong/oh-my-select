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

    pub fn storage_get(&self, plugin_id: &str, key: &str) -> Result<Option<Value>, SettingsError> {
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

    fn write_storage(&self, plugin_id: &str, map: &PluginStorageMap) -> Result<(), SettingsError> {
        self.ensure_dirs()?;
        let path = self.storage_path(plugin_id);
        fs::write(path, serde_json::to_string_pretty(map)?)?;
        Ok(())
    }
}

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
