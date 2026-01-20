# @t-req/app

CLI for t-req - scaffold, execute, and serve HTTP request projects.

## Installation

```bash
npm install -g @t-req/app
# or
bun add -g @t-req/app
```

## Commands

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

Uses defaults: bun runtime, bun package manager.

#### Generated project structure

```
my-project/
├── treq.config.ts        # Configuration with baseUrl variable
├── collection/
│   ├── auth/
│   │   └── login.http    # Example POST request
│   └── users/
│       └── get.http      # Example GET request
├── run.ts                # Example script using createClient
├── package.json
└── .gitignore
```

### `treq run` - Execute HTTP requests

Execute `.http` files directly from the command line:

```bash
# Execute the first request in a file
treq run collection/auth/login.http

# Execute a specific request by name
treq run collection/users.http --name "Get User"

# Execute a specific request by index
treq run collection/users.http --index 2

# Pass variables
treq run collection/auth/login.http --var email=test@example.com --var password=secret

# Use environment file
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
| `--env, -e` | Environment file to load (looks for `.env.<name>`) |
| `--var` | Set variable (can be used multiple times) |
| `--timeout, -t` | Request timeout in milliseconds |
| `--workspace, -w` | Workspace root directory |
| `--verbose, -v` | Show response headers |

### `treq serve` - Start HTTP server

Start an HTTP server that exposes the t-req API, enabling any programming language to execute `.http` files:

```bash
# Start server on default port (4096)
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
| `--port, -p` | Port to listen on (default: 4096) |
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
| `POST` | `/parse` | Parse `.http` file content |
| `POST` | `/execute` | Execute HTTP request |
| `POST` | `/session` | Create new session |
| `GET` | `/session/:id` | Get session state |
| `PUT` | `/session/:id/variables` | Update session variables |
| `DELETE` | `/session/:id` | Delete session |
| `GET` | `/event` | SSE event stream |
| `GET` | `/doc` | OpenAPI documentation |

#### Example: Python Client

```python
import requests

# Execute a request
response = requests.post("http://localhost:4096/execute", json={
    "content": "GET https://api.example.com/users",
    "variables": {"token": "abc123"}
})
print(response.json())
```

#### Example: Go Client

```go
resp, _ := http.Post("http://localhost:4096/execute", "application/json",
    strings.NewReader(`{"content": "GET https://api.example.com/users"}`))
```

See `examples/clients/` for complete client examples in Python, Go, and TypeScript.

### Help

```bash
treq --help
treq init --help
treq run --help
treq serve --help
```

## Protocol Version

The server uses protocol version `1.0`.

`/health` is intentionally lean (OpenCode pattern) and only returns a basic status and server version:

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
