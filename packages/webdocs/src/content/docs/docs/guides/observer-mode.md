---
title: Observer Mode
description: Zero-config request observability for any script or test that uses t-req.
---

Observer mode gives you real-time visibility into every HTTP request made by your scripts and tests — directly in the TUI. No extra code or configuration required.

## How it works

When you run a script or test from the TUI (`treq open`), t-req:

1. Starts a local server (if not already running)
2. Creates a scoped authentication token
3. Injects environment variables into the child process
4. Streams request/response data back to the TUI in real-time

```
┌──────────────┐     env vars      ┌──────────────┐
│              │ ──────────────►   │              │
│   TUI/Server │                   │  Your test   │
│              │ ◄──────────────   │  or script   │
│              │   HTTP requests   │              │
└──────────────┘   via server      └──────────────┘
```

Your code calls `createClient()` as usual. If the `TREQ_SERVER` environment variable is present, the client automatically routes requests through the server instead of executing them directly.

## Environment variables

These variables are injected automatically when running from the TUI:

| Variable | Description |
|----------|-------------|
| `TREQ_SERVER` | Base URL of the t-req server (e.g., `http://localhost:4096`) |
| `TREQ_FLOW_ID` | Flow ID that groups related executions together |
| `TREQ_SESSION_ID` | Pre-created session ID (skips session creation) |
| `TREQ_TOKEN` | Scoped token for authentication |

You never need to set these manually. They are injected by the TUI when it spawns your process.

## createClient() auto-detection

The `createClient()` function checks for `TREQ_SERVER` automatically:

```typescript
import { createClient } from '@t-req/core';

// No special configuration needed.
// If TREQ_SERVER is set, requests route through the server.
// If not, requests execute directly.
const client = createClient({
  variables: { baseUrl: 'https://api.example.com' },
});

const res = await client.run('./requests/users/list.http');
```

This means the same test code works both:

- **Standalone** — requests go directly to the target API
- **From the TUI** — requests route through the server for observability

## Security

Observer mode uses scoped tokens to restrict access:

- Each script/test run gets its own token
- Tokens are scoped to a specific flow and session
- Tokens are revoked when the process exits
- The server binds to `127.0.0.1` by default (localhost only)

## Works with any script

Observer mode is not limited to test files. Any script that uses `createClient()` benefits:

```bash
# From the TUI, run any script
treq open
# Then use the "Run Script" command to execute:
# node scripts/seed-database.js
# bun scripts/migrate.ts
# python scripts/load-test.py
```

As long as the script calls `createClient()` (JavaScript) or hits the server API (Python/other languages), all requests appear in the TUI.

## Server metadata

You can inspect the connection details programmatically:

```typescript
import { createClient } from '@t-req/core';
import { getServerMetadata } from '@t-req/core/server-metadata';

const client = createClient();
const meta = getServerMetadata(client);

if (meta) {
  console.log('Connected to:', meta.serverUrl);
  console.log('Session:', meta.sessionId);
  console.log('Flow:', meta.flowId);
}
```
