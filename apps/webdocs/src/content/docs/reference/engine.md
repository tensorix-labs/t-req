---
title: Engine
description: API reference for createEngine and the Engine interface
---

The Engine provides low-level control over request execution with event callbacks.

## createEngine

Creates a new engine instance.

```typescript
import { createEngine } from '@t-req/core';
import { createFetchTransport, createNodeIO } from '@t-req/core/runtime';

const engine = createEngine({
  io: createNodeIO(),
  transport: createFetchTransport(fetch),
  onEvent: (event) => console.log(event),
});
```

### Options

| Option | Type | Description |
|--------|------|-------------|
| `io` | `IO` | Filesystem adapter for file operations. |
| `transport` | `Transport` | HTTP transport adapter. Required. |
| `variables` | `Record<string, unknown>` | Initial variables. |
| `resolvers` | `Record<string, Resolver>` | Custom resolver functions. |
| `cookieJar` | `CookieJar` | Cookie jar for cookie management. |
| `onEvent` | `(event: EngineEvent) => void` | Event callback for request lifecycle events. |

## Engine Methods

### runFile(path, options?)

Execute a request from a `.http` file.

```typescript
const response = await engine.runFile('./api/users.http', {
  variables: { userId: '123' },
});
```

### runString(content, options?)

Execute a request from in-memory content.

```typescript
const response = await engine.runString(`
GET https://api.example.com/users
Accept: application/json
`);
```

## Engine Events

The engine emits events throughout the request lifecycle:

### request:start

Emitted when a request begins.

```typescript
{
  type: 'request:start',
  request: {
    method: 'GET',
    url: 'https://api.example.com/users',
    headers: { ... },
  },
  timestamp: 1234567890,
}
```

### request:complete

Emitted when a request completes successfully.

```typescript
{
  type: 'request:complete',
  request: { ... },
  response: Response,
  duration: 123, // milliseconds
  timestamp: 1234567890,
}
```

### request:error

Emitted when a request fails.

```typescript
{
  type: 'request:error',
  request: { ... },
  error: Error,
  timestamp: 1234567890,
}
```

## Event Handling Example

```typescript
import { createEngine } from '@t-req/core';
import { createFetchTransport } from '@t-req/core/runtime';

const engine = createEngine({
  transport: createFetchTransport(fetch),
  onEvent: (event) => {
    switch (event.type) {
      case 'request:start':
        console.log(`Starting: ${event.request.method} ${event.request.url}`);
        break;

      case 'request:complete':
        console.log(`Completed: ${event.response.status} in ${event.duration}ms`);
        break;

      case 'request:error':
        console.error(`Failed: ${event.error.message}`);
        break;
    }
  },
});

await engine.runString('GET https://api.example.com/users\n');
```

## Use Cases

The Engine is useful for:

- **TUI applications** - Display request progress and status
- **Desktop apps** - Show loading states and timing
- **Logging** - Record all requests for debugging
- **Metrics** - Collect request timing data
- **Custom transports** - Test with mock HTTP responses

## Client vs Engine

| Feature | Client | Engine |
|---------|--------|--------|
| Simplicity | Higher-level API | Lower-level API |
| Events | No | Yes |
| Variable management | Built-in methods | Manual |
| Use case | Most applications | TUI, desktop, advanced |

## TypeScript Types

```typescript
import type {
  Engine,
  EngineConfig,
  EngineEvent,
  RequestStartEvent,
  RequestCompleteEvent,
  RequestErrorEvent,
} from '@t-req/core';
```
