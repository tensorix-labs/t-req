mod server;
mod sidecar;
mod state;

use std::{
    fs,
    path::{Path, PathBuf},
};

use server::check_health;
use sidecar::{find_available_port, generate_token, spawn_sidecar};
use state::{ServerInfo, ServerRuntime, ServerState};
use tauri::{AppHandle, Emitter, Manager, RunEvent, State, path::BaseDirectory};
use tauri_plugin_dialog::DialogExt;

const SIDECAR_HOST: &str = "127.0.0.1";
const EVENT_SERVER_READY: &str = "server-ready";
const EVENT_SERVER_ERROR: &str = "server-error";
const EVENT_WORKSPACE_PICKING: &str = "workspace-picking";
const WORKSPACE_STATE_PATH: &str = "desktop/workspace-state.json";

#[derive(Debug, Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
struct ServerErrorPayload {
    message: String,
}

#[derive(Debug, Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
struct WorkspacePickingPayload {
    reason: String,
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
struct WorkspaceStateFile {
    last_workspace_path: String,
}

#[derive(Clone)]
struct StartupState {
    initializing: std::sync::Arc<std::sync::Mutex<bool>>,
}

impl Default for StartupState {
    fn default() -> Self {
        Self {
            initializing: std::sync::Arc::new(std::sync::Mutex::new(false)),
        }
    }
}

impl StartupState {
    fn begin(&self) -> Result<bool, String> {
        let mut guard = self
            .initializing
            .lock()
            .map_err(|_| "failed to acquire startup state lock".to_string())?;
        if *guard {
            return Ok(false);
        }

        *guard = true;
        Ok(true)
    }

    fn end(&self) -> Result<(), String> {
        let mut guard = self
            .initializing
            .lock()
            .map_err(|_| "failed to acquire startup state lock".to_string())?;
        *guard = false;
        Ok(())
    }
}

// Learn more about Tauri commands at https://tauri.app/develop/calling-rust/
#[tauri::command]
fn greet(name: &str) -> String {
    format!("Hello, {}! You've been greeted from Rust!", name)
}

#[tauri::command]
fn get_server_info(state: State<'_, ServerState>) -> Result<Option<ServerInfo>, String> {
    state.server_info()
}

#[tauri::command]
fn kill_sidecar(state: State<'_, ServerState>) -> Result<(), String> {
    state.kill_current()
}

#[tauri::command]
async fn set_workspace(app: AppHandle, workspace: String) -> Result<ServerInfo, String> {
    let workspace_path = resolve_workspace_path(&workspace)?;
    persist_last_workspace_path(&app, &workspace_path)?;

    match initialize_server(&app, workspace_path).await {
        Ok(info) => Ok(info),
        Err(error) => {
            let _ = emit_server_error(&app, &error);
            Err(error)
        }
    }
}

fn resolve_workspace_path(raw_path: &str) -> Result<PathBuf, String> {
    let workspace_path = PathBuf::from(raw_path);
    if !workspace_path.is_absolute() {
        return Err("workspace path must be absolute".to_string());
    }

    let metadata = fs::metadata(&workspace_path)
        .map_err(|e| format!("workspace path does not exist: {e}"))?;
    if !metadata.is_dir() {
        return Err("workspace path must be a directory".to_string());
    }

    // Ensure the directory is readable.
    fs::read_dir(&workspace_path)
        .map_err(|e| format!("workspace directory is not readable: {e}"))?;

    Ok(workspace_path)
}

fn workspace_state_file_path(app: &AppHandle) -> Result<PathBuf, String> {
    app.path()
        .resolve(WORKSPACE_STATE_PATH, BaseDirectory::AppLocalData)
        .map_err(|e| format!("failed to resolve workspace state file path: {e}"))
}

fn load_last_workspace_path(app: &AppHandle) -> Result<Option<PathBuf>, String> {
    let state_file_path = workspace_state_file_path(app)?;
    if !state_file_path.exists() {
        return Ok(None);
    }

    let contents = fs::read_to_string(&state_file_path)
        .map_err(|e| format!("failed to read workspace state file: {e}"))?;
    let state_file: WorkspaceStateFile = serde_json::from_str(&contents)
        .map_err(|e| format!("failed to parse workspace state file: {e}"))?;

    if state_file.last_workspace_path.trim().is_empty() {
        return Ok(None);
    }

    Ok(Some(PathBuf::from(state_file.last_workspace_path)))
}

fn persist_last_workspace_path(app: &AppHandle, workspace_path: &Path) -> Result<(), String> {
    let state_file_path = workspace_state_file_path(app)?;

    if let Some(parent) = state_file_path.parent() {
        fs::create_dir_all(parent)
            .map_err(|e| format!("failed to create workspace state directory: {e}"))?;
    }

    let state_file = WorkspaceStateFile {
        last_workspace_path: workspace_path.to_string_lossy().to_string(),
    };

    let serialized = serde_json::to_string_pretty(&state_file)
        .map_err(|e| format!("failed to serialize workspace state: {e}"))?;
    fs::write(state_file_path, serialized)
        .map_err(|e| format!("failed to persist workspace state: {e}"))?;

    Ok(())
}

fn emit_server_ready(app: &AppHandle, info: &ServerInfo) -> Result<(), String> {
    app.emit(EVENT_SERVER_READY, info)
        .map_err(|e| format!("failed to emit server-ready event: {e}"))
}

fn emit_server_error(app: &AppHandle, message: &str) -> Result<(), String> {
    let payload = ServerErrorPayload {
        message: message.to_string(),
    };
    app.emit(EVENT_SERVER_ERROR, payload)
        .map_err(|e| format!("failed to emit server-error event: {e}"))
}

fn emit_workspace_picking(app: &AppHandle, reason: &str) -> Result<(), String> {
    let payload = WorkspacePickingPayload {
        reason: reason.to_string(),
    };
    app.emit(EVENT_WORKSPACE_PICKING, payload)
        .map_err(|e| format!("failed to emit workspace-picking event: {e}"))
}

async fn pick_workspace_folder(app: &AppHandle) -> Result<PathBuf, String> {
    let app = app.clone();
    tauri::async_runtime::spawn_blocking(move || {
        let selection = app
            .dialog()
            .file()
            .set_title("Select a t-req workspace folder")
            .blocking_pick_folder();

        let Some(selection) = selection else {
            return Err("workspace selection cancelled".to_string());
        };

        let path = selection
            .into_path()
            .map_err(|e| format!("workspace selection is not a local path: {e}"))?;

        let raw = path.to_string_lossy().to_string();
        resolve_workspace_path(&raw)
    })
    .await
    .map_err(|e| format!("workspace picker task failed: {e}"))?
}

async fn resolve_workspace_for_startup(app: &AppHandle) -> Result<PathBuf, String> {
    if let Some(saved_path) = load_last_workspace_path(app)? {
        let raw = saved_path.to_string_lossy().to_string();
        if let Ok(path) = resolve_workspace_path(&raw) {
            return Ok(path);
        }
    }

    emit_workspace_picking(app, "missing-or-invalid")?;
    let selected_path = pick_workspace_folder(app).await?;
    persist_last_workspace_path(app, &selected_path)?;
    Ok(selected_path)
}

async fn initialize_server(app: &AppHandle, workspace_path: PathBuf) -> Result<ServerInfo, String> {
    let state = app.state::<ServerState>();
    state.kill_current()?;
    drop(state);

    let port = find_available_port()?;
    let token = generate_token();
    let base_url = format!("http://{SIDECAR_HOST}:{port}");
    let child = spawn_sidecar(app, port, &token, &workspace_path)?;

    if let Err(error) = check_health(&base_url, &token).await {
        let _ = child.kill();
        return Err(format!("sidecar failed health check: {error}"));
    }

    let info = ServerInfo {
        port,
        token: token.clone(),
        base_url: base_url.clone(),
        workspace: workspace_path.to_string_lossy().to_string(),
    };

    let state = app.state::<ServerState>();
    state.set_runtime(ServerRuntime {
        child,
        port,
        token,
        base_url,
        workspace: info.workspace.clone(),
    })?;

    emit_server_ready(app, &info)?;
    Ok(info)
}

async fn initialize_on_startup(app: &AppHandle) -> Result<(), String> {
    let startup = app.state::<StartupState>();
    let started = startup.begin()?;
    if !started {
        return Ok(());
    }
    drop(startup);

    let init_result = async {
        let workspace_path = resolve_workspace_for_startup(app).await?;
        initialize_server(app, workspace_path).await?;
        Ok::<(), String>(())
    }
    .await;

    let startup = app.state::<StartupState>();
    let _ = startup.end();

    init_result
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_dialog::init())
        .manage(ServerState::default())
        .manage(StartupState::default())
        .invoke_handler(tauri::generate_handler![
            greet,
            get_server_info,
            kill_sidecar,
            set_workspace
        ])
        .setup(|app| {
            let app_handle = app.handle().clone();
            tauri::async_runtime::spawn(async move {
                if let Err(error) = initialize_on_startup(&app_handle).await {
                    let _ = emit_server_error(&app_handle, &error);
                }
            });
            Ok(())
        })
        .build(tauri::generate_context!())
        .expect("error while building tauri application")
        .run(|app, event| {
            if let RunEvent::Exit = event {
                if let Some(state) = app.try_state::<ServerState>() {
                    let _ = state.kill_current();
                }
            }
        });
}
