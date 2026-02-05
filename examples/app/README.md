# @t-req/app Client Examples

Examples demonstrating how to connect to `treq serve` from different programming languages.

## Overview

These examples show how any language can execute `.http` files by connecting to the t-req HTTP server. This enables language-agnostic HTTP testing while maintaining a single, canonical parsing implementation.

## Starting the Server

```bash
# Start the server on default port (4096)
treq serve

# Custom port
treq serve --port 8080

# With authentication (required for non-localhost)
treq serve --host 0.0.0.0 --token your-secret-token
```

## Client Examples

### Python (`python_client.py`)

Uses `requests` for HTTP and `sseclient-py` for Server-Sent Events.

```bash
pip install requests sseclient-py
python examples/app/python_client.py
```

Features:
- Health check
- Parse .http content
- Execute requests
- Session management
- SSE event streaming

### Go (`go_client.go`)

Uses standard library `net/http`.

```bash
go run examples/app/go_client.go
```

Features:
- Health check
- Execute requests
- Session management
- SSE event streaming

### TypeScript (`typescript_client.ts`)

Uses native `fetch` API (works with Bun, Deno, Node 18+).

```bash
bun run examples/app/typescript_client.ts
```

Features:
- Full type definitions
- Health check
- Parse and execute
- Session management
- EventSource for SSE

## API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/health` | Server health and version info |
| `POST` | `/parse` | Parse .http file content |
| `POST` | `/execute` | Execute HTTP request |
| `POST` | `/execute/sse` | Execute SSE streaming request |
| `POST` | `/session` | Create new session |
| `GET` | `/session/:id` | Get session state |
| `PUT` | `/session/:id/variables` | Update session variables |
| `DELETE` | `/session/:id` | Delete session |
| `GET` | `/event` | SSE event stream |
| `GET` | `/doc` | OpenAPI documentation |

## SSE Streaming Example

Execute an SSE streaming request via the `/execute/sse` endpoint:

```bash
curl -N -X POST http://localhost:4097/execute/sse \
  -H "Content-Type: application/json" \
  -d '{"content": "# @sse\nGET https://sse.dev/test\n"}'
```

The response is a standard SSE stream — each event is delivered as it arrives from the upstream server.

## Execute Request Example

```json
POST /execute
{
  "content": "GET https://api.example.com/users/{{userId}}",
  "variables": {
    "userId": "123"
  }
}
```

Response:
```json
{
  "runId": "abc123",
  "request": {
    "method": "GET",
    "url": "https://api.example.com/users/123"
  },
  "response": {
    "status": 200,
    "statusText": "OK",
    "headers": [...],
    "body": "{...}",
    "encoding": "utf-8"
  },
  "timing": {
    "durationMs": 150
  }
}
```

## Session Example

Sessions persist variables and cookies across requests:

```python
# Create session
session = requests.post(f"{BASE}/session", json={}).json()
session_id = session["sessionId"]

# Execute with session
requests.post(f"{BASE}/execute", json={
    "content": "POST /login",
    "sessionId": session_id
})

# Subsequent requests share cookies
requests.post(f"{BASE}/execute", json={
    "content": "GET /profile",
    "sessionId": session_id  # Cookies from login are included
})
```
