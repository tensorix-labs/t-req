---
title: CLI Reference
description: All t-req commands and their options.
---

## Global flags

| Option | Alias | Type | Description |
|--------|-------|------|-------------|
| `--help` | — | boolean | Show help for commands and options |
| `--version` | — | boolean | Show installed t-req version |

Plugin commands may also appear in `treq --help` when loaded from your project config.

## Command inventory

- `treq import postman <file>`
- `treq import <source>`
- `treq init [name]`
- `treq open [workspace]`
- `treq run <file>`
- `treq serve`
- `treq tui`
- `treq upgrade [target]`
- `treq validate <path>`
- `treq web [workspace]`
- `treq ws [url]`

## treq open

Launch the interactive TUI (starts a local server automatically).

```bash
treq open [workspace]
```

| Option | Alias | Type | Default | Description |
|--------|-------|------|---------|-------------|
| `workspace` | — | string | `.` | Workspace root directory (positional) |
| `--port` | `-p` | number | 4097 | Port to listen on |
| `--host` | `-H` | string | `127.0.0.1` | Host to bind to |
| `--web` | — | boolean | false | Enable web UI and open browser in addition to TUI |
| `--expose` | — | boolean | false | Allow non-loopback binding (disables cookie auth) |

`--web` and `--expose` cannot be used together.

## treq init

Scaffold a new t-req workspace.

```bash
treq init [name]
```

| Option | Alias | Type | Default | Description |
|--------|-------|------|---------|-------------|
| `name` | — | string | — | Project name / directory (positional) |
| `--yes` | `-y` | boolean | false | Skip prompts, use defaults |
| `--template` | `-t` | string | — | Template (`empty`, `basic`) |
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
| `--env` | `-e` | string | — | Environment loaded from `environments/<env>.ts` or `.js` |
| `--var` | `-v` | string[] | — | Variables as `key=value` pairs |
| `--timeout` | `-t` | number | — | Request timeout in milliseconds |
| `--workspace` | `-w` | string | — | Workspace root directory |
| `--verbose` | — | boolean | false | Show detailed output |
| `--json` | — | boolean | false | Output response as JSON (includes plugin info/reports) |
| `--no-plugins` | — | boolean | false | Disable plugin loading |
| `--plugin` | `-P` | string[] | — | Load additional plugins (npm package or `file://` path) |

`--name` and `--index` are mutually exclusive.

## treq ws

Open a WebSocket session through a running t-req server.

```bash
treq ws [url]
```

| Option | Alias | Type | Default | Description |
|--------|-------|------|---------|-------------|
| `url` | — | string | — | WebSocket URL (`ws://` or `wss://`) (positional) |
| `--file` | `-f` | string | — | Path to `.http` file containing a WebSocket request |
| `--name` | `-n` | string | — | Select request by `@name` directive (file mode) |
| `--index` | `-i` | number | — | Select request by index (0-based, file mode) |
| `--profile` | `-p` | string | — | Config profile to use |
| `--var` | `-v` | string[] | — | Variables as `key=value` pairs |
| `--server` | `-s` | string | `http://127.0.0.1:4097` | Server URL to connect to |
| `--token` | `-t` | string | — | Bearer token for authentication |
| `--timeout` | — | number | — | WebSocket connect timeout in milliseconds |
| `--execute` | `-x` | string | — | Send one message, then follow batch wait behavior |
| `--wait` | `-w` | number | `2` | Batch wait seconds before close (`-1` waits indefinitely) |
| `--json` | — | boolean | false | Emit live NDJSON events |
| `--verbose` | — | boolean | false | Show verbose output |
| `--no-color` | — | boolean | false | Disable ANSI colors in human-readable mode |

Exactly one source is required: positional `url` or `--file`.
`--name` and `--index` are file-mode only and cannot be combined.
`--timeout` must be an integer and at least `100`.
`--wait` must be `-1` or a non-negative integer.

## treq serve

Start the HTTP API server.

```bash
treq serve
```

| Option | Alias | Type | Default | Description |
|--------|-------|------|---------|-------------|
| `--port` | `-p` | number | 4097 | Port to listen on |
| `--host` | `-H` | string | `127.0.0.1` | Host to bind to |
| `--workspace` | `-w` | string | — | Workspace root directory |
| `--token` | `-t` | string | — | Bearer token for authentication |
| `--cors` | `-c` | string | — | Allowed CORS origins (comma-separated) |
| `--max-body-size` | — | number | 10485760 | Max response body size in bytes |
| `--max-sessions` | — | number | 100 | Max concurrent sessions |
| `--stdio` | — | boolean | false | JSON-RPC over stdin/stdout |
| `--web` | — | boolean | false | Enable web UI |

`--token` is required when binding to a non-loopback host.

### API overview

Complete schema: `GET /doc`

Commonly used endpoints:

| Method | Path | Description |
|--------|------|-------------|
| GET | `/health` | Health check |
| GET | `/capabilities` | Protocol version and features |
| GET | `/config` | Resolved project configuration |
| POST | `/parse` | Parse `.http` file content |
| POST | `/execute` | Execute an HTTP request |
| POST | `/execute/ws` | Execute a WebSocket request definition |
| POST | `/session` | Create a session |
| GET | `/session/{id}` | Get session state |
| PUT | `/session/{id}/variables` | Update session variables |
| GET | `/event` | SSE event stream |
| GET | `/event/ws` | WebSocket event stream |
| GET | `/ws/session/{wsSessionId}` | WebSocket request-session control channel |
| GET | `/workspace/files` | List `.http` files |
| GET | `/workspace/requests` | List requests in a file |
| POST | `/script` | Run a script |
| POST | `/test` | Run tests |

## treq tui

Connect to a running server with the terminal UI.

```bash
treq tui
```

| Option | Alias | Type | Default | Description |
|--------|-------|------|---------|-------------|
| `--server` | `-s` | string | `http://localhost:4097` | Server URL to connect to |
| `--token` | `-t` | string | — | Bearer token for authentication |

## treq web

Start server and open the web UI in a browser (no TUI).

```bash
treq web [workspace]
```

| Option | Alias | Type | Default | Description |
|--------|-------|------|---------|-------------|
| `workspace` | — | string | `.` | Workspace root directory (positional) |
| `--port` | `-p` | number | 4097 | Port to listen on |
| `--host` | `-H` | string | `127.0.0.1` | Host to bind to |

## treq upgrade

Upgrade t-req to a newer version.

```bash
treq upgrade [target]
```

| Option | Alias | Type | Default | Description |
|--------|-------|------|---------|-------------|
| `target` | — | string | `latest` | Version to upgrade to (positional) |

## treq validate

Validate `.http` files for syntax and diagnostics.

```bash
treq validate <path>
```

| Option | Alias | Type | Default | Description |
|--------|-------|------|---------|-------------|
| `path` | — | string | required | Path to `.http` file or directory (positional) |
| `--json` | — | boolean | false | Output diagnostics as JSON |
| `--verbose` | — | boolean | false | Include files with no issues |

Exit codes: `1` when validation errors are found, otherwise `0`.

## treq import

Import requests from external formats.

```bash
treq import <source>
```

Currently supported source:

- `postman`

## treq import postman

Import requests from a Postman collection.

```bash
treq import postman <file>
```

| Option | Alias | Type | Default | Description |
|--------|-------|------|---------|-------------|
| `file` | — | string | required | Path to Postman collection JSON file (positional) |
| `--output` | `-o` | string | `./<collection-name>` | Output directory |
| `--strategy` | — | string | `request-per-file` | File strategy (`request-per-file`, `folder-per-file`) |
| `--report-disabled` | — | boolean | false | Emit diagnostics for disabled Postman items |
| `--dry-run` | — | boolean | false | Preview import without writing files |
| `--on-conflict` | — | string | `fail` | Conflict policy (`fail`, `skip`, `overwrite`, `rename`) |
| `--merge-variables` | — | boolean | false | Merge collection variables into t-req config |
| `--force` | — | boolean | false | Proceed even when converter emits error diagnostics |
