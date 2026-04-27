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
            plugin(
                &root,
                "first",
                "export function match() { return false }",
                true,
            ),
            plugin(
                &root,
                "second",
                "export function match(context) { return context.selectedText === 'hello' }",
                true,
            ),
            plugin(
                &root,
                "third",
                "export function match() { return true }",
                true,
            ),
        ];
        let engine = PluginEngine::new(root);

        let matched = engine
            .match_first(&plugins, "hello", "en")
            .unwrap()
            .unwrap();

        assert_eq!(matched.plugin.id, "second");
    }

    #[test]
    fn skips_disabled_plugins() {
        let root = temp_dir("disabled");
        let plugins = vec![
            plugin(
                &root,
                "disabled",
                "export function match() { return true }",
                false,
            ),
            plugin(
                &root,
                "enabled",
                "export function match() { return true }",
                true,
            ),
        ];
        let engine = PluginEngine::new(root);

        let matched = engine
            .match_first(&plugins, "hello", "en")
            .unwrap()
            .unwrap();

        assert_eq!(matched.plugin.id, "enabled");
    }

    #[test]
    fn continues_after_matcher_error() {
        let root = temp_dir("error");
        let plugins = vec![
            plugin(
                &root,
                "broken",
                "export function match() { throw new Error('bad') }",
                true,
            ),
            plugin(
                &root,
                "working",
                "export function match() { return true }",
                true,
            ),
        ];
        let engine = PluginEngine::new(root);

        let matched = engine
            .match_first(&plugins, "hello", "en")
            .unwrap()
            .unwrap();

        assert_eq!(matched.plugin.id, "working");
    }

    #[test]
    fn returns_none_when_no_plugin_matches() {
        let root = temp_dir("none");
        let plugins = vec![plugin(
            &root,
            "first",
            "export function match() { return false }",
            true,
        )];
        let engine = PluginEngine::new(root);

        let matched = engine.match_first(&plugins, "hello", "en").unwrap();

        assert!(matched.is_none());
    }
}
