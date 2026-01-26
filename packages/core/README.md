# @t-req/core

HTTP request parsing, execution, and testing. Define requests in `.http` files, test them in isolation.

[![npm version](https://img.shields.io/npm/v/@t-req/core.svg)](https://www.npmjs.com/package/@t-req/core)
[![npm downloads](https://img.shields.io/npm/dm/@t-req/core.svg)](https://www.npmjs.com/package/@t-req/core)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.0+-blue.svg)](https://www.typescriptlang.org/)

## Features

- **Parse `.http` files** - Standard format used by VS Code REST Client, JetBrains HTTP Client
- **Variable interpolation** - `{{variable}}` syntax with custom resolvers
- **Native fetch Response** - Returns standard `Response` objects, no wrapper
- **Cookie management** - Automatic cookie jar with RFC 6265 compliance
- **Timeout & cancellation** - Built-in timeout and AbortSignal support
- **TypeScript first** - Full type definitions included

## Philosophy

**Requests are just code.** No DSL, no hidden state machines. Each `.http` file contains one request, and you orchestrate them with standard JavaScript:

```typescript
// Login and get token
const login = await client.run('./auth/login.http');
const { token } = await login.json();

// Use token for subsequent requests
client.setVariable('token', token);

// Fetch profile
const profile = await client.run('./users/profile.http');

// Standard control flow for complex scenarios
for (const id of userIds) {
  await client.run('./users/get.http', { variables: { userId: id } });
}
```

## Installation

```bash
# Runtime: Node (>=18) or Bun
# npm
npm install @t-req/core

# bun
bun add @t-req/core

#yarn
yarn add @t-req/core

# pnpm
pnpm add @t-req/core
```

## Quick Start

Create a `.http` file:

```http
# auth/login.http
POST https://api.example.com/auth/login
Content-Type: application/json

{"email": "{{email}}", "password": "{{password}}"}
```

Run it:

```typescript
import { createClient } from '@t-req/core';
import { createNodeIO } from '@t-req/core/runtime';

const client = createClient({
  // Required in Node to run from files.
  // In Bun, you can omit this and the library will use Bun's filesystem APIs.
  io: createNodeIO(),
  variables: {
    email: 'user@example.com',
    password: 'secret',
  },
});

const response = await client.run('./auth/login.http');
const { token } = await response.json();

console.log('Logged in, token:', token);
```

If you're running inside an editor/desktop app (e.g. Tauri), prefer `runString()` (no filesystem needed):

```typescript
import { createClient } from '@t-req/core';

const client = createClient();

const response = await client.runString(
  `POST https://api.example.com/auth/login
Content-Type: application/json

{"email":"{{email}}","password":"{{password}}"}
`,
  { variables: { email: 'user@example.com', password: 'secret' } }
);
```

## API Reference

### Client

The primary way to execute requests. Handles variable interpolation, cookies, and request execution.

```typescript
import { createClient } from '@t-req/core';
import { createNodeIO } from '@t-req/core/runtime';
import { createCookieJar } from '@t-req/core/cookies';

const client = createClient({
  // Required in Node to run from files.
  // In Bun, you can omit this and the library will use Bun's filesystem APIs.
  io: createNodeIO(),

  // Connect to TUI/server for observability (optional)
  // Auto-detected from TREQ_SERVER env var when run from TUI
  server: 'http://localhost:4096',

  // Optional auth token for server mode
  serverToken: process.env.TREQ_TOKEN,

  // Variables available to all requests
  variables: {
    baseUrl: 'https://api.example.com',
  },

  // Custom resolvers for dynamic values
  resolvers: {
    $env: (key) => process.env[key] || '',
    $timestamp: () => String(Date.now()),
    $uuid: () => crypto.randomUUID(),
  },

  // Automatic cookie handling
  cookieJar: createCookieJar(),

  // Default timeout for all requests (ms)
  timeout: 30000,

  // Default settings
  defaults: {
    headers: { 'User-Agent': 'my-app/1.0' },
    followRedirects: true,
    validateSSL: true,
  },
});

// Run a request from a .http file
const response = await client.run('./api/users.http');

// Run with additional variables
const response = await client.run('./api/user.http', {
  variables: { userId: '123' },
});

// Run with timeout override
const response = await client.run('./api/slow.http', {
  timeout: 60000,
});

// Run with AbortSignal for cancellation
const controller = new AbortController();
const response = await client.run('./api/users.http', {
  signal: controller.signal,
});

// Run from in-memory `.http` content (great for editors/TUI/desktop)
const res2 = await client.runString(
  `GET {{baseUrl}}/users
Accept: application/json
`,
  { variables: { baseUrl: 'https://api.example.com' } }
);

// Update variables at runtime
client.setVariable('token', 'new-token');
client.setVariables({ a: 1, b: 2 });
console.log(client.getVariables());
```

### Server Mode (TUI / Observability)

When you want requests to appear in the TUI or web dashboard, the client can route
requests through a t-req server instead of executing them locally.

**Automatic detection:** When scripts are run from the TUI (via script runner),
the `TREQ_SERVER` environment variable is automatically injected. Your scripts
work without any code changes.

**Manual configuration:** For scripts run from a separate terminal:

```typescript
const client = createClient({
  server: 'http://localhost:4096',  // or set TREQ_SERVER env var
  variables: { ... }
});
```

**Behavior:**
- No `server` option + no `TREQ_SERVER` → Local mode (direct execution)
- `server` option OR `TREQ_SERVER` set → Server mode (routed through server)
- Server mode creates a session and flow for observability
- Call `client.close()` when done to finalize the flow

**Server-specific methods:**
- `close(): Promise<void>` - Finalize the session/flow
- `[Symbol.asyncDispose]` - Supports `await using` syntax

### Response

`client.run()` returns a native [`Response`](https://developer.mozilla.org/en-US/docs/Web/API/Response) object:

```typescript
const response = await client.run('./api/users.http');

// Standard Response properties
console.log(response.status);     // 200
console.log(response.statusText); // "OK"
console.log(response.ok);         // true
console.log(response.headers);    // Headers object

// Standard Response methods (async)
const json = await response.json();
const text = await response.text();
const blob = await response.blob();
```

### Parsing

Parse `.http` file content into structured request objects. Useful for inspection or custom execution.

```typescript
import { parse, parseFileWithIO } from '@t-req/core';
import { createNodeIO } from '@t-req/core/runtime';

// Parse string content
const requests = parse(`
### Get Users
GET https://api.example.com/users
Authorization: Bearer token

### Create User
POST https://api.example.com/users
Content-Type: application/json

{"name": "John", "email": "john@example.com"}
`);

// Parse from file (Node example)
const io = createNodeIO();
const requests = await parseFileWithIO('./api.http', io);

// Access parsed request
console.log(requests[0].name);    // "Get Users"
console.log(requests[0].method);  // "GET"
console.log(requests[0].url);     // "https://api.example.com/users"
console.log(requests[0].headers); // { Authorization: "Bearer token" }
console.log(requests[0].body);    // undefined
console.log(requests[0].meta);    // { } - meta directives from # @key value
```

### Filesystem (IO adapters)

Any feature that reads from disk (like `client.run('./file.http')`, `< ./payload.json`, or `@./file` uploads) requires filesystem access:

- **Bun**: works out of the box (uses Bun's filesystem APIs when you don't provide an IO adapter).
- **Node**: pass `io: createNodeIO()` to `createClient()` or `createEngine()`.
- **Tauri desktop**: your renderer should use `runString()` for editor buffers; for `runFile()` you must provide an IO adapter that calls your Tauri commands (we recommend enforcing workspace root access in the backend).

### Interpolation

Replace `{{variables}}` in strings or objects.

```typescript
import { interpolate, createInterpolator } from '@t-req/core';

// Simple interpolation
const result = interpolate('Hello {{name}}!', { name: 'World' });
// "Hello World!"

// Nested object paths
const result = interpolate('User: {{user.name}}', {
  user: { name: 'John' }
});
// "User: John"

// Custom resolvers for dynamic values
const interp = createInterpolator({
  resolvers: {
    $env: (key) => process.env[key] || '',
    $timestamp: () => String(Date.now()),
    $random: (min = '0', max = '100') =>
      String(Math.floor(Math.random() * (Number(max) - Number(min) + 1)) + Number(min)),
  },
});

const result = await interp.interpolate(
  // Resolver args: prefer JSON-array args for unambiguous parsing.
  // Example: {{$random([1,10])}}
  'KEY={{$env(API_KEY)}}&t={{$timestamp([])}}&r={{$random([1,10])}}',
  {}
);
```

### Cookie Jar

Manage cookies across requests with persistence support. Uses [tough-cookie](https://github.com/salesforce/tough-cookie) internally for RFC 6265-ish behavior and edge-case handling.

```typescript
import { createCookieJar, CookieJar } from '@t-req/core/cookies';

const jar = createCookieJar();

// Set cookies from a Set-Cookie header
jar.setCookieSync('session=abc123; Path=/', 'https://example.com/');

// Read cookies for a URL
const cookies = jar.getCookiesSync('https://example.com/api');
console.log(cookies.map((c) => `${c.key}=${c.value}`));

// Get the Cookie header string for a request
const cookieHeader = jar.getCookieStringSync('https://example.com/api');
// "session=abc123"

// Persist the jar (tough-cookie native format)
const snapshot = jar.serializeSync();
await Bun.write('./cookies.json', JSON.stringify(snapshot, null, 2)); // Bun example

// Node example:
// import { writeFile, readFile } from 'node:fs/promises';
// await writeFile('./cookies.json', JSON.stringify(snapshot, null, 2), 'utf8');

// Restore into a fresh jar
const loaded = JSON.parse(await Bun.file('./cookies.json').text());
const jar2 = CookieJar.deserializeSync(loaded);
console.log(jar2.getCookieStringSync('https://example.com/api'));
```

#### Security Features

- **Domain scope validation**: Cookies can only be set for the request domain or its parent domains
- **Public suffix protection**: Rejects cookies for public suffixes like `.com`, `.co.uk`, `.github.io`, etc. (enabled by default)
- **Secure cookie enforcement**: Secure cookies are only accepted from HTTPS origins and only sent over HTTPS
- **RFC 6265 ordering**: Cookies are sorted by path length (longest first), then by creation time

#### Public suffix compatibility mode

If you need compatibility with servers that incorrectly set cookies for public suffixes, you can opt out (not recommended):

```typescript
import { createCookieJar } from '@t-req/core/cookies';

const jar = createCookieJar({ rejectPublicSuffixes: false });
```

## Engine (advanced)

The engine centralizes parsing/interpolation/compilation/execution behind explicit runtime adapters. This is useful for building a TUI/desktop/agent that needs structured events and `runString()`.

```typescript
import { createEngine } from '@t-req/core';
import { createFetchTransport } from '@t-req/core/runtime';

const engine = createEngine({
  transport: createFetchTransport(fetch),
  onEvent: (e) => console.log(e)
});

await engine.runString('GET https://example.com\n');
```

## Config (JSON/JSONC-first)

The CLI/server config system is **JSON/JSONC-first**:

- Preferred: `treq.jsonc`, `treq.json`
- Legacy (deprecated): `treq.config.ts`, `treq.config.js`, `treq.config.mjs`

### `treq.jsonc` example

```jsonc
{
  "variables": {
    "baseUrl": "http://localhost:3000",
    "apiKey": "{env:API_KEY}"
  },
  "defaults": {
    "timeoutMs": 30000,
    "headers": {
      "Accept": "application/json"
    }
  },
  // Uncomment to persist cookies between runs:
  // "cookies": {
  //   "enabled": true,
  //   "jarPath": ".treq/cookies.json"
  // },
  "profiles": {
    "dev": {
      "variables": { "baseUrl": "http://localhost:3000" },
      "defaults": { "validateSSL": false }
    },
    "prod": {
      "variables": { "baseUrl": "https://api.example.com" }
    }
  }
}
```

### Config shape (what each field means)

Top-level keys in `treq.jsonc` / `treq.json`:

- **`variables`** (`Record<string, unknown>`): default variables available to `.http` files (`{{var}}`).
- **`defaults`**:
  - **`timeoutMs`** (`number`, default: `30000`)
  - **`followRedirects`** (`boolean`, default: `true`)
  - **`validateSSL`** (`boolean`, default: `true`)
  - **`proxy`** (`string`, optional)
  - **`headers`** (`Record<string, string>`, default: `{}`): merged as *header defaults* (request headers win).
- **`cookies`**:
  - **`enabled`** (`boolean`, default: `true`)
  - **`jarPath`** (`string`, optional): enables persistence (path is relative to the project root).
  - **mode** (derived):
    - `disabled` if `enabled=false`
    - `memory` if `enabled=true` and no `jarPath`
    - `persistent` if `enabled=true` and `jarPath` is set
- **`resolvers`** (`Record<string, Resolver | CommandResolverDef>`):
  - In TS/JS legacy configs, values can be **functions**.
  - In JSON/JSONC configs, define **command resolvers** (see below).
- **`profiles`** (`Record<string, { variables/defaults/cookies/resolvers }>`): named overlays.
- **`security`**:
  - **`allowExternalFiles`** (`boolean`, default: `false`): allow `{file:...}` to read outside the workspace.

Resolution order (last wins):

- **variables**: `file < profile < overrides`
- **defaults/cookies/resolvers/security**: `file < profile < overrides`

### Substitutions

- `{env:VAR}` injects `process.env.VAR` (or `""` if missing)
- `{file:path}` injects the file contents (with `.trimEnd()` applied)
  - Relative paths resolve from the config file directory
  - By default, file reads are workspace-scoped (server-safe); you can opt out via `security.allowExternalFiles`

### Command resolvers (JSON/JSONC-friendly plugins)

JSON/JSONC can’t represent resolver functions, so you can define command resolvers:

```jsonc
{
  "resolvers": {
    "$hmacSign": {
      "type": "command",
      "command": ["ruby", ".treq/plugins/hmac.rb"],
      "timeoutMs": 2000
    }
  }
}
```

They run with `cwd = projectRoot` and communicate over NDJSON:

- stdin: `{"resolver":"$hmacSign","args":["payload"]}\n`
- stdout: `{"value":"<string>"}\n`

Resolver argument syntax in templates:

- Prefer JSON-array args: `{{$hmacSign(["{{body}}"])}}`
- Fallback: if the text in `(...)` is not valid JSON, it becomes a single string arg
- v1 restriction: resolver args cannot contain resolver calls (variables are OK)

### Resolving config (single source of truth)

If you're building tooling (like the CLI/server), use `resolveProjectConfig()` to get a **resolved** engine-ready config plus metadata:

```typescript
import { resolveProjectConfig } from '@t-req/core/config';

const { config, meta } = await resolveProjectConfig({
  startDir: process.cwd(),
  profile: 'dev',
});

console.log(meta.configPath, meta.layersApplied, meta.warnings);
console.log(config.defaults, Object.keys(config.resolvers));
```

### Legacy TS config (deprecated)

```typescript
// treq.config.ts
import { defineConfig } from '@t-req/core/config';

export default defineConfig({
  variables: { baseUrl: 'https://api.example.com' },
  defaults: { timeoutMs: 30000, headers: { 'User-Agent': 't-req' } }
});
```

You can still load legacy `treq.config.*` via `loadConfig()`, but new projects should prefer `treq.jsonc`.

```typescript
import { loadConfig, mergeConfig } from '@t-req/core/config';
import { createClient } from '@t-req/core';
import { createNodeIO } from '@t-req/core/runtime';

const { config } = await loadConfig({ startDir: process.cwd() });
const merged = mergeConfig({ file: config });

const client = createClient({
  // Required in Node to run from files.
  io: createNodeIO(),
  variables: merged.variables,
  resolvers: merged.resolvers,
  defaults: merged.defaults
});
```

## Real-World Example: E-Commerce Checkout

Run the included demo flow (uses dummyjson.com) to see a realistic multi-step scenario:

```bash
bun examples/e-commerce/checkout-flow.ts
```

See [`examples/e-commerce/`](./examples/e-commerce/) for the `.http` files and the orchestration script.

This shows the two patterns:
- **`setVariable`**: For values extracted from responses that subsequent requests need (`token`, `userId`, `cartId`)
- **Inline `variables`**: For one-off overrides (`productId`, `quantity`, pagination params)

See [`examples/e-commerce/`](./examples/e-commerce/) for a working version using dummyjson.com.

## Common Patterns

### Retry Logic

```typescript
async function withRetry<T>(
  fn: () => Promise<T>,
  retries = 3,
  delay = 1000
): Promise<T> {
  for (let i = 0; i < retries; i++) {
    try {
      return await fn();
    } catch (error) {
      if (i === retries - 1) throw error;
      await new Promise(r => setTimeout(r, delay));
    }
  }
  throw new Error('Unreachable');
}

const response = await withRetry(() =>
  client.run('./api/flaky-endpoint.http')
);
```

### Parallel Requests

```typescript
const [users, posts, comments] = await Promise.all([
  client.run('./api/users.http'),
  client.run('./api/posts.http'),
  client.run('./api/comments.http'),
]);
```

### Cleanup with try/finally

```typescript
try {
  await client.run('./setup.http');
  await client.run('./test.http');
} finally {
  await client.run('./cleanup.http');
}
```

### Request Timing

```typescript
const start = performance.now();
const response = await client.run('./api/users.http');
const duration = performance.now() - start;

console.log(`Request took ${duration.toFixed(0)}ms`);
```

## TypeScript Support

All types are exported:

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

Cookie types are exported from `@t-req/core/cookies`:

```typescript
import type { Cookie, CookieJar } from '@t-req/core/cookies';
```

## .http File Format

The library supports the standard `.http` file format:

```http
### Request Name
# @name requestId
# @description Optional description
GET https://api.example.com/users/{{userId}}
Authorization: Bearer {{token}}
Content-Type: application/json

###

POST https://api.example.com/users
Content-Type: application/json

{
  "name": "{{name}}",
  "email": "{{email}}"
}
```

### Format Rules

- Requests are separated by `###`
- Request names can be specified with `### Name` or `# @name name`
- Comments start with `#` or `//`
- Meta directives use `# @directive value`
- Headers follow the request line
- Body starts after an empty line
- Variables use `{{variable}}` syntax

### File References

Load request body from an external file:

```http
POST https://api.example.com/data
Content-Type: application/json

< ./fixtures/payload.json
```

The file path is relative to the `.http` file location. Content-Type is automatically inferred from the file extension if not specified. Binary files (images, PDFs, etc.) are handled correctly.

### Form Data

Simple syntax for forms and file uploads:

```http
POST https://api.example.com/upload

title = Quarterly Report
description = Q4 2025 summary
document = @./reports/q4-2025.pdf
```

**Syntax:**
- `field = value` — text field (spaces around `=` optional)
- `field = @./path` — file upload
- `field = @./path | custom.pdf` — file with custom filename

**Content-Type is inferred:**
- Files present → `multipart/form-data`
- Text only → `application/x-www-form-urlencoded`

For URL-encoded login:

```http
POST https://api.example.com/login

username = {{user}}
password = {{pass}}
```

Variables work in field values, file paths, and custom filenames.

### Best Practice: One Request Per File

For testability and clarity, we recommend one request per file:

```
requests/
├── auth/
│   ├── login.http
│   ├── logout.http
│   └── refresh.http
├── users/
│   ├── create.http
│   ├── get.http
│   ├── update.http
│   └── delete.http
└── orders/
    ├── create.http
    └── list.http
```

This makes each request independently executable and testable.

## Error Handling

```typescript
// Parsing errors throw
try {
  const requests = parse('not valid http');
} catch (e) {
  // ParseError
}

// Network errors throw
try {
  await client.run('./api/unreachable.http');
} catch (e) {
  // Network error or timeout
}

// Non-2xx is NOT an error - check response.ok
const response = await client.run('./api/users.http');
if (!response.ok) {
  console.log('Request failed:', response.status);
  const error = await response.json();
  console.log('Error:', error);
}
```

## Contributing

See [CONTRIBUTING.md](./CONTRIBUTING.md) for development setup and guidelines.

## License

MIT
