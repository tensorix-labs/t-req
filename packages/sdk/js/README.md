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

## Exports

| Path | Description |
|------|-------------|
| `@t-req/sdk` | Full SDK: client + server spawning |
| `@t-req/sdk/client` | HTTP client only |
| `@t-req/sdk/server` | Server process management only |

## License

MIT
