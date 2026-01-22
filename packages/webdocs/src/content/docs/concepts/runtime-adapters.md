---
title: Runtime Adapters
description: IO and Transport adapters for different runtime environments
---

@t-req/core uses adapters to abstract filesystem and network operations, making it work across Node.js, Bun, and desktop environments like Tauri.

## Two Types of Adapters

### IO Adapter

Handles filesystem operations (reading `.http` files, loading referenced files):

```typescript
interface IO {
  readFile(path: string): Promise<string>;
  readBinaryFile(path: string): Promise<Uint8Array>;
  resolvePath(base: string, relative: string): string;
}
```

### Transport Adapter

Handles HTTP execution:

```typescript
interface Transport {
  execute(request: ExecuteRequest): Promise<Response>;
}
```

## Node.js Setup

In Node.js, you must provide an IO adapter for file-based operations:

```typescript
import { createClient } from '@t-req/core';
import { createNodeIO } from '@t-req/core/runtime';

const client = createClient({
  io: createNodeIO(),
});

// Now you can run from files
const response = await client.run('./api/users.http');
```

Without the IO adapter, `client.run()` will fail. However, `client.runString()` always works since it doesn't need filesystem access.

## Bun Setup

Bun works out of the box—@t-req/core automatically uses Bun's filesystem APIs when no IO adapter is provided:

```typescript
import { createClient } from '@t-req/core';

const client = createClient();

// Works without explicit IO adapter
const response = await client.run('./api/users.http');
```

## Desktop Apps (Tauri)

For Tauri or Electron apps, the renderer process typically can't access the filesystem directly. Use `runString()` with content from your backend:

```typescript
import { createClient } from '@t-req/core';

const client = createClient();

// Get .http content from Tauri backend
const httpContent = await invoke('read_http_file', { path: './api/users.http' });

// Run from string - no filesystem access needed
const response = await client.runString(httpContent, {
  variables: { userId: '123' },
});
```

### Custom IO Adapter for Tauri

If you need file references (`< ./payload.json`) to work, create a custom IO adapter that bridges to your backend:

```typescript
import { createClient } from '@t-req/core';
import { invoke } from '@tauri-apps/api/core';

const tauriIO = {
  async readFile(path: string): Promise<string> {
    return invoke('read_file', { path });
  },
  async readBinaryFile(path: string): Promise<Uint8Array> {
    const bytes = await invoke('read_binary_file', { path });
    return new Uint8Array(bytes);
  },
  resolvePath(base: string, relative: string): string {
    // Implement path resolution logic
    return `${base}/${relative}`;
  },
};

const client = createClient({
  io: tauriIO,
});
```

## Custom Transport

Override the default fetch-based transport for custom HTTP handling:

```typescript
import { createClient } from '@t-req/core';
import { createFetchTransport } from '@t-req/core/runtime';

// Custom fetch with logging
const customFetch = async (url, init) => {
  console.log(`Fetching: ${url}`);
  const response = await fetch(url, init);
  console.log(`Response: ${response.status}`);
  return response;
};

const client = createClient({
  transport: createFetchTransport(customFetch),
});
```

## Engine with Explicit Adapters

The low-level engine API requires explicit adapters:

```typescript
import { createEngine } from '@t-req/core';
import { createFetchTransport, createNodeIO } from '@t-req/core/runtime';

const engine = createEngine({
  io: createNodeIO(),
  transport: createFetchTransport(fetch),
  onEvent: (e) => console.log(e),
});

// Run from file
await engine.runFile('./api/users.http');

// Run from string (no IO needed)
await engine.runString('GET https://example.com\n');
```

## When IO is Required

| Operation | IO Required |
|-----------|-------------|
| `client.run('./file.http')` | Yes |
| `client.runString(content)` | No |
| File reference `< ./payload.json` | Yes |
| File upload `file = @./upload.pdf` | Yes |
| Inline body content | No |

## Runtime Detection

@t-req/core automatically detects Bun and uses native APIs. For other environments, provide the appropriate adapters:

```typescript
import { createClient } from '@t-req/core';
import { createNodeIO } from '@t-req/core/runtime';

const client = createClient({
  // Only needed in Node.js - Bun auto-detects
  io: typeof Bun !== 'undefined' ? undefined : createNodeIO(),
});
```
