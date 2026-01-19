---
title: Types
description: TypeScript type definitions for @t-req/core
---

All types are exported from `@t-req/core` and subpath exports.

## Core Types

### From `@t-req/core`

```typescript
import type {
  // Parsing
  ParsedRequest,
  FileReference,
  FormField,

  // Interpolation
  InterpolateOptions,
  Interpolator,
  Resolver,

  // Execution
  ExecuteRequest,
  ExecuteOptions,

  // Client
  Client,
  ClientConfig,
  RunOptions,

  // File loading
  FileLoaderOptions,
  LoadedFile,

  // Form data building
  BuildFormDataOptions,
} from '@t-req/core';
```

## Parsing Types

### ParsedRequest

```typescript
interface ParsedRequest {
  name?: string;
  method: string;
  url: string;
  headers: Record<string, string>;
  body?: string;
  formData?: FormField[];
  bodyFile?: FileReference;
  raw: string;
  meta: Record<string, string>;
}
```

### FormField

```typescript
interface FormField {
  name: string;
  value: string;
  isFile: boolean;
  path?: string;
  filename?: string;
}
```

### FileReference

```typescript
interface FileReference {
  path: string;
  filename?: string;
}
```

## Client Types

### Client

```typescript
interface Client {
  run(path: string, options?: RunOptions): Promise<Response>;
  runString(content: string, options?: RunOptions): Promise<Response>;
  setVariable(key: string, value: unknown): void;
  setVariables(variables: Record<string, unknown>): void;
  getVariables(): Record<string, unknown>;
}
```

### ClientConfig

```typescript
interface ClientConfig {
  io?: IO;
  transport?: Transport;
  variables?: Record<string, unknown>;
  resolvers?: Record<string, Resolver>;
  cookieJar?: CookieJar;
  timeout?: number;
  defaults?: RequestDefaults;
}
```

### RunOptions

```typescript
interface RunOptions {
  variables?: Record<string, unknown>;
  timeout?: number;
  signal?: AbortSignal;
}
```

### RequestDefaults

```typescript
interface RequestDefaults {
  headers?: Record<string, string>;
  followRedirects?: boolean;
  validateSSL?: boolean;
}
```

## Interpolation Types

### Resolver

```typescript
type Resolver = (...args: string[]) => string | Promise<string>;
```

### Interpolator

```typescript
interface Interpolator {
  interpolate(
    template: string,
    variables: Record<string, unknown>
  ): Promise<string>;
}
```

### InterpolateOptions

```typescript
interface InterpolateOptions {
  resolvers?: Record<string, Resolver>;
  undefinedBehavior?: 'throw' | 'keep' | 'empty';
}
```

## Execution Types

### ExecuteRequest

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

## Runtime Types

### From `@t-req/core/runtime`

```typescript
import type { IO, Transport } from '@t-req/core/runtime';
```

### IO

```typescript
interface IO {
  readFile(path: string): Promise<string>;
  readBinaryFile(path: string): Promise<Uint8Array>;
  resolvePath(base: string, relative: string): string;
}
```

### Transport

```typescript
interface Transport {
  execute(request: ExecuteRequest): Promise<Response>;
}
```

## Cookie Types

### From `@t-req/core/cookies`

```typescript
import type { Cookie, CookieJar } from '@t-req/core/cookies';
```

### Cookie

```typescript
interface Cookie {
  key: string;
  value: string;
  domain: string;
  path: string;
  expires?: Date;
  httpOnly: boolean;
  secure: boolean;
  sameSite?: string;
  creation: Date;
  lastAccessed: Date;
}
```

## Config Types

### From `@t-req/core/config`

```typescript
import type {
  TReqConfig,
  ConfigDefaults,
  LoadConfigOptions,
  LoadConfigResult,
} from '@t-req/core/config';
```

### TReqConfig

```typescript
interface TReqConfig {
  variables?: Record<string, unknown>;
  resolvers?: Record<string, Resolver>;
  defaults?: ConfigDefaults;
}
```

### ConfigDefaults

```typescript
interface ConfigDefaults {
  timeoutMs?: number;
  headers?: Record<string, string>;
  followRedirects?: boolean;
  validateSSL?: boolean;
}
```

## Engine Types

### From `@t-req/core`

```typescript
import type {
  Engine,
  EngineConfig,
  EngineEvent,
} from '@t-req/core';
```

### EngineEvent

```typescript
type EngineEvent =
  | RequestStartEvent
  | RequestCompleteEvent
  | RequestErrorEvent;

interface RequestStartEvent {
  type: 'request:start';
  request: ExecuteRequest;
  timestamp: number;
}

interface RequestCompleteEvent {
  type: 'request:complete';
  request: ExecuteRequest;
  response: Response;
  duration: number;
  timestamp: number;
}

interface RequestErrorEvent {
  type: 'request:error';
  request?: ExecuteRequest;
  error: Error;
  timestamp: number;
}
```

## Type Helpers

### Generic Response Data

```typescript
async function getJson<T>(response: Response): Promise<T> {
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }
  return response.json() as Promise<T>;
}

// Usage
interface User {
  id: number;
  name: string;
}

const user = await getJson<User>(response);
```

### Typed Variables

```typescript
interface MyVariables {
  baseUrl: string;
  token: string;
  userId: number;
}

const client = createClient({
  variables: {
    baseUrl: 'https://api.example.com',
    token: 'secret',
    userId: 123,
  } satisfies MyVariables,
});
```
