# @t-req/app

CLI for t-req -- scaffold, execute, and serve HTTP request projects. Includes a terminal UI (TUI) and web dashboard for interactive exploration.

## Developer Workflow

```bash
# 1. Scaffold a new project
treq init my-api

# 2. Open the TUI + server (starts everything)
cd my-api && treq open

# 3. Browse .http files, execute requests, run scripts -- all from the TUI
#    Scripts automatically report HTTP requests back to the TUI (observer mode)

# 4. Or add --web to also open the browser dashboard
treq open --web
```

## Installation

```bash
# Install via curl
curl -fsSL https://t-req.io/install | bash

# Or via package manager
npm install -g @t-req/app
bun add -g @t-req/app
```

## Commands

### `treq open` - Open workspace (recommended)

Starts the server and TUI together. This is the primary way to use t-req interactively.

```bash
# Open current directory
treq open

# Open a specific workspace
treq open ./my-api

# Open with the web dashboard in your browser
treq open --web

# Custom port
treq open --port 8080
```

#### Options

| Option | Description |
|--------|-------------|
| `[workspace]` | Workspace root directory (default: `.`) |
| `--port, -p` | Port to listen on (default: 4097) |
| `--host, -H` | Host to bind to (default: 127.0.0.1) |
| `--web` | Open the browser dashboard |
| `--expose` | Allow non-loopback binding (disables cookie auth) |

Security: a random token is generated on every launch. `--web` and `--expose` cannot be combined (SSRF protection).

### `treq init` - Create a new project

```bash
treq init my-project
```

This will prompt you to select:
- **Runtime**: bun (recommended) or node
- **Package manager**: bun, npm, pnpm, or yarn

Skip prompts with defaults:

```bash
treq init my-project --yes
```

Uses defaults: bun runtime, bun package manager, bun test runner.

Skip test file generation:

```bash
treq init my-project --yes --no-tests
```

Use a specific test runner:

```bash
treq init my-project --yes --test-runner vitest
```

#### Options

| Option | Description |
|--------|-------------|
| `[name]` | Project name / directory |
| `--yes, -y` | Skip prompts, use defaults |
| `--no-tests` | Skip test file generation |
| `--test-runner` | Test runner to use (bun, vitest, jest) |

#### Generated project structure

```
my-project/
├── treq.jsonc            # Project configuration
├── client.ts             # Shared t-req client
├── run.ts                # Example script (imports client)
├── tests/                # Test files (when tests enabled)
│   └── list.test.ts      # Example test for users/list.http
├── collection/
│   ├── posts/
│   │   └── create.http   # Example POST request
│   └── users/
│       ├── list.http     # Example GET request (list)
│       └── get.http      # Example GET request (single)
├── README.md
├── package.json
├── tsconfig.json
├── .treq/                # Local state (e.g. cookie jar)
└── .gitignore
```

### `treq run` - Execute HTTP requests

Execute `.http` files directly from the command line:

```bash
# Execute the first request in a file
treq run collection/auth/login.http

# Use a config profile
treq run collection/auth/login.http --profile dev

# Execute a specific request by name
treq run collection/users.http --name "Get User"

# Execute a specific request by index
treq run collection/users.http --index 2

# Pass variables
treq run collection/auth/login.http --var email=test@example.com --var password=secret

# Legacy environment module (kept for compatibility)
# Loads environments/<env>.ts or environments/<env>.js from the workspace
treq run collection/auth/login.http --env dev

# Set timeout (in milliseconds)
treq run collection/auth/login.http --timeout 30000

# Verbose output (show headers)
treq run collection/auth/login.http --verbose
```

#### Options

| Option | Description |
|--------|-------------|
| `--name, -n` | Select request by @name directive |
| `--index, -i` | Select request by index (0-based) |
| `--profile, -p` | Config profile to use |
| `--env, -e` | Legacy environment module to load (`environments/<env>.ts` or `environments/<env>.js`) |
| `--var` | Set variable (can be used multiple times) |
| `--timeout, -t` | Request timeout in milliseconds |
| `--workspace, -w` | Workspace root directory |
| `--verbose, -v` | Show response headers |

### `treq ws` - Test WebSocket sessions

Open an interactive or batch WebSocket session through a running t-req server.

```bash
# Interactive mode
treq ws wss://echo.websocket.events

# Batch mode with one-shot payload
treq ws wss://echo.websocket.events --execute '{"ping":true}' --wait 2

# NDJSON output for automation
echo '{"ping":true}' | treq ws wss://echo.websocket.events --json
```

#### Options

| Option | Description |
|--------|-------------|
| `--server, -s` | Server URL to connect to (default: `http://127.0.0.1:4097`) |
| `--token, -t` | Bearer token for authentication |
| `--timeout` | WebSocket connect timeout in milliseconds |
| `--execute, -x` | Send one message and switch to batch wait behavior |
| `--wait, -w` | Batch wait seconds before close (`-1` waits indefinitely, default: `2`) |
| `--json` | Emit live NDJSON events (`meta.connected`, `ws.outbound`, `ws.inbound`, `ws.error`, `meta.closed`, `meta.summary`) |
| `--verbose` | Show verbose output (`~` frames and detailed error payloads) |
| `--no-color` | Disable ANSI colors in human-readable mode |

### `treq serve` - Start HTTP server

Start an HTTP server that exposes the t-req API, enabling any programming language to execute `.http` files:

```bash
# Start server on default port (4097)
treq serve

# Custom port
treq serve --port 8080

# Bind to all interfaces (for remote access)
treq serve --host 0.0.0.0 --token your-secret-token

# Enable CORS for specific origins
treq serve --cors "http://localhost:3000,http://localhost:5173"

# stdio mode (JSON-RPC over stdin/stdout)
treq serve --stdio
```

#### Options

| Option | Description |
|--------|-------------|
| `--port, -p` | Port to listen on (default: 4097) |
| `--host, -H` | Host to bind to (default: 127.0.0.1) |
| `--token` | Bearer token for authentication |
| `--cors` | Allowed CORS origins (comma-separated) |
| `--workspace, -w` | Workspace root directory |
| `--max-body-size` | Max response body size in bytes (default: 10MB) |
| `--max-sessions` | Max concurrent sessions (default: 100) |
| `--stdio` | Use JSON-RPC over stdin/stdout instead of HTTP |

#### API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/health` | Server health and version info |
| `GET` | `/config` | Resolved config summary (supports `?profile=` and `?path=`) |
| `POST` | `/parse` | Parse `.http` file content |
| `POST` | `/execute` | Execute HTTP request |
| `POST` | `/execute/sse` | Execute SSE streaming request |
| `POST` | `/execute/ws` | Execute WebSocket request definition (server-owned session) |
| `POST` | `/session` | Create new session |
| `GET` | `/session/:id` | Get session state |
| `PUT` | `/session/:id/variables` | Update session variables |
| `DELETE` | `/session/:id` | Delete session |
| `POST` | `/flows` | Create a flow (Observer Mode grouping) |
| `POST` | `/flows/:flowId/finish` | Finish a flow (best-effort; server TTL will also clean up) |
| `GET` | `/flows/:flowId/executions/:reqExecId` | Fetch stored execution detail (Observer Mode) |
| `GET` | `/workspace/files` | List `.http` files in workspace |
| `GET` | `/workspace/requests?path=...` | List requests within a `.http` file |
| `GET` | `/event?sessionId=...` | SSE event stream filtered by session |
| `GET` | `/event?flowId=...` | SSE event stream filtered by flow |
| `GET` | `/event/ws?sessionId=...` | WebSocket event stream filtered by session |
| `GET` | `/event/ws?flowId=...` | WebSocket event stream filtered by flow |
| `GET` | `/ws/session/:wsSessionId` | Request session downstream control socket (WebSocket upgrade) |
| `GET` | `/doc` | OpenAPI documentation |

> When `--token` auth is enabled, `/event` and `/event/ws` require either `sessionId` or `flowId` to prevent cross-session leakage.

#### Example: Python Client

```python
import requests

# Execute a request
response = requests.post("http://localhost:4097/execute", json={
    "content": "GET https://api.example.com/users",
    "variables": {"token": "abc123"}
})
print(response.json())
```

#### Example: Go Client

```go
resp, _ := http.Post("http://localhost:4097/execute", "application/json",
    strings.NewReader(`{"content": "GET https://api.example.com/users"}`))
```

#### Example: SSE Streaming (curl)

```bash
curl -N -X POST http://localhost:4097/execute/sse \
  -H "Content-Type: application/json" \
  -d '{"content": "# @sse\nGET https://sse.dev/test\n"}'
```

#### Example: WebSocket Session Execute (curl)

```bash
curl -X POST http://localhost:4097/execute/ws \
  -H "Content-Type: application/json" \
  -d '{"content": "# @ws\nGET wss://echo.websocket.events\n"}'
```

See `examples/app/` for complete client examples in Python, Go, and TypeScript.

### `treq tui` - Connect to existing server

Launch the TUI and connect to a server that is already running (started separately with `treq serve`).

```bash
# Connect to default server
treq tui

# Connect to a custom server
treq tui --server http://localhost:8080 --token my-token
```

#### Options

| Option | Description |
|--------|-------------|
| `--server, -s` | Server URL to connect to (default: http://localhost:4097) |
| `--token, -t` | Bearer token for authentication |

### `treq upgrade` - Upgrade treq

Upgrade treq to the latest version (or a specific version). Auto-detects the installation method.

```bash
# Upgrade to latest
treq upgrade

# Upgrade to a specific version
treq upgrade 0.3.0
```

### Help

```bash
treq --help
treq init --help
treq run --help
treq ws --help
treq serve --help
treq open --help
```

## TUI

The TUI provides an interactive terminal interface for browsing and executing your workspace.

### Layout

- **Left panel**: File tree (browse `.http` files, scripts, and tests) or Executions view (request list + script output)
- **Right panel**: Execution detail (full HTTP request and response)

### Keyboard Shortcuts

| Key | Action |
|-----|--------|
| `j` / `Down` | Navigate down |
| `k` / `Up` | Navigate up |
| `Enter` | Execute selected file / toggle directory |
| `Tab` | Toggle between File Tree and Executions panel |
| `Ctrl+H` | Hide/show left panel |
| `Ctrl+T` | File/request picker |
| `Ctrl+P` | Command palette |
| `Ctrl+E` | Open in external editor |
| `Escape` | Cancel running script |
| `Ctrl+C` | Quit |

### Script & Test Runner

The TUI can run scripts and tests directly. Supported runners:

**Scripts**: `bun`, `node`, `npx tsx`, `npx ts-node`, `python`
**Test frameworks**: `bun test`, `vitest`, `jest`, `pytest`

Runners are auto-detected from your project's lockfiles, config files, and `package.json` devDependencies.

## Observer Mode

Observer mode lets your scripts report HTTP requests back to the TUI and web dashboard with zero code changes.

When you run a script from the TUI (or web dashboard), t-req injects these environment variables into the child process:

| Variable | Purpose |
|----------|---------|
| `TREQ_SERVER` | Server URL (e.g. `http://localhost:4097`) |
| `TREQ_FLOW_ID` | Flow ID grouping related requests |
| `TREQ_SESSION_ID` | Pre-created session ID |
| `TREQ_TOKEN` | Scoped, short-lived auth token |

`@t-req/core`'s `createClient()` auto-detects `TREQ_SERVER` and routes requests through the server instead of executing them locally. Every request appears in the TUI/dashboard in real time via SSE.

The injected token is scoped to the specific flow and session, and is revoked when the script exits.

**No code changes needed** -- if your script already uses `createClient()`, observer mode works automatically.

## Protocol Version

The server uses protocol version `1.1`.

### Migration note: `1.0 -> 1.1`

`1.1` is additive:

- Existing `/execute`, `/execute/sse`, and `/event` workflows are unchanged.
- New WebSocket capabilities are available via:
  - `POST /execute/ws`
  - `GET /ws/session/{wsSessionId}`
  - `GET /event/ws`

### WebSocket scope in `1.1`

- `.http` WebSocket blocks are connection definitions (messages are runtime-driven).
- Binary WebSocket payloads are not supported in `1.1` (`binaryPayloads: false`).
- Replay is bounded in-memory only (no durable event history).
- Client-specific UI workflows are intentionally out of scope at the protocol layer.

`/health` is intentionally lean  and only returns a basic status and server version:

```json
{
  "healthy": true,
  "version": "0.1.0"
}
```

## Security

- **Localhost by default**: Server binds to `127.0.0.1` unless `--host` is specified
- **Token authentication**: Use `--token` flag for bearer auth (required for remote access)
- **Path scoping**: All file paths are relative to workspace root; absolute paths and `..` traversal are rejected
- **CORS disabled by default**: Use `--cors` to enable specific origins

## License

[MIT](../../LICENSE)
