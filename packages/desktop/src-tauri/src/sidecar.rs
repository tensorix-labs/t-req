use std::{net::TcpListener, path::Path};

use super::SIDECAR_HOST;
use rand::RngCore;
use tauri::AppHandle;
use tauri_plugin_shell::{
    ShellExt,
    process::{CommandChild, CommandEvent},
};

pub fn find_available_port() -> Result<u16, String> {
    let listener = TcpListener::bind((SIDECAR_HOST, 0))
        .map_err(|e| format!("failed to bind ephemeral port: {e}"))?;
    let port = listener
        .local_addr()
        .map_err(|e| format!("failed to read local address: {e}"))?
        .port();
    drop(listener);
    Ok(port)
}

pub fn generate_token() -> String {
    let mut bytes = [0_u8; 32];
    rand::rngs::OsRng.fill_bytes(&mut bytes);

    bytes
        .iter()
        .map(|byte| format!("{byte:02x}"))
        .collect::<String>()
}

pub fn spawn_sidecar(
    app: &AppHandle,
    port: u16,
    token: &str,
    workspace: &Path,
) -> Result<CommandChild, String> {
    let workspace_path = workspace.to_string_lossy().to_string();
    let port_string = port.to_string();
    let args = [
        "serve",
        "--host",
        SIDECAR_HOST,
        "--port",
        port_string.as_str(),
        "--token",
        token,
        "--workspace",
        workspace_path.as_str(),
    ];

    let (mut events, child) = app
        .shell()
        .sidecar("treq")
        .map_err(|e| format!("failed to configure sidecar command: {e}"))?
        .args(args)
        .spawn()
        .map_err(|e| format!("failed to spawn treq sidecar: {e}"))?;

    tauri::async_runtime::spawn(async move {
        while let Some(event) = events.recv().await {
            match event {
                CommandEvent::Stdout(bytes) => {
                    print!("{}", String::from_utf8_lossy(&bytes));
                }
                CommandEvent::Stderr(bytes) => {
                    eprint!("{}", String::from_utf8_lossy(&bytes));
                }
                CommandEvent::Error(error) => {
                    eprintln!("[sidecar] process error: {error}");
                }
                CommandEvent::Terminated(payload) => {
                    eprintln!("[sidecar] process terminated: {:?}", payload.code);
                }
                _ => {}
            }
        }
    });

    Ok(child)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn finds_bindable_port() {
        let port = find_available_port().expect("expected to resolve an available port");
        assert!(port > 0);

        let probe = TcpListener::bind((SIDECAR_HOST, port))
            .expect("expected returned port to be immediately bindable");
        drop(probe);
    }

    #[test]
    fn generates_32_byte_hex_token() {
        let token = generate_token();
        assert_eq!(token.len(), 64);
        assert!(token.chars().all(|ch| ch.is_ascii_hexdigit()));
        assert!(token.chars().all(|ch| !ch.is_ascii_uppercase()));

        let other = generate_token();
        assert_ne!(token, other);
    }
}
