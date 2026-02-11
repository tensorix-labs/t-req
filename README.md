<p align="center">
  <a href="https://t-req.io"><img src="./docs/assets/logo.jpg" alt="t-req logo" height="170"></a>
</p>

<h3 align="center">The Programmable API Engine</h3>

<p align="center">
Tired of API tools that lock your requests in proprietary formats and GUI-only workflows?<br/>
t-req keeps standard <code>.http</code> files as the source of truth and lets you run them from anywhere — terminal, server, or your own code.
</p>

<p align="center">
  <a href="https://opensource.org/licenses/MIT"><img src="https://img.shields.io/badge/License-MIT-yellow.svg" alt="License: MIT"></a>
  <a href="https://github.com/tensorix-labs/t-req/actions/workflows/ci.yml"><img src="https://github.com/tensorix-labs/t-req/actions/workflows/ci.yml/badge.svg" alt="CI"></a>
  <a href="https://discord.gg/sKY4M3eS"><img src="https://img.shields.io/badge/Discord-Join%20us-5865F2?logo=discord&logoColor=white" alt="Discord"></a>
</p>

<p align="center">
  <b><a href="https://t-req.io">Docs</a></b> &middot; <b><a href="https://discord.gg/sKY4M3eS">Discord</a></b>
</p>

<p align="center">
  <img src="./docs/assets/tui.gif" alt="t-req TUI">
</p>

## Install

```bash
curl -fsSL https://t-req.io/install | bash
```

Or as a library:

```bash
npm install @t-req/core
```

## Why t-req?

`.http` is the only request format supported by multiple independent editors — VS Code REST Client, JetBrains HTTP Client, and others. It's just raw HTTP: no DSL, no vendor syntax. Your files work without t-req.

But a file format alone doesn't get you far. t-req is the engine that makes `.http` files composable: hook into the request lifecycle with plugins, expose your collection as an API with `treq serve`, embed execution in your own code with `@t-req/core`, observe traffic in real time from the TUI.

One source of truth, many surfaces. The same `.http` file runs from the terminal, a server, a test suite, or a TypeScript script.

## Run from the Terminal

```bash
treq init my-api && cd my-api
treq open                           # interactive TUI
treq run requests/users/list.http   # single request from CLI
```

## Run from TypeScript

`@t-req/core` is a standalone library. Parse, execute, and inspect requests from your own code.

```typescript
import { createClient } from '@t-req/core';

const client = createClient({
  variables: { token: process.env.API_TOKEN },
});

const response = await client.run('./auth/login.http');
const { user } = await response.json();
```

## Plugin Pipeline

Intercept and transform at every stage of the request lifecycle.

```
parse.after → request.before → request.compiled → request.after → response.after
                                                                        ↓
                                                                      error
```

Plugins use `definePlugin` and hook into any stage. Here's a retry plugin that respects `Retry-After` headers:

```typescript
import { definePlugin } from '@t-req/core';

export default definePlugin({
  name: 'retry-on-429',
  version: '1.0.0',
  hooks: {
    async 'response.after'(input, output) {
      const { response, ctx } = input;
      if (response.status !== 429 || ctx.retries >= 3) return;

      const retryAfter = response.headers.get('retry-after');
      output.retry = {
        delayMs: retryAfter ? parseInt(retryAfter) * 1000 : 1000,
        reason: 'HTTP 429',
      };
    },
  },
});
```

Write plugins in any language using the subprocess protocol — see `examples/plugins/` for Python and Ruby examples.

## Observer Mode

Run scripts from the TUI and watch every HTTP request appear in real time — without changing a line of code.

```bash
treq open              # start the TUI
# select a script → run it → see every request as it happens
```

`createClient()` auto-detects the TUI server and routes requests through it. Your scripts, tests, and CI jobs get full observability for free.

## Run from Any Language

`treq serve` exposes a REST API. Call it from Python, Go, Ruby — anything that speaks HTTP.

```bash
treq serve

curl -X POST http://localhost:4097/execute \
  -H "Content-Type: application/json" \
  -d '{"content": "GET https://api.example.com/users\nAuthorization: Bearer {{token}}"}'
```



## Features

- **Variable interpolation** with profiles and nested access (`{{user.email}}`)
- **Command resolvers** — `{{$timestamp()}}`, `{{$uuid()}}`, or your own custom functions
- **Cookie management** — automatic jar with RFC 6265 compliance
- **SSE streaming** — `@sse` directive for Server-Sent Events
- **Web dashboard** — `treq open --web` for a browser-based UI
- **TypeScript-first** — full type definitions, async/await, `AsyncDisposable` support

<p align="center">
  <img src="./docs/assets/web.png" alt="t-req web dashboard">
</p>

> **Open source. MIT licensed. No cloud account required.**

## Packages

| Package | Description |
|---------|-------------|
| [@t-req/core](./packages/core) | HTTP parsing and execution engine |
| [@t-req/app](./packages/app) | CLI, TUI, and server |
| [@t-req/web](./packages/web) | Browser dashboard |
| [@t-req/sdk](./packages/sdk/js) | TypeScript SDK for the server |
| [@t-req/plugin-base](./packages/plugins/base) | Built-in resolvers (uuid, timestamp, base64, etc.) |
| [@t-req/plugin-assert](./packages/plugins/assert) | Assertion directives for `.http` files |

## Contributing

See [CONTRIBUTING.md](./CONTRIBUTING.md) for development setup and guidelines.

## License

[MIT](./LICENSE)
