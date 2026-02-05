<p align="center">
  <a href="https://t-req.io"><img src="./docs/assets/logo.jpg" alt="t-req logo" height="170"></a>
</p>

# t-req

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![CI](https://github.com/tensorix-labs/t-req/actions/workflows/ci.yml/badge.svg)](https://github.com/tensorix-labs/t-req/actions/workflows/ci.yml)
[![Discord](https://img.shields.io/badge/Discord-Join%20us-5865F2?logo=discord&logoColor=white)](https://discord.gg/sKY4M3eS)

HTTP request parsing, execution, and testing. Define requests in `.http` files, explore them in the TUI or web dashboard, see every request your scripts make.

**[Read the docs](https://t-req.io)** | **[Join Discord](https://discord.gg/sKY4M3eS)**

## Install

```bash
curl -fsSL https://t-req.io/install | bash
```

<p align="center">
  <img src="./docs/assets/web.png" alt="t-req web dashboard">
</p>

## What You Can Do

- **`treq open`** - One command starts the server + TUI
- **`treq open --web`** - Add a browser-based dashboard
- **`treq init`** - Scaffold complete projects instantly
- **Observer Mode** - See HTTP requests from scripts in real-time, no code changes
- **Language-agnostic** - Python, Go, Ruby via `treq serve`
- **Standard `.http` files** - VS Code REST Client / JetBrains compatible

## Quick Start

### Primary workflow

```bash
# Install
curl -fsSL https://t-req.io/install | bash

# Create a project
treq init my-api && cd my-api

# Open TUI
treq open

# Or with web dashboard
treq open --web
```

### Multi-language server

For Python, Go, Ruby, or any language:

```bash
treq serve

# POST from any language
curl -X POST http://localhost:4097/execute \
  -H "Content-Type: application/json" \
  -d '{"content": "GET https://httpbin.org/get"}'
```

### TypeScript library

For tests, scripts, or building your own tools:

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

## Packages

| Package | Description |
|---------|-------------|
| [@t-req/core](./packages/core) | HTTP parsing and execution library |
| [@t-req/app](./packages/app) | CLI, TUI, and server |
| [@t-req/web](./packages/web) | Browser dashboard |

## Contributing

See [CONTRIBUTING.md](./CONTRIBUTING.md) for development setup and guidelines.

## License

[MIT](./LICENSE)
