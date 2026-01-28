---
title: Getting Started
description: Install t-req and run your first HTTP request.
---

t-req parses, interpolates, and executes `.http` files in JavaScript. It works as a library, a CLI, and a TUI with built-in observability.

## Install

```bash
npm install -g @t-req/app
```

Or with other package managers:

```bash
bun add -g @t-req/app
pnpm add -g @t-req/app
```

## Create a project

Scaffold a new workspace:

```bash
treq init my-api
cd my-api
```

This creates a directory with:

- `treq.jsonc` — project configuration (variables, profiles, defaults)
- `requests/` — a folder for your `.http` files
- A sample `.http` file to get started

## Open the TUI

Launch the terminal UI to browse and run requests interactively:

```bash
treq open
```

The TUI lets you:

- Browse `.http` files in your workspace
- Execute requests and inspect responses
- Switch between profiles
- Run tests and scripts with observer mode

## Run a request from the CLI

Execute a single `.http` file directly:

```bash
treq run requests/hello.http
```

Select a specific request by name or index:

```bash
treq run requests/api.http --name get-users
treq run requests/api.http --index 0
```

Use a profile:

```bash
treq run requests/api.http --profile staging
```

## Web UI

Add `--web` to open the browser-based UI instead of the terminal UI:

```bash
treq open --web
```

## Use as a library

t-req's core is a JavaScript library. Install it in any project:

```bash
npm install @t-req/core
```

```typescript
import { createClient } from '@t-req/core';

const client = createClient({
  variables: { baseUrl: 'https://api.example.com' },
});

const response = await client.run('./requests/get-users.http');
const data = await response.json();

await client.close();
```

This is the foundation of the [BYO test runner](/docs/guides/byo-test-runner) pattern — use any test framework to make assertions on responses from `.http` files.

## Next steps

- [BYO Test Runner](/docs/guides/byo-test-runner) — integrate with Vitest, Jest, Bun test, or pytest
- [Observer Mode](/docs/guides/observer-mode) — get request observability in the TUI for free
- [Configuration Reference](/docs/reference/configuration) — profiles, variables, resolvers
- [CLI Reference](/docs/reference/cli) — all commands and options
