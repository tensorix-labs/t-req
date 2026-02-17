---
title: CLI Reference
description: All t-req commands and their options.
---

## treq open

Launch the TUI to browse and run requests interactively.

```bash
treq open [workspace]
```

| Option | Alias | Type | Default | Description |
|--------|-------|------|---------|-------------|
| `workspace` | — | string | `.` | Workspace root directory (positional) |
| `--port` | `-p` | number | 4097 | Port to listen on |
| `--host` | `-H` | string | `127.0.0.1` | Host to bind to |
| `--web` | — | boolean | false | Open browser-based UI instead of terminal |
| `--expose` | — | boolean | false | Allow non-loopback binding (disables cookie auth) |

## treq init

Scaffold a new t-req workspace.

```bash
treq init [name]
```

| Option | Alias | Type | Default | Description |
|--------|-------|------|---------|-------------|
| `name` | — | string | — | Project name / directory (positional) |
| `--yes` | `-y` | boolean | false | Skip prompts, use defaults |
| `--no-tests` | — | boolean | false | Skip test file generation |
| `--test-runner` | — | string | — | Test runner (bun, vitest, jest) |

## treq run

Execute a request from a `.http` file.

```bash
treq run <file>
```

| Option | Alias | Type | Default | Description |
|--------|-------|------|---------|-------------|
| `file` | — | string | required | Path to `.http` file (positional) |
| `--name` | `-n` | string | — | Select request by `@name` directive |
| `--index` | `-i` | number | — | Select request by index (0-based) |
| `--profile` | `-p` | string | — | Config profile to use |
| `--env` | `-e` | string | — | Environment file to load from `environments/` |
| `--var` | `-v` | string[] | — | Variables as `key=value` pairs |
| `--timeout` | `-t` | number | — | Request timeout in milliseconds |
| `--workspace` | `-w` | string | — | Workspace root directory |
| `--verbose` | — | boolean | false | Show detailed output |
| `--json` | — | boolean | false | Output response as JSON (includes plugin info/reports) |
| `--no-plugins` | — | boolean | false | Disable plugin loading |
| `--plugin` | `-P` | string[] | — | Load additional plugins (npm package or `file://` path) |

## treq serve

Start the HTTP API server.

```bash
treq serve
```

| Option | Alias | Type | Default | Description |
|--------|-------|------|---------|-------------|
| `--port` | `-p` | number | 4096 | Port to listen on |
| `--host` | `-H` | string | `127.0.0.1` | Host to bind to |
| `--workspace` | `-w` | string | — | Workspace root directory |
| `--token` | `-t` | string | — | Bearer token for authentication |
| `--cors` | `-c` | string | — | Allowed CORS origins (comma-separated) |
| `--max-body-size` | — | number | 10485760 | Max response body size in bytes |
| `--max-sessions` | — | number | 100 | Max concurrent sessions |
| `--stdio` | — | boolean | false | JSON-RPC over stdin/stdout |
| `--web` | — | boolean | false | Enable web UI |

### API endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | `/health` | Health check |
| GET | `/capabilities` | Protocol version and features |
| GET | `/config` | Resolved project configuration |
| POST | `/parse` | Parse `.http` file content |
| POST | `/execute` | Execute an HTTP request |
| POST | `/execute/sse` | Execute an SSE streaming request |
| POST | `/execute/ws` | Execute a WebSocket request definition |
| POST | `/session` | Create a session |
| GET | `/session/:id` | Get session state |
| PUT | `/session/:id/variables` | Update session variables |
| DELETE | `/session/:id` | Delete a session |
| POST | `/flows` | Create a flow |
| POST | `/flows/:flowId/finish` | Mark flow as complete |
| GET | `/flows/:flowId/executions/:id` | Get execution details |
| GET | `/event` | SSE event stream |
| GET | `/event/ws` | WebSocket event stream |
| GET | `/ws/session/:wsSessionId` | WebSocket request-session control channel |
| GET | `/workspace/files` | List `.http` files |
| GET | `/workspace/requests` | List requests in a file |
| POST | `/script` | Run a script |
| DELETE | `/script/:runId` | Cancel a running script |
| GET | `/script/runners` | Get available script runners |
| POST | `/test` | Run tests |
| DELETE | `/test/:runId` | Cancel a running test |
| GET | `/test/frameworks` | Get available test frameworks |

## treq tui

Connect to a running server with the terminal UI.

```bash
treq tui
```

| Option | Alias | Type | Default | Description |
|--------|-------|------|---------|-------------|
| `--server` | `-s` | string | `http://localhost:4096` | Server URL to connect to |
| `--token` | `-t` | string | — | Bearer token for authentication |

## treq upgrade

Upgrade t-req to a newer version.

```bash
treq upgrade [target]
```

| Option | Alias | Type | Default | Description |
|--------|-------|------|---------|-------------|
| `target` | — | string | `latest` | Version to upgrade to (positional) |
