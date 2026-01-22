---
title: Runtime
description: API reference for IO and Transport adapters
---

Runtime adapters abstract filesystem and network operations for different environments.

## IO Adapter

The IO adapter handles filesystem operations.

### Interface

```typescript
interface IO {
  readFile(path: string): Promise<string>;
  readBinaryFile(path: string): Promise<Uint8Array>;
  resolvePath(base: string, relative: string): string;
}
```

### createNodeIO

Creates an IO adapter for Node.js.

```typescript
import { createNodeIO } from '@t-req/core/runtime';

const io = createNodeIO();

const client = createClient({
  io: io,
});
```

Uses Node.js `fs/promises` for file operations.

### Bun Auto-Detection

In Bun, the IO adapter is optional. @t-req/core automatically uses Bun's filesystem APIs:

```typescript
const client = createClient(); // No io needed in Bun
```

### Custom IO Adapter

Create custom adapters for other environments:

```typescript
const customIO: IO = {
  async readFile(path: string): Promise<string> {
    // Your implementation
    return await myFileSystem.read(path);
  },

  async readBinaryFile(path: string): Promise<Uint8Array> {
    // Your implementation
    return await myFileSystem.readBinary(path);
  },

  resolvePath(base: string, relative: string): string {
    // Your path resolution logic
    return myPathResolver.resolve(base, relative);
  },
};

const client = createClient({ io: customIO });
```

## Transport Adapter

The Transport adapter handles HTTP execution.

### Interface

```typescript
interface Transport {
  execute(request: ExecuteRequest): Promise<Response>;
}
```

### createFetchTransport

Creates a transport using the Fetch API.

```typescript
import { createFetchTransport } from '@t-req/core/runtime';

// Using global fetch
const transport = createFetchTransport(fetch);

// Using custom fetch
const transport = createFetchTransport(customFetch);
```

### ExecuteRequest

The request object passed to transport:

```typescript
interface ExecuteRequest {
  method: string;
  url: string;
  headers: Record<string, string>;
  body?: string | Uint8Array | FormData;
  timeout?: number;
  signal?: AbortSignal;
}
```

### Custom Transport

Create custom transports for testing or special requirements:

```typescript
const mockTransport: Transport = {
  async execute(request: ExecuteRequest): Promise<Response> {
    // Return mock response
    return new Response(JSON.stringify({ mock: true }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  },
};

const client = createClient({ transport: mockTransport });
```

### Logging Transport

Wrap the default transport for logging:

```typescript
import { createFetchTransport } from '@t-req/core/runtime';

function createLoggingTransport() {
  const inner = createFetchTransport(fetch);

  return {
    async execute(request: ExecuteRequest): Promise<Response> {
      console.log(`→ ${request.method} ${request.url}`);
      const start = performance.now();

      try {
        const response = await inner.execute(request);
        const duration = performance.now() - start;
        console.log(`← ${response.status} (${duration.toFixed(0)}ms)`);
        return response;
      } catch (error) {
        console.log(`✗ Error: ${error.message}`);
        throw error;
      }
    },
  };
}
```

## Auto Transport

@t-req/core provides auto-detection for the transport:

```typescript
import { createAutoTransport } from '@t-req/core/runtime';

// Automatically uses the appropriate fetch implementation
const transport = createAutoTransport();
```

## Runtime Detection

Check the current runtime:

```typescript
const isBun = typeof Bun !== 'undefined';
const isNode = typeof process !== 'undefined' && process.versions?.node;

// Configure based on runtime
const client = createClient({
  io: isBun ? undefined : createNodeIO(),
});
```

## TypeScript Types

```typescript
import type {
  IO,
  Transport,
  ExecuteRequest,
} from '@t-req/core/runtime';
```
