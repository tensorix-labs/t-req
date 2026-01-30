<p align="center">
  <a href="https://t-req.io"><img src="./docs/assets/logo.jpg" alt="t-req logo" height="170"></a>
</p>

# t-req

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![CI](https://github.com/tensorix-labs/t-req/actions/workflows/ci.yml/badge.svg)](https://github.com/tensorix-labs/t-req/actions/workflows/ci.yml)
[![Discord](https://img.shields.io/badge/Discord-Join%20us-5865F2?logo=discord&logoColor=white)](https://discord.gg/sKY4M3eS)

HTTP request parsing, execution, and testing. Define requests in `.http` files, test them in isolation.

**Visit the docs at [t-req.io](https://t-req.io)**

## Why t-req

- **`.http` files as source of truth** -- Standard format supported by VS Code REST Client and JetBrains HTTP Client. Version-controllable, diffable, shareable.
- **Library-first** -- `@t-req/core` is an embeddable TypeScript library. Use it in scripts, tests, CI, or your own tools.
- **Full dev workflow** -- CLI scaffolding, TUI for interactive exploration, web dashboard for visual debugging, all wired to the same server.
- **Multi-language server** -- `treq serve` exposes a REST API so Python, Go, Ruby, or any language can execute `.http` files.
- **Zero-config observability** -- Run scripts from the TUI and every HTTP request automatically appears in the dashboard. No code changes required.
- **Extensible with plugins** -- Add custom resolvers, hooks, and middleware. Write plugins in TypeScript or any language via subprocess protocol.
- **One command** -- `treq open` starts the server, TUI, and optionally the web dashboard.

## Ecosystem

```
                          treq open
                             |
                    +--------+--------+
                    |                 |
               treq serve         treq tui
            (HTTP API server)   (terminal UI)
                    |                 |
                    +--------+--------+
                             |
                        @t-req/core
                    (parse, interpolate,
                     execute .http files)
                             |
                     .http files (source of truth)

  +----------------------------------------------------------+
  |  @t-req/web          Browser dashboard (--web flag)      |
  |  @t-req/ui           Shared theme & Tailwind config      |
  |  @t-req/webdocs      Documentation site                  |
  +----------------------------------------------------------+
```

## Quick Start

### As a library

```bash
npm install @t-req/core
```

```typescript
import { createClient } from '@t-req/core';
import { createNodeIO } from '@t-req/core/runtime';

const client = createClient({
  io: createNodeIO(),
  variables: { email: 'user@example.com', password: 'secret' },
});

const response = await client.run('./auth/login.http');
const { token } = await response.json();
```

### As a CLI tool

```bash
# Install via curl
curl -fsSL https://t-req.io/install | bash

# Or via npm
npm install -g @t-req/app
```

```bash
# Scaffold a project
treq init my-api

# Open the TUI + server (the primary workflow)
cd my-api && treq open

# Or open with the web dashboard too
treq open --web
```

### As a multi-language server

```bash
treq serve --port 4096

# From any language -- just POST to the server
curl -X POST http://localhost:4096/execute \
  -H "Content-Type: application/json" \
  -d '{"content": "GET https://httpbin.org/get"}'
```

## Packages

| Package | Description |
|---------|-------------|
| [@t-req/core](./packages/core) | Core HTTP request parsing and execution library |
| [@t-req/app](./packages/app) | CLI for scaffolding, executing, and serving t-req projects |
| [@t-req/web](./packages/web) | Browser dashboard for the t-req server |
| [@t-req/ui](./packages/ui) | Shared UI components and Tailwind CSS configuration |
| [@t-req/webdocs](./packages/webdocs) | Documentation site |

## Documentation

Visit [t-req.io](https://t-req.io) for full documentation, guides, and API reference.

## Monorepo Structure

```
t-req/
├── examples/
│   ├── plugins/         # Plugin examples
│   └── ...
├── packages/
│   ├── core/            # @t-req/core - HTTP parsing & execution
│   ├── app/             # @t-req/app - CLI, TUI, and server
│   ├── web/             # @t-req/web - Browser dashboard
│   ├── webdocs/         # @t-req/webdocs - Documentation site
│   └── ui/              # @t-req/ui - UI components & theming
├── .changeset/          # Changesets for versioning
└── ...
```

## Contributing

See [CONTRIBUTING.md](./CONTRIBUTING.md) for development setup and guidelines.

## License

[MIT](./LICENSE)
