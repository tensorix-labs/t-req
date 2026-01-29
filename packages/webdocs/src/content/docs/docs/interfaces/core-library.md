---
title: Core Library
description: Use t-req as a JavaScript/TypeScript library.
---

`@t-req/core` is the JavaScript library that powers the CLI and TUI. Use it to parse and execute `.http` files programmatically.

## Installation

```bash
npm install @t-req/core
```

Or with other package managers:

```bash
bun add @t-req/core
pnpm add @t-req/core
```

## Quick start

```typescript
import { createClient } from '@t-req/core';

const client = createClient({
  variables: { baseUrl: 'https://api.example.com' },
});

const response = await client.run('./requests/get-users.http');
const data = await response.json();

console.log(data);

await client.close();
```

## Client API

### createClient(config?)

Create a client instance for executing requests.

```typescript
import { createClient, createCookieJar } from '@t-req/core';

const client = createClient({
  variables: {
    baseUrl: 'https://api.example.com',
    token: 'my-api-token',
  },
  cookieJar: createCookieJar(),
  timeout: 30000,
});
```

### ClientConfig

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `variables` | `Record<string, unknown>` | `{}` | Variables available to all requests |
| `resolvers` | `Record<string, Resolver>` | `{}` | Custom resolver functions |
| `cookieJar` | `CookieJar` | — | Cookie jar for automatic cookie handling |
| `timeout` | `number` | `30000` | Default timeout in milliseconds |
| `defaults.headers` | `Record<string, string>` | — | Default headers for all requests |
| `defaults.followRedirects` | `boolean` | `true` | Follow HTTP redirects |
| `defaults.validateSSL` | `boolean` | `true` | Validate SSL certificates |
| `defaults.proxy` | `string` | — | Proxy URL |

### Server mode options

Connect to a running t-req server instead of executing locally:

| Option | Type | Description |
|--------|------|-------------|
| `server` | `string` | Server URL (e.g., `http://localhost:4096`) |
| `serverToken` | `string` | Bearer token for authentication |
| `profile` | `string` | Server-side config profile to use |

```typescript
const client = createClient({
  server: 'http://localhost:4096',
  serverToken: process.env.TREQ_TOKEN,
  profile: 'staging',
});
```

### client.run(path, options?)

Execute a request from a `.http` file. Returns a native `Response` object.

```typescript
const response = await client.run('./requests/api.http');
const data = await response.json();
```

#### Multiple requests in a file

If the file contains multiple requests, the first one is executed by default. Use request index or name to select a specific request:

```typescript
// By index (0-based)
await client.run('./api.http', { variables: { __requestIndex: 0 } });

// The file is parsed and the first request is executed
```

### client.runString(content, options?)

Execute a request from an in-memory string:

```typescript
const httpContent = `
GET https://api.example.com/users
Authorization: Bearer {{token}}
`;

const response = await client.runString(httpContent, {
  variables: { token: 'my-token' },
  basePath: process.cwd(), // For resolving file references
});
```

### RunOptions

| Option | Type | Description |
|--------|------|-------------|
| `variables` | `Record<string, unknown>` | Additional variables for this request |
| `timeout` | `number` | Timeout for this request (overrides default) |
| `signal` | `AbortSignal` | Abort signal for cancellation |
| `basePath` | `string` | Base path for file references (runString only) |

### client.setVariable(key, value)

Set a single variable:

```typescript
client.setVariable('token', newToken);
```

### client.setVariables(vars)

Merge multiple variables:

```typescript
client.setVariables({
  token: newToken,
  userId: '123',
});
```

### client.getVariables()

Get a copy of all current variables:

```typescript
const vars = client.getVariables();
console.log(vars.baseUrl);
```

### client.close()

Close the client and release resources:

```typescript
await client.close();
```

For server-mode clients, this finishes the current flow.

### Async disposal

With TypeScript 5.2+, use `await using` for automatic cleanup:

```typescript
await using client = createClient({ server: 'http://localhost:4096' });
const res = await client.run('./auth/login.http');
// client.close() called automatically when scope exits
```

## Parsing API

### parse(content)

Parse `.http` file content into structured request objects:

```typescript
import { parse } from '@t-req/core';

const requests = parse(`
### Get users
GET https://api.example.com/users

### Create user
POST https://api.example.com/users
Content-Type: application/json

{"name": "Alice"}
`);

console.log(requests.length); // 2
console.log(requests[0].name); // "Get users"
console.log(requests[0].method); // "GET"
```

### parseFile(path)

Parse a `.http` file from the filesystem:

```typescript
import { parseFile } from '@t-req/core';

const requests = await parseFile('./requests/api.http');
```

### ParsedRequest

The structure returned by `parse()` and `parseFile()`:

```typescript
interface ParsedRequest {
  /** Optional request name from ### or @name */
  name?: string;
  /** HTTP method (GET, POST, etc.) */
  method: string;
  /** Full URL with any query parameters */
  url: string;
  /** Request headers */
  headers: Record<string, string>;
  /** Request body (if present) */
  body?: string;
  /** File reference if using < ./path syntax */
  bodyFile?: { path: string };
  /** Form fields if using form syntax */
  formData?: FormField[];
  /** Original raw content */
  raw: string;
  /** Meta directives (@name, @timeout, etc.) */
  meta: Record<string, string>;
}
```

## Custom resolvers

Create custom resolvers for dynamic values:

```typescript
const client = createClient({
  resolvers: {
    $timestamp: () => String(Date.now()),
    $uuid: () => crypto.randomUUID(),
    $env: (key) => process.env[key] || '',
    $random: (min = '0', max = '100') => {
      const n = Math.floor(
        Math.random() * (Number(max) - Number(min) + 1)
      ) + Number(min);
      return String(n);
    },
  },
});
```

### Async resolvers

Resolvers can be async:

```typescript
const client = createClient({
  resolvers: {
    $secret: async (key) => {
      const secret = await fetchFromVault(key);
      return secret;
    },
  },
});
```

### Resolver arguments

Resolvers receive arguments as strings from the template:

```http
{{$random(1, 100)}}
{{$env(API_KEY)}}
```

Arguments are parsed as JSON if possible, otherwise passed as single string.

## Cookie management

### createCookieJar()

Create a cookie jar for automatic cookie handling:

```typescript
import { createClient, createCookieJar } from '@t-req/core';

const cookieJar = createCookieJar();

const client = createClient({
  cookieJar,
});

// Cookies from Set-Cookie headers are automatically stored
await client.run('./auth/login.http');

// And sent with subsequent requests
await client.run('./api/profile.http');
```

The cookie jar follows RFC 6265 (same behavior as browsers).

## Error handling

```typescript
try {
  const response = await client.run('./api.http');

  if (!response.ok) {
    console.error(`HTTP ${response.status}: ${response.statusText}`);
    return;
  }

  const data = await response.json();
} catch (error) {
  if (error.name === 'AbortError') {
    console.log('Request was cancelled');
  } else if (error.message.includes('Undefined variable')) {
    console.error('Missing variable:', error.message);
  } else {
    console.error('Request failed:', error);
  }
}
```

### Timeout handling

```typescript
const controller = new AbortController();
const timeoutId = setTimeout(() => controller.abort(), 5000);

try {
  const response = await client.run('./api.http', {
    signal: controller.signal,
  });
  clearTimeout(timeoutId);
} catch (error) {
  if (error.name === 'AbortError') {
    console.log('Request timed out');
  }
}
```

Or use the built-in timeout option:

```typescript
const response = await client.run('./api.http', {
  timeout: 5000, // 5 seconds
});
```

## TypeScript types

All types are exported from the package:

```typescript
import type {
  Client,
  ClientConfig,
  RunOptions,
  ParsedRequest,
  FormField,
  FileReference,
  Resolver,
  InterpolateOptions,
} from '@t-req/core';
```

## Example: Test integration

```typescript
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createClient, createCookieJar } from '@t-req/core';

describe('User API', () => {
  let client;

  beforeAll(() => {
    client = createClient({
      variables: { baseUrl: 'http://localhost:3000' },
      cookieJar: createCookieJar(),
    });
  });

  afterAll(async () => {
    await client.close();
  });

  it('lists users', async () => {
    const res = await client.run('./requests/users/list.http');
    expect(res.status).toBe(200);

    const data = await res.json();
    expect(data.users).toBeInstanceOf(Array);
  });

  it('creates a user', async () => {
    client.setVariable('userName', 'Test User');

    const res = await client.run('./requests/users/create.http');
    expect(res.status).toBe(201);

    const user = await res.json();
    expect(user.name).toBe('Test User');
  });
});
```

See [BYO Test Runner](/docs/guides/byo-test-runner) for more testing patterns.
