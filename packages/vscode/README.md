# t-req for VS Code

Run and manage HTTP requests directly from `.http` files in VS Code — powered by the [t-req](https://t-req.io) engine.


## Features

- **Syntax highlighting** for `.http` files with embedded JSON support
- **Run requests** with a single click or keyboard shortcut
- **Run all requests** in a file sequentially
- **Local and server execution** — run requests locally (bundled engine) or against a remote t-req server
- **Profile support** — switch between environments (dev, staging, prod)
- **Response panel** — view status, headers, and body with syntax highlighting
- **Plugin support** — run plugins with hook timing, assert reports, and a dedicated Plugins tab in the response panel

![Plugins](https://raw.githubusercontent.com/tensorix-labs/t-req/main/packages/vscode/images/plugins.png)
- **Diagnostics** — inline warnings and errors from static analysis and plugins

![Run Request](https://raw.githubusercontent.com/tensorix-labs/t-req/main/packages/vscode/images/run-request.png)

## Commands

All commands are available via the Command Palette (`Ctrl+Shift+P` / `Cmd+Shift+P`):

| Command | Description |
|---------|-------------|
| `t-req: Run Request` | Execute the request under the cursor |
| `t-req: Run All Requests` | Execute all requests in the current file |
| `t-req: Select Profile` | Choose the active profile |
| `t-req: Cancel Request` | Cancel a running request |
| `t-req: Set Server Token` | Store a bearer token for server mode (saved in SecretStorage) |
| `t-req: Clear Server Token` | Remove the stored server token |

## Configuration

Configure via `Settings > Extensions > t-req` or in `settings.json`:

| Setting | Type | Default | Description |
|---------|------|---------|-------------|
| `t-req.executionMode` | `"local"` \| `"server"` | `"local"` | Execution mode — `local` uses the bundled engine, `server` proxies to a remote t-req server |
| `t-req.serverUrl` | `string` | `""` | Base URL for the t-req server (server mode only) |
| `t-req.defaultProfile` | `string` | `""` | Default profile for request execution |
| `t-req.timeout` | `number` | `30000` | Request timeout in milliseconds (min: 100) |
| `t-req.enableDiagnostics` | `boolean` | `true` | Enable inline diagnostics for `.http` files |
| `t-req.maxBodyBytes` | `number` | `1048576` | Maximum response body size to render (min: 1024) |

## Token Management

When using **server mode**, authenticate with a bearer token:

1. Run `t-req: Set Server Token` from the Command Palette
2. Enter your token — it is stored securely in VS Code's SecretStorage (never in settings files)
3. To remove it, run `t-req: Clear Server Token`

## Requirements

- VS Code ^1.96.0
- No external CLI install needed — the t-req core engine is bundled in the extension

## Links

- [Documentation](https://t-req.io)
- [GitHub Repository](https://github.com/tensorix-labs/t-req)
- [Report Issues](https://github.com/tensorix-labs/t-req/issues)
