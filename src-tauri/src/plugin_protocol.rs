use crate::app_state::AppState;
use crate::models::PluginViewContext;
use crate::plugin_engine::build_view_context;
use crate::plugin_registry::{PluginRegistry, PluginRegistryError};
use crate::settings_manager::SettingsError;
use std::fs;
use std::path::{Component, Path, PathBuf};
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
}

#[derive(Debug)]
struct PluginProtocolRequest {
    plugin_id: String,
    file_path: PathBuf,
    content_path: String,
    view_kind: String,
    selection_id: Option<String>,
}

pub fn register_plugin_protocol<R: tauri::Runtime>(
    builder: tauri::Builder<R>,
) -> tauri::Builder<R> {
    builder.register_asynchronous_uri_scheme_protocol("oms-plugin", |ctx, request, responder| {
        let app = ctx.app_handle().clone();
        let uri = request.uri().to_string();

        std::thread::spawn(move || {
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
) -> Result<String, PluginProtocolError> {
    let context_json = serde_json::to_string(context)?;
    let view_kind_json = serde_json::to_string(view_kind)?;
    let script = format!(
        r#"<script>
(() => {{
  const context = {context_json};
  const viewKind = {view_kind_json};
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
    let request = parse_plugin_protocol_uri(uri)?;
    let (settings, popup) = {
        let state = app
            .try_state::<AppState>()
            .ok_or(PluginProtocolError::MissingState)?;
        (state.settings.clone(), state.popup.clone())
    };
    let selected_text = if request.view_kind == "popup" {
        request.selection_id.as_deref().and_then(|selection_id| {
            popup
                .lock()
                .ok()
                .and_then(|state| state.get(selection_id))
                .filter(|selection| selection.plugin.id == request.plugin_id)
                .and_then(|selection| selection.context.selected_text)
        })
    } else {
        None
    };

    let registry = PluginRegistry::new(settings.clone());
    let plugin_dir = registry.plugin_dir(&request.plugin_id);
    let file_path = resolve_plugin_file_path(&plugin_dir, &request.file_path)?;
    let content_type = content_type_for_path(&request.content_path);

    let body = if content_type.starts_with("text/html") {
        let config = settings.load_config()?;
        let plugins = registry.list_plugins()?;
        let plugin = plugins
            .into_iter()
            .find(|plugin| plugin.id == request.plugin_id)
            .ok_or_else(|| PluginProtocolError::MissingPlugin(request.plugin_id.clone()))?;
        let locale = registry.resolve_locale(config.language_preference);
        let context = build_view_context(
            &plugin,
            selected_text,
            locale,
            config.language_preference,
            app.package_info().version.to_string(),
        );
        inject_bridge(
            &fs::read_to_string(file_path)?,
            &context,
            &request.view_kind,
        )?
        .into_bytes()
    } else {
        fs::read(file_path)?
    };

    response(StatusCode::OK, content_type, body)
}

fn parse_plugin_protocol_uri(uri: &str) -> Result<PluginProtocolRequest, PluginProtocolError> {
    let url = Url::parse(uri)?;
    let plugin_id = url
        .host_str()
        .filter(|host| !host.is_empty())
        .ok_or(PluginProtocolError::MissingPluginId)?
        .to_string();
    if !is_valid_plugin_id(&plugin_id) {
        return Err(PluginProtocolError::InvalidPluginId);
    }
    let raw_path = url.path().trim_start_matches('/');
    let decoded_path = urlencoding::decode(raw_path)?.into_owned();
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

    Ok(PluginProtocolRequest {
        plugin_id,
        file_path,
        content_path: decoded_path,
        view_kind,
        selection_id,
    })
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
        assert_eq!(
            content_type_for_path("popup.html"),
            "text/html; charset=utf-8"
        );
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
        assert!(parse_plugin_protocol_uri("oms-plugin://../popup.html").is_err());
        assert!(parse_plugin_protocol_uri("oms-plugin://quick.search/popup.html").is_err());
    }
}
