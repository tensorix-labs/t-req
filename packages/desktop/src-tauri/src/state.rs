use std::sync::Mutex;

use tauri_plugin_shell::process::CommandChild;

#[derive(Debug, Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ServerInfo {
    pub port: u16,
    pub token: String,
    pub base_url: String,
    pub workspace: String,
}

pub struct ServerRuntime {
    pub child: CommandChild,
    pub port: u16,
    pub token: String,
    pub base_url: String,
    pub workspace: String,
}

#[derive(Default)]
pub struct ServerState {
    runtime: Mutex<Option<ServerRuntime>>,
}

impl ServerState {
    pub fn server_info(&self) -> Result<Option<ServerInfo>, String> {
        let guard = self
            .runtime
            .lock()
            .map_err(|_| "failed to acquire server state lock".to_string())?;

        Ok(guard.as_ref().map(|runtime| ServerInfo {
            port: runtime.port,
            token: runtime.token.clone(),
            base_url: runtime.base_url.clone(),
            workspace: runtime.workspace.clone(),
        }))
    }

    pub fn set_runtime(&self, runtime: ServerRuntime) -> Result<(), String> {
        let mut guard = self
            .runtime
            .lock()
            .map_err(|_| "failed to acquire server state lock".to_string())?;

        if let Some(current) = guard.take() {
            let _ = current.child.kill();
        }

        *guard = Some(runtime);
        Ok(())
    }

    pub fn take_runtime(&self) -> Result<Option<ServerRuntime>, String> {
        let mut guard = self
            .runtime
            .lock()
            .map_err(|_| "failed to acquire server state lock".to_string())?;
        Ok(guard.take())
    }

    pub fn kill_current(&self) -> Result<(), String> {
        if let Some(runtime) = self.take_runtime()? {
            runtime
                .child
                .kill()
                .map_err(|e| format!("failed to kill sidecar process: {e}"))?;
        }

        Ok(())
    }
}
