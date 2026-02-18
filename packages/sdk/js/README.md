# @t-req/sdk

TypeScript SDK for the [t-req](https://github.com/tensorix-labs/t-req) HTTP testing server.

## Installation

```bash
npm install @t-req/sdk
```

## Quick Start

### Client-only (connect to a running server)

```ts
import { createTreqClient } from "@t-req/sdk/client";

const client = createTreqClient({ baseUrl: "http://localhost:4097" });

// List workspace files
const files = await client.getWorkspaceFiles();

// Execute a request
const flow = await client.postFlows({ body: { file: "api.http" } });
```

### Full SDK (spawn server + client)

```ts
import { createTreq } from "@t-req/sdk";

const { client, server } = await createTreq({
  workspace: "./my-project",
});

const files = await client.getWorkspaceFiles();

// When done
server.close();
```

### Server-only

```ts
import { createTreqServer } from "@t-req/sdk/server";

const server = await createTreqServer({
  workspace: "./my-project",
  port: 4097,
});

console.log(`Server running at ${server.url}`);
server.close();
```

## Curl Import Helpers

The client package includes typed curl import helpers so you don't need to pass
`source: "curl"` or manually shape generic import payloads.

```ts
import {
  createTreqClient,
  importCurlPreviewStrict,
  importCurlApplyStrict,
} from "@t-req/sdk/client";

const client = createTreqClient({ baseUrl: "http://localhost:4097" });

const preview = await importCurlPreviewStrict(client, {
  command: "curl https://api.example.com/users",
  planOptions: { outputDir: "imports", onConflict: "fail" },
  convertOptions: { fileName: "users", requestName: "list users" },
});

const applied = await importCurlApplyStrict(client, {
  command: "curl https://api.example.com/users",
  applyOptions: {
    outputDir: "imports",
    onConflict: "overwrite",
    mergeVariables: false,
    force: false,
  },
});
```

## SSE Events

Subscribe to real-time execution events:

```ts
import { createTreqClient } from "@t-req/sdk/client";

const client = createTreqClient();
const { stream } = await client.getEvent();

for await (const event of stream) {
  console.log(event.event, event.data);
}
```

## WebSocket Helpers (protocol v1.1)

The SDK includes manual typed helpers for observer and request-session WebSocket flows on top of the generated REST client.

### Observer stream (`/event/ws`)

```ts
import { connectObserverWs } from "@t-req/sdk/client";

const observer = await connectObserverWs({
  baseUrl: "http://localhost:4097",
  flowId: "flow_abc",
  afterSeq: 42,
});

for await (const envelope of observer) {
  console.log(envelope.seq, envelope.type);
}
```

### Request session flow (`/execute/ws` + `/ws/session/{id}`)

```ts
import { createTreqClient, executeAndConnectRequestWs } from "@t-req/sdk/client";

const client = createTreqClient({ baseUrl: "http://localhost:4097" });

const { execute, connection } = await executeAndConnectRequestWs({
  client,
  request: {
    content: "# @ws\nGET wss://echo.websocket.events\n",
  },
});

connection.sendText("hello");
connection.sendJson({ type: "ping" });

for await (const envelope of connection) {
  console.log(envelope.type, envelope.payload);
}
```

### Reconnect + replay

Both helpers support reconnect with `afterSeq`:

- `observer.reconnect(afterSeq)`
- `connection.reconnect(afterSeq)`

Replay is bounded to server in-memory buffers (no durable history).

### v1.1 limitations

- Binary WebSocket payloads are unsupported in protocol `1.1`.
- `.http` WebSocket blocks are connection definitions only; message scripts are runtime-driven.

## Exports

| Path | Description |
|------|-------------|
| `@t-req/sdk` | Full SDK: client + server spawning |
| `@t-req/sdk/client` | HTTP client only |
| `@t-req/sdk/server` | Server process management only |

## License

MIT
