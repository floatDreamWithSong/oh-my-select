use crate::app_state::AppState;
use crate::models::{InstalledPlugin, PluginViewContext};
use crate::plugin_engine::build_view_context;
use crate::plugin_registry::{PluginRegistry, PluginRegistryError};
use crate::popup_manager::PopupSelection;
use crate::settings_manager::SettingsError;
use std::fs;
use std::path::{Component, Path, PathBuf};
use std::sync::{Arc, Mutex};
use tauri::http::{self, header::CONTENT_TYPE, StatusCode};
use tauri::Manager;
use thiserror::Error;
use url::Url;

#[derive(Debug, Error)]
pub enum PluginProtocolError {
    #[error("failed to serialize plugin bridge context: {0}")]
    Json(#[from] serde_json::Error),
    #[error("failed to parse plugin uri: {0}")]
    Url(#[from] url::ParseError),
    #[error("failed to decode plugin path: {0}")]
    Decode(#[from] std::string::FromUtf8Error),
    #[error("plugin id is missing")]
    MissingPluginId,
    #[error("plugin id is invalid")]
    InvalidPluginId,
    #[error("plugin file path is invalid")]
    InvalidPath,
    #[error("plugin state is unavailable")]
    MissingState,
    #[error("plugin is not installed: {0}")]
    MissingPlugin(String),
    #[error("failed to access plugin registry: {0}")]
    Registry(#[from] PluginRegistryError),
    #[error("failed to access settings: {0}")]
    Settings(#[from] SettingsError),
    #[error("failed to access plugin file: {0}")]
    Io(#[from] std::io::Error),
    #[error("failed to build plugin protocol response: {0}")]
    Http(#[from] http::Error),
    #[error("plugin entry is not an HTML document")]
    NotHtml,
}

#[derive(Debug)]
struct PluginProtocolRequest {
    plugin_id: String,
    file_path: PathBuf,
    content_path: String,
    view_kind: String,
    selection_id: Option<String>,
    bridge_session: Option<String>,
}

pub fn register_plugin_protocol<R: tauri::Runtime>(
    builder: tauri::Builder<R>,
) -> tauri::Builder<R> {
    builder.register_asynchronous_uri_scheme_protocol("oms-plugin", |ctx, request, responder| {
        let app = ctx.app_handle().clone();
        let uri = request.uri().to_string();
        tauri::async_runtime::spawn_blocking(move || {
            let response =
                handle_plugin_protocol_request(&app, &uri).unwrap_or_else(error_response);
            responder.respond(response);
        });
    })
}

pub fn content_type_for_path(path: &str) -> &'static str {
    match mime_guess::from_path(path).first_raw() {
        Some("text/html") => "text/html; charset=utf-8",
        Some(content_type) => content_type,
        None => "application/octet-stream",
    }
}

pub fn inject_bridge(
    html: &str,
    context: &PluginViewContext,
    view_kind: &str,
    bridge_session: Option<&str>,
) -> Result<String, PluginProtocolError> {
    let context_json = serde_json::to_string(context)?;
    let view_kind_json = serde_json::to_string(view_kind)?;
    let bridge_session_json = serde_json::to_string(&bridge_session)?;
    let script = format!(
        r#"<script>
(() => {{
  const context = {context_json};
  const viewKind = {view_kind_json};
  const bridgeSession = {bridge_session_json};
  let nextMessageId = 1;
  const pending = new Map();

  function callHost(method, args) {{
    const id = `${{Date.now()}}-${{nextMessageId++}}`;
    return new Promise((resolve, reject) => {{
      pending.set(id, {{ resolve, reject }});
      window.parent.postMessage({{
        source: "oh-my-select-plugin",
        id,
        pluginId: context.pluginId,
        viewKind,
        bridgeSession,
        method,
        args
      }}, "*");
    }});
  }}

  window.addEventListener("message", (event) => {{
    const message = event.data;
    if (!message || message.source !== "oh-my-select-host" || !pending.has(message.id)) {{
      return;
    }}

    const callbacks = pending.get(message.id);
    pending.delete(message.id);
    if (message.ok) {{
      callbacks.resolve(message.value);
    }} else {{
      callbacks.reject(new Error(message.error || "Plugin host request failed"));
    }}
  }});

  window.ohMySelect = {{
    context,
    closePopup() {{
      return callHost("closePopup", []);
    }},
    openExternal(url) {{
      return callHost("openExternal", [url]);
    }},
    storage: {{
      get(key) {{
        return callHost("storage.get", [key]);
      }},
      set(key, value) {{
        return callHost("storage.set", [key, value]);
      }},
      remove(key) {{
        return callHost("storage.remove", [key]);
      }}
    }}
  }};
}})();
</script>
"#
    );

    if let Some(index) = html.to_ascii_lowercase().find("</head>") {
        let mut injected = String::with_capacity(html.len() + script.len());
        injected.push_str(&html[..index]);
        injected.push_str(&script);
        injected.push_str(&html[index..]);
        Ok(injected)
    } else {
        Ok(format!("{script}{html}"))
    }
}

fn handle_plugin_protocol_request<R: tauri::Runtime>(
    app: &tauri::AppHandle<R>,
    uri: &str,
) -> Result<http::Response<Vec<u8>>, PluginProtocolError> {
    let resource = load_plugin_resource(app, uri, false)?;

    response(StatusCode::OK, resource.content_type, resource.body)
}

pub fn plugin_view_html_for_entry_url<R: tauri::Runtime>(
    app: &tauri::AppHandle<R>,
    entry_url: &str,
) -> Result<String, PluginProtocolError> {
    let resource = load_plugin_resource(app, entry_url, true)?;
    if !resource.content_type.starts_with("text/html") {
        return Err(PluginProtocolError::NotHtml);
    }

    String::from_utf8(resource.body).map_err(PluginProtocolError::Decode)
}

struct PluginResource {
    content_type: &'static str,
    body: Vec<u8>,
}

fn load_plugin_resource<R: tauri::Runtime>(
    app: &tauri::AppHandle<R>,
    uri: &str,
    inline_local_scripts: bool,
) -> Result<PluginResource, PluginProtocolError> {
    let request = parse_plugin_protocol_uri(uri)?;
    let (settings, popup) = {
        let state = app
            .try_state::<AppState>()
            .ok_or(PluginProtocolError::MissingState)?;
        (state.settings.clone(), state.popup.clone())
    };
    let registry = PluginRegistry::new(settings.clone());
    let plugin = installed_plugin_for_request(&registry, &request.plugin_id)?;
    let plugin_dir = registry.plugin_dir(&request.plugin_id);
    let file_path = resolve_plugin_file_path(&plugin_dir, &request.file_path)?;
    let content_type = content_type_for_path(&request.content_path);

    let body = if content_type.starts_with("text/html") {
        let popup_selection = if request.view_kind == "popup" {
            request.selection_id.as_deref().and_then(|selection_id| {
                matching_popup_selection(&popup, selection_id, &request.plugin_id)
            })
        } else {
            None
        };
        let selected_text = popup_selection
            .as_ref()
            .and_then(|selection| selection.context.selected_text.clone());
        let config = settings.load_config()?;
        let locale = registry.resolve_locale(config.language_preference);
        let context = build_view_context(
            &plugin,
            selected_text,
            locale,
            config.language_preference,
            app.package_info().version.to_string(),
        );
        let html = fs::read_to_string(&file_path)?;
        let html = if inline_local_scripts {
            inline_script_src_tags(&html, &plugin_dir, &request.file_path)?
        } else {
            html
        };
        let body = inject_bridge(
            &html,
            &context,
            &request.view_kind,
            request.bridge_session.as_deref(),
        )?
        .into_bytes();
        body
    } else {
        fs::read(file_path)?
    };

    Ok(PluginResource { content_type, body })
}

fn matching_popup_selection(
    popup: &Arc<Mutex<crate::popup_manager::PopupRuntimeState>>,
    selection_id: &str,
    plugin_id: &str,
) -> Option<PopupSelection> {
    let state = popup.lock().ok()?;
    let selection = state.get(selection_id)?;
    (selection.plugin.id == plugin_id).then_some(selection)
}

fn inline_script_src_tags(
    html: &str,
    plugin_dir: &Path,
    html_path: &Path,
) -> Result<String, PluginProtocolError> {
    let mut output = String::with_capacity(html.len());
    let mut remaining = html;

    loop {
        let Some(script_start) = remaining.to_ascii_lowercase().find("<script") else {
            output.push_str(remaining);
            return Ok(output);
        };
        output.push_str(&remaining[..script_start]);
        remaining = &remaining[script_start..];

        let Some(open_end) = remaining.find('>') else {
            output.push_str(remaining);
            return Ok(output);
        };
        let open_tag = &remaining[..=open_end];
        let Some(src) = script_src_attr(open_tag) else {
            output.push_str(open_tag);
            remaining = &remaining[open_end + 1..];
            continue;
        };

        let Some(close_start) = remaining[open_end + 1..]
            .to_ascii_lowercase()
            .find("</script>")
            .map(|index| open_end + 1 + index)
        else {
            output.push_str(open_tag);
            remaining = &remaining[open_end + 1..];
            continue;
        };
        let close_end = close_start + "</script>".len();

        if let Some(script_path) = local_script_path(html_path, &src) {
            let script_file = resolve_plugin_file_path(plugin_dir, &script_path)?;
            let script = fs::read_to_string(script_file)?;
            output.push_str("<script>");
            output.push_str(&script.replace("</script>", "<\\/script>"));
            output.push_str("</script>");
        } else {
            output.push_str(&remaining[..close_end]);
        }

        remaining = &remaining[close_end..];
    }
}

fn script_src_attr(script_open_tag: &str) -> Option<String> {
    for quote in ['"', '\''] {
        for prefix in [format!(" src={quote}"), format!("\tsrc={quote}")] {
            if let Some(start) = script_open_tag.find(&prefix) {
                let value_start = start + prefix.len();
                let value_end = script_open_tag[value_start..].find(quote)? + value_start;
                return Some(script_open_tag[value_start..value_end].to_string());
            }
        }
    }

    None
}

fn local_script_path(html_path: &Path, src: &str) -> Option<PathBuf> {
    if src.starts_with("http:")
        || src.starts_with("https:")
        || src.starts_with("data:")
        || src.starts_with("blob:")
        || src.starts_with("javascript:")
        || src.starts_with('/')
        || src.contains('\\')
    {
        return None;
    }

    let path_without_query = src.split(['?', '#']).next()?;
    let html_dir = html_path.parent().unwrap_or_else(|| Path::new(""));
    let script_path = html_dir.join(path_without_query);
    sanitize_plugin_file_path(&path_to_forward_slash(&script_path)?)
}

fn path_to_forward_slash(path: &Path) -> Option<String> {
    let mut parts = Vec::new();
    for component in path.components() {
        match component {
            Component::Normal(part) => parts.push(part.to_str()?),
            Component::CurDir => {}
            _ => return None,
        }
    }
    Some(parts.join("/"))
}

fn installed_plugin_for_request(
    registry: &PluginRegistry,
    plugin_id: &str,
) -> Result<InstalledPlugin, PluginProtocolError> {
    registry
        .list_plugins()?
        .into_iter()
        .find(|plugin| plugin.id == plugin_id)
        .ok_or_else(|| PluginProtocolError::MissingPlugin(plugin_id.to_string()))
}

fn parse_plugin_protocol_uri(uri: &str) -> Result<PluginProtocolRequest, PluginProtocolError> {
    let url = Url::parse(uri)?;
    if url.host_str() != Some("localhost") {
        return Err(PluginProtocolError::InvalidPluginId);
    }
    let raw_path = raw_plugin_path_from_uri(uri).ok_or(PluginProtocolError::InvalidPath)?;
    let decoded_path = urlencoding::decode(raw_path)?.into_owned();
    let (plugin_id, decoded_path) = decoded_path
        .split_once('/')
        .filter(|(plugin_id, path)| !plugin_id.is_empty() && !path.is_empty())
        .ok_or(PluginProtocolError::InvalidPath)?;
    let plugin_id = plugin_id.to_string();
    if !is_valid_plugin_id(&plugin_id) {
        return Err(PluginProtocolError::InvalidPluginId);
    }
    let decoded_path = decoded_path.to_string();
    let file_path =
        sanitize_plugin_file_path(&decoded_path).ok_or(PluginProtocolError::InvalidPath)?;
    let view_kind = url
        .query_pairs()
        .find_map(|(key, value)| (key == "viewKind").then(|| value.into_owned()))
        .filter(|value| !value.is_empty())
        .unwrap_or_else(|| "settings".to_string());
    let selection_id = url
        .query_pairs()
        .find_map(|(key, value)| (key == "selectionId").then(|| value.into_owned()))
        .filter(|value| !value.is_empty());
    let bridge_session = url
        .query_pairs()
        .find_map(|(key, value)| (key == "bridgeSession").then(|| value.into_owned()))
        .filter(|value| !value.is_empty());

    Ok(PluginProtocolRequest {
        plugin_id,
        file_path,
        content_path: decoded_path,
        view_kind,
        selection_id,
        bridge_session,
    })
}

fn raw_plugin_path_from_uri(uri: &str) -> Option<&str> {
    let rest = uri.split_once("://")?.1;
    let raw_path = rest.split_once('/')?.1;
    let query_start = raw_path.find(['?', '#']).unwrap_or(raw_path.len());
    Some(&raw_path[..query_start])
}

fn sanitize_plugin_file_path(path: &str) -> Option<PathBuf> {
    if path.is_empty()
        || path.contains('\\')
        || path.contains('\0')
        || path
            .split('/')
            .any(|segment| segment.is_empty() || segment.contains(':'))
    {
        return None;
    }

    let path = PathBuf::from(path);
    if path.is_absolute()
        || !path
            .components()
            .all(|component| matches!(component, Component::Normal(_)))
    {
        return None;
    }

    Some(path)
}

fn is_valid_plugin_id(plugin_id: &str) -> bool {
    !plugin_id.is_empty()
        && plugin_id
            .chars()
            .all(|ch| ch.is_ascii_lowercase() || ch.is_ascii_digit() || ch == '-')
}

fn resolve_plugin_file_path(
    plugin_dir: &Path,
    relative_path: &Path,
) -> Result<PathBuf, PluginProtocolError> {
    let plugin_dir = plugin_dir.canonicalize()?;
    let file_path = plugin_dir.join(relative_path).canonicalize()?;
    if file_path.starts_with(&plugin_dir) {
        Ok(file_path)
    } else {
        Err(PluginProtocolError::InvalidPath)
    }
}

fn response(
    status: StatusCode,
    content_type: &'static str,
    body: Vec<u8>,
) -> Result<http::Response<Vec<u8>>, PluginProtocolError> {
    Ok(http::Response::builder()
        .status(status)
        .header(CONTENT_TYPE, content_type)
        .body(body)?)
}

fn error_response(error: PluginProtocolError) -> http::Response<Vec<u8>> {
    response(
        StatusCode::BAD_REQUEST,
        "text/plain; charset=utf-8",
        error.to_string().into_bytes(),
    )
    .expect("failed to build plugin protocol error response")
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::models::{
        AppConfig, InstalledPlugin, LanguagePreference, LocalizedText, PluginManifest,
        PluginPermissions, PluginViewContext, PopupManifest,
    };
    use crate::popup_manager::{PopupRuntimeState, PopupSelection};
    use crate::settings_manager::SettingsManager;
    use std::fs;
    use std::path::PathBuf;

    fn temp_dir(name: &str) -> PathBuf {
        let path = std::env::temp_dir().join(format!(
            "oh-my-select-protocol-test-{}-{}",
            name,
            std::process::id()
        ));
        let _ = fs::remove_dir_all(&path);
        fs::create_dir_all(&path).unwrap();
        path
    }

    fn plugin(id: &str) -> InstalledPlugin {
        InstalledPlugin {
            id: id.to_string(),
            manifest: PluginManifest {
                id: id.to_string(),
                name: LocalizedText {
                    zh_cn: None,
                    en: Some("Test Plugin".to_string()),
                },
                version: "0.1.0".to_string(),
                matcher: "matcher.js".to_string(),
                popup: PopupManifest {
                    entry: "popup.html".to_string(),
                    width: 320,
                    height: 240,
                },
                settings: None,
                permissions: PluginPermissions::default(),
            },
            enabled: true,
            has_settings: false,
        }
    }

    fn popup_selection(selection_id: &str, plugin: InstalledPlugin) -> PopupSelection {
        PopupSelection {
            selection_id: selection_id.to_string(),
            plugin: plugin.clone(),
            context: PluginViewContext {
                selected_text: Some("selected".to_string()),
                locale: "en".to_string(),
                language_preference: LanguagePreference::En,
                plugin_id: plugin.id,
                plugin_version: "0.1.0".to_string(),
                app_version: "0.1.0".to_string(),
            },
        }
    }

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

        let injected = inject_bridge(html, &context, "popup", Some("session-1")).unwrap();

        assert!(injected.contains("window.ohMySelect"));
        assert!(injected.contains("\"selectedText\":\"hello\""));
        assert!(injected.contains("const bridgeSession = \"session-1\";"));
        assert!(injected.contains("bridgeSession,"));
        assert!(injected.find("window.ohMySelect").unwrap() < injected.find("</head>").unwrap());
    }

    #[test]
    fn prepends_bridge_when_head_close_is_missing() {
        let html = "<main>Body</main>";
        let context = PluginViewContext {
            selected_text: None,
            locale: "en".to_string(),
            language_preference: LanguagePreference::En,
            plugin_id: "quick-search".to_string(),
            plugin_version: "0.1.0".to_string(),
            app_version: "0.1.0".to_string(),
        };

        let injected = inject_bridge(html, &context, "settings", None).unwrap();

        assert!(injected.starts_with("<script>"));
        assert!(injected.contains("window.ohMySelect"));
        assert!(injected.contains("const bridgeSession = null;"));
        assert!(injected.ends_with(html));
    }

    #[test]
    fn parses_bridge_session_from_query() {
        let request = parse_plugin_protocol_uri(
            "oms-plugin://localhost/quick-search/popup.html?viewKind=popup&selectionId=1&bridgeSession=session-1",
        )
        .unwrap();

        assert_eq!(request.plugin_id, "quick-search");
        assert_eq!(request.file_path, PathBuf::from("popup.html"));
        assert_eq!(request.bridge_session, Some("session-1".to_string()));
    }

    #[test]
    fn parses_plugin_asset_request_from_path() {
        let request =
            parse_plugin_protocol_uri("oms-plugin://localhost/color-converter/color-core.js")
                .unwrap();

        assert_eq!(request.plugin_id, "color-converter");
        assert_eq!(request.file_path, PathBuf::from("color-core.js"));
        assert_eq!(request.content_path, "color-core.js");
    }

    #[test]
    fn inlines_local_script_src_tags_for_srcdoc_views() {
        let root = temp_dir("inline-scripts");
        let plugin_dir = root.join("plugin");
        fs::create_dir_all(&plugin_dir).unwrap();
        fs::write(
            plugin_dir.join("core.js"),
            "window.PluginCore = { ok: true };\n",
        )
        .unwrap();
        let html = r#"<body><script src="./core.js"></script><script>window.ready = true;</script></body>"#;

        let inlined =
            inline_script_src_tags(html, &plugin_dir, &PathBuf::from("popup.html")).unwrap();

        assert!(inlined.contains("<script>window.PluginCore = { ok: true };\n</script>"));
        assert!(!inlined.contains(r#"src="./core.js""#));
        assert!(inlined.contains("<script>window.ready = true;</script>"));
    }

    #[test]
    fn resolves_local_script_src_tags_relative_to_html_directory() {
        let root = temp_dir("inline-nested-scripts");
        let plugin_dir = root.join("plugin");
        fs::create_dir_all(plugin_dir.join("nested")).unwrap();
        fs::write(
            plugin_dir.join("nested").join("core.js"),
            "window.nested = true;",
        )
        .unwrap();

        let inlined = inline_script_src_tags(
            r#"<script src="./core.js"></script>"#,
            &plugin_dir,
            &PathBuf::from("nested/popup.html"),
        )
        .unwrap();

        assert!(inlined.contains("window.nested = true;"));
    }

    #[test]
    fn detects_content_type_from_path() {
        assert_eq!(
            content_type_for_path("popup.html"),
            "text/html; charset=utf-8"
        );
        assert_eq!(content_type_for_path("color-core.js"), "text/javascript");
        assert_eq!(content_type_for_path("style.css"), "text/css");
        assert_eq!(content_type_for_path("icon.png"), "image/png");
    }

    #[test]
    fn rejects_traversal_plugin_file_paths() {
        for path in [
            "",
            "/popup.html",
            "../secret.txt",
            "nested/../secret.txt",
            "nested\\secret.txt",
            "C:/secret.txt",
        ] {
            assert!(sanitize_plugin_file_path(path).is_none());
        }
    }

    #[test]
    fn rejects_invalid_plugin_id_hosts() {
        assert!(parse_plugin_protocol_uri("oms-plugin://quick-search/popup.html").is_err());
        assert!(
            parse_plugin_protocol_uri("oms-plugin://localhost/quick.search/popup.html").is_err()
        );
    }

    #[test]
    fn rejects_encoded_traversal_paths() {
        assert!(
            parse_plugin_protocol_uri("oms-plugin://localhost/quick-search/%2e%2e/secret.txt")
                .is_err()
        );
    }

    #[test]
    fn rejects_plugin_directory_that_is_not_installed() {
        let app_root = temp_dir("uninstalled-plugin");
        let settings = SettingsManager::new(app_root.clone());
        settings
            .save_config(&AppConfig {
                language_preference: LanguagePreference::En,
                close_window_behavior: Default::default(),
                plugins: vec![],
            })
            .unwrap();
        fs::create_dir_all(app_root.join("plugins").join("orphan")).unwrap();
        fs::write(
            app_root.join("plugins").join("orphan").join("style.css"),
            "body{}",
        )
        .unwrap();
        let registry = PluginRegistry::new(settings);

        let error = installed_plugin_for_request(&registry, "orphan").unwrap_err();

        assert!(matches!(
            error,
            PluginProtocolError::MissingPlugin(plugin_id) if plugin_id == "orphan"
        ));
    }

    #[test]
    fn clones_matching_popup_selection_without_consuming_it() {
        let popup = Arc::new(Mutex::new(PopupRuntimeState::default()));
        popup
            .lock()
            .unwrap()
            .insert(popup_selection("1", plugin("quick-search")));

        let selection = matching_popup_selection(&popup, "1", "quick-search").unwrap();

        assert_eq!(
            selection.context.selected_text,
            Some("selected".to_string())
        );
        assert!(popup.lock().unwrap().get("1").is_some());

        let second = matching_popup_selection(&popup, "1", "quick-search").unwrap();

        assert_eq!(second.context.selected_text, Some("selected".to_string()));
        assert!(popup.lock().unwrap().get("1").is_some());
    }

    #[test]
    fn ignores_mismatched_popup_selection() {
        let popup = Arc::new(Mutex::new(PopupRuntimeState::default()));
        popup
            .lock()
            .unwrap()
            .insert(popup_selection("1", plugin("quick-search")));

        let selection = matching_popup_selection(&popup, "1", "other-plugin");

        assert!(selection.is_none());
        assert!(popup.lock().unwrap().get("1").is_some());
    }
}
