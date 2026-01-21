# t-req

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![CI](https://github.com/tensorix-labs/t-req/actions/workflows/ci.yml/badge.svg)](https://github.com/tensorix-labs/t-req/actions/workflows/ci.yml)

HTTP request parsing, execution, and testing. Define requests in `.http` files, test them in isolation.

## Packages

| Package | Description |
|---------|-------------|
| [@t-req/core](./packages/core) | Core HTTP request parsing and execution library |
| [@t-req/app](./packages/app) | CLI for scaffolding, executing, and serving t-req projects |
| [@t-req/ui](./packages/ui) | Shared UI components and Tailwind CSS configuration |

## Documentation

Visit [apps/webdocs](./apps/webdocs) for full documentation.

## Quick Start

```bash
# Install @t-req/core
npm install @t-req/core
# or
bun add @t-req/core
```

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
  io: createNodeIO(),
  variables: {
    email: 'user@example.com',
    password: 'secret',
  },
});

const response = await client.run('./auth/login.http');
const { token } = await response.json();
```

Want observability (SSE events / flows / execution details) for a TUI or desktop app? Start the server with `treq serve` (`@t-req/app`) and use `createRemoteClient()` from `@t-req/core` to route runs through the server.

## Monorepo Structure

```
t-req/
├── apps/
│   └── webdocs/       # Documentation site
├── examples/          # Usage examples
├── packages/
│   ├── core/          # @t-req/core - HTTP parsing & execution
│   ├── app/           # @t-req/app - CLI tool
│   └── ui/            # @t-req/ui - UI components & theming
├── .changeset/        # Changesets for versioning
└── ...
```

## Contributing

See [CONTRIBUTING.md](./CONTRIBUTING.md) for development setup and guidelines.

## License

[MIT](./LICENSE)
