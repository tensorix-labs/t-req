---
title: Client
description: API reference for createClient, createRemoteClient, and the Client interface
---

The Client is the primary interface for executing HTTP requests in @t-req/core.

## createClient

Creates a new client instance.

```typescript
import { createClient } from '@t-req/core';
import { createNodeIO } from '@t-req/core/runtime';

const client = createClient({
  io: createNodeIO(),
  variables: { baseUrl: 'https://api.example.com' },
});
```

### Options

| Option | Type | Description |
|--------|------|-------------|
| `io` | `IO` | Filesystem adapter for file operations. Required in Node.js for `run()`. |
| `transport` | `Transport` | HTTP transport adapter. Defaults to fetch-based transport. |
| `variables` | `Record<string, unknown>` | Initial variables available to all requests. |
| `resolvers` | `Record<string, Resolver>` | Custom resolver functions for dynamic values. |
| `cookieJar` | `CookieJar` | Cookie jar for automatic cookie management. |
| `timeout` | `number` | Default timeout in milliseconds for all requests. |
| `defaults` | `RequestDefaults` | Default headers and request settings. |

### RequestDefaults

```typescript
interface RequestDefaults {
  headers?: Record<string, string>;
  followRedirects?: boolean;
  validateSSL?: boolean;
}
```

## createRemoteClient

Creates a client that routes requests through `treq serve` (the `@t-req/app` server) instead of executing locally. This is primarily used for **Observer Mode** (TUI / event streaming / execution store) while keeping the same high-level API (`run`, `runString`, `setVariable(s)`).

```typescript
import { createRemoteClient } from '@t-req/core';

const client = createRemoteClient({
  serverUrl: 'http://localhost:4096',
  // Optional bearer token if the server requires it:
  // token: process.env.TREQ_TOKEN,
  variables: { baseUrl: 'https://api.example.com' }
});

await client.run('./auth/login.http');
client.setVariable('token', '...');
await client.close(); // finishes the flow (best-effort; server TTL still applies)
```

### Options

| Option | Type | Description |
|--------|------|-------------|
| `serverUrl` | `string` | Base URL for the server (e.g. `http://localhost:4096`). |
| `token` | `string` | Bearer token (if the server is started with `--token`). |
| `variables` | `Record<string, unknown>` | Initial variables (synced to the server session). |
| `flowLabel` | `string` | Optional flow label (shown in Observer Mode). |
| `flowMeta` | `Record<string, unknown>` | Optional flow metadata. |
| `profile` | `string` | Optional server config profile. |
| `timeout` | `number` | Default timeout in milliseconds. |

### Additional Methods

Remote clients also expose:

- `close(): Promise<void>`
- `getSessionId(): string | undefined`
- `getFlowId(): string | undefined`

## Client Methods

### run(path, options?)

Execute a request from a `.http` file.

```typescript
const response = await client.run('./api/users.http');

// With options
const response = await client.run('./api/user.http', {
  variables: { userId: '123' },
  timeout: 5000,
  signal: controller.signal,
});
```

#### Parameters

| Parameter | Type | Description |
|-----------|------|-------------|
| `path` | `string` | Path to the `.http` file |
| `options` | `RunOptions` | Optional request configuration |

#### RunOptions

```typescript
interface RunOptions {
  variables?: Record<string, unknown>;
  timeout?: number;
  signal?: AbortSignal;
}
```

#### Returns

`Promise<Response>` - Standard Fetch API Response object.

### runString(content, options?)

Execute a request from in-memory `.http` content.

```typescript
const response = await client.runString(`
GET https://api.example.com/users/{{userId}}
Authorization: Bearer {{token}}
`, {
  variables: { userId: '123', token: 'abc' },
});
```

#### Parameters

| Parameter | Type | Description |
|-----------|------|-------------|
| `content` | `string` | The `.http` file content |
| `options` | `RunOptions` | Optional request configuration |

#### Returns

`Promise<Response>` - Standard Fetch API Response object.

### setVariable(key, value)

Set a single variable.

```typescript
client.setVariable('token', 'new-jwt-token');
client.setVariable('userId', 123);
```

### setVariables(variables)

Set multiple variables at once.

```typescript
client.setVariables({
  token: 'new-token',
  userId: 123,
  env: 'production',
});
```

### getVariables()

Get all current variables.

```typescript
const vars = client.getVariables();
console.log(vars);
// { baseUrl: 'https://...', token: '...', userId: 123 }
```

## Full Example

```typescript
import { createClient } from '@t-req/core';
import { createNodeIO } from '@t-req/core/runtime';
import { createCookieJar } from '@t-req/core/cookies';

const client = createClient({
  io: createNodeIO(),

  variables: {
    baseUrl: 'https://api.example.com',
  },

  resolvers: {
    $env: (key) => process.env[key] || '',
    $timestamp: () => String(Date.now()),
    $uuid: () => crypto.randomUUID(),
  },

  cookieJar: createCookieJar(),

  timeout: 30000,

  defaults: {
    headers: {
      'User-Agent': 'my-app/1.0',
      'Accept': 'application/json',
    },
    followRedirects: true,
    validateSSL: true,
  },
});

// Login
const loginResponse = await client.run('./auth/login.http');
const { token } = await loginResponse.json();
client.setVariable('token', token);

// Use authenticated API
const usersResponse = await client.run('./api/users.http');
const users = await usersResponse.json();
```

## TypeScript Types

```typescript
import type { Client, ClientConfig, RunOptions } from '@t-req/core';
```
