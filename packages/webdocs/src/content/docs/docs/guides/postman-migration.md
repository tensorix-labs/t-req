---
title: Postman Migration
description: Migrate from Postman to t-req — import collections, replace environments with profiles, and run requests from the CLI or your test suite.
---

Switching from Postman? t-req replaces GUI-locked collections with plain `.http` files that live in Git, run from the CLI, and integrate with any test framework. You can import your existing collection automatically or rebuild from scratch.

## Import your collection

Export from Postman (Collection v2.1 JSON), then run:

```bash
treq import postman my-collection.json
```

This creates a directory of `.http` files mirroring your folder structure, plus a `treq.jsonc` with extracted variables.

Key options:

| Flag | Default | Description |
|------|---------|-------------|
| `--output` | `./<collection-name>` | Output directory |
| `--strategy` | `request-per-file` | `request-per-file` or `folder-per-file` |
| `--dry-run` | — | Preview without writing files |
| `--on-conflict` | `fail` | `fail`, `skip`, `overwrite`, or `rename` |
| `--merge-variables` | — | Merge collection variables into existing `treq.jsonc` |

Preview first:

```bash
treq import postman my-collection.json --dry-run
```

Pre-request scripts, test scripts, and OAuth2 auth configurations are **not imported** — they are reported as diagnostics. The sections below explain how to replace each one.

## Concept mapping

| Postman | t-req |
|---------|-------|
| Collection / Folder | Directory of `.http` files |
| Environment | Profile in `treq.jsonc` (`--profile staging`) |
| Global / Collection variables | `variables` in `treq.jsonc` |
| Environment variables | Profile-scoped `variables` |
| Local variable override | `--var key=value` or `client.setVariable()` |
| `{{variable}}` syntax | Same — `{{variable}}` |
| Dynamic variables (`$guid`, `$timestamp`) | Resolvers — `{{$uuid()}}`, `{{$timestamp()}}` |
| Pre-request script | Plugin `request.before` hook |
| Test script / `pm.test()` | `@t-req/plugin-assert` or BYO test runner |
| Collection Runner / Newman | `treq run` |
| Postman Flows | TypeScript script with `createClient()` |
| Cookie jar | `cookies.enabled` in `treq.jsonc` (auto) |
| Team workspace / fork | Git repository / branch |

## Environments → profiles

Postman environments map to `treq.jsonc` profiles:

```jsonc
{
  "variables": {
    "baseUrl": "https://api.example.com"
  },
  "profiles": {
    "local": {
      "variables": { "baseUrl": "http://localhost:3000" }
    },
    "staging": {
      "variables": {
        "baseUrl": "https://staging.example.com",
        "token": "{env:STAGING_TOKEN}"
      }
    }
  }
}
```

`{env:STAGING_TOKEN}` reads from the process environment — equivalent to Postman's "secret" variable type. Activate a profile:

```bash
treq run requests/users/list.http --profile staging
```

See [Configuration Reference](/docs/reference/configuration) for the full schema.

## Variables and dynamic values

Variables work the same way — `{{variableName}}` in `.http` files:

```http
GET {{baseUrl}}/users/{{userId}}
Authorization: Bearer {{token}}
```

Override per-request from the CLI:

```bash
treq run requests/users/get.http --var userId=42
```

For dynamic values like Postman's `{{$guid}}` or `{{$timestamp}}`, configure resolvers in `treq.jsonc`:

```jsonc
{
  "resolvers": {
    "timestamp": { "type": "command", "command": "date +%s" },
    "uuid": { "type": "command", "command": "uuidgen" }
  }
}
```

Then use them in `.http` files:

```http
POST {{baseUrl}}/events
Content-Type: application/json

{ "id": "{{$uuid()}}", "timestamp": "{{$timestamp()}}" }
```

## Authentication

Auth is just headers — explicit and version-controlled.

**Bearer:**
```http
GET {{baseUrl}}/api/users
Authorization: Bearer {{token}}
```

**Basic (static):**
```http
GET {{baseUrl}}/protected
Authorization: Basic dXNlcjpwYXNz
```

**API key:**
```http
GET {{baseUrl}}/data
X-API-Key: {{apiKey}}
```

**OAuth2 token refresh** — model as a request you call in a script:

```http
# @name refresh-token
POST {{baseUrl}}/oauth/token
Content-Type: application/x-www-form-urlencoded

grant_type = refresh_token
refresh_token = {{refreshToken}}
client_id = {{clientId}}
client_secret = {{clientSecret}}
```

## Request bodies

**JSON** — body after a blank line:
```http
POST {{baseUrl}}/users
Content-Type: application/json

{ "name": "Alice", "email": "alice@example.com" }
```

**Form (URL-encoded):**
```http
POST {{baseUrl}}/login
Content-Type: application/x-www-form-urlencoded

username = alice
password = secret123
```

**File upload (multipart):**
```http
POST {{baseUrl}}/upload
Content-Type: multipart/form-data

title = Quarterly Report
document = @./files/report.pdf
```

**Body from file:**
```http
POST {{baseUrl}}/users
Content-Type: application/json

< ./fixtures/user.json
```

See [HTTP File Format](/docs/reference/http-file-format) for the complete syntax.

## Pre-request scripts → plugins

Postman pre-request scripts become a plugin with a `request.before` hook:

```typescript
// plugins/add-headers.ts
import { definePlugin } from '@t-req/core';

export default definePlugin({
  name: 'add-headers',
  version: '1.0.0',
  hooks: {
    async 'request.before'(input, output) {
      output.request.headers['X-Request-Id'] = crypto.randomUUID();
      output.request.headers['X-Timestamp'] = String(Date.now());
    }
  }
});
```

Register in `treq.jsonc`:

```jsonc
{
  "plugins": ["file://./plugins/add-headers.ts"]
}
```

Use `request.compiled` instead if you need access to the fully-interpolated body (e.g. for HMAC signing). See [Plugins](/docs/guides/plugins) for the full hook lifecycle.

## Test scripts → assertions or test runner

**Path 1: Inline assertions** (closest to Postman test scripts):

```jsonc
{
  "plugins": ["@t-req/plugin-assert"]
}
```

```http
# @assert status == 200
# @assert header Content-Type contains application/json
# @assert jsonpath $.users[0].id exists
GET {{baseUrl}}/users
Authorization: Bearer {{token}}
```

`treq run` exits with code `1` on failure — works in CI with no test framework needed.

**Path 2: BYO test runner** (full assertion power):

```typescript
import { describe, it, expect, afterAll } from 'vitest';
import { createClient } from '@t-req/core';

const client = createClient({
  variables: { baseUrl: 'https://api.example.com' },
});

afterAll(() => client.close());

it('lists users', async () => {
  const res = await client.run('./requests/users/list.http');
  expect(res.status).toBe(200);

  const users = await res.json();
  expect(Array.isArray(users)).toBe(true);
  expect(users.length).toBeGreaterThan(0);
});
```

See [BYO Test Runner](/docs/guides/byo-test-runner) for Jest, Bun, and pytest examples.

## Collection Runner / Newman → treq run

**Single request:**

```bash
treq run requests/auth/login.http --profile staging
```

**CI pipeline (GitHub Actions):**

```yaml
steps:
  - uses: actions/checkout@v4

  - name: Install t-req
    run: curl -fsSL https://t-req.io/install.sh | bash

  - name: Smoke test
    env:
      API_TOKEN: ${{ secrets.API_TOKEN }}
    run: treq run requests/smoke-test.http --profile production
```

**Parameterized runs** (Postman data files equivalent):

```typescript
import { createClient } from '@t-req/core';

const client = createClient({
  variables: { baseUrl: 'https://api.example.com' },
});

const users = [
  { name: 'Alice', email: 'alice@example.com' },
  { name: 'Bob', email: 'bob@example.com' },
];

for (const user of users) {
  const res = await client.run('./requests/users/create.http', {
    variables: user,
  });
  console.log(`${user.name}: ${res.status}`);
}

await client.close();
```

## Flows → TypeScript scripts

Postman Flows maps to a TypeScript script with `createClient()`. You get the full language — loops, conditionals, error handling:

```typescript
import { createClient } from '@t-req/core';

const client = createClient({
  variables: { baseUrl: 'https://api.example.com' },
});

// Login and store token
const loginRes = await client.run('./requests/auth/login.http', {
  variables: { email: 'alice@example.com', password: 'secret' },
});
const { accessToken, id } = await loginRes.json();
client.setVariable('token', accessToken);
client.setVariable('userId', id);

// Use token in subsequent requests
const profile = await (await client.run('./requests/users/get.http')).json();
console.log('Profile:', profile.name);

await client.close();
```

See [Core Library](/docs/interfaces/core-library) for the full `createClient()` API.

## Team collaboration

`.http` files are plain text — share them with Git instead of Postman's cloud sync. Diffs are readable, PRs review API changes, and branches isolate work.

Keep secrets out of `treq.jsonc` by using `{env:VAR}` substitution:

```jsonc
{
  "profiles": {
    "production": {
      "variables": { "token": "{env:API_TOKEN}" }
    }
  }
}
```

Set `API_TOKEN` in your shell, a git-ignored `.env` file, or CI secrets.

## Next steps

- [HTTP File Format](/docs/reference/http-file-format) — complete `.http` syntax reference
- [Configuration Reference](/docs/reference/configuration) — profiles, variables, resolvers
- [Plugins](/docs/guides/plugins) — hooks, resolvers, CLI commands
- [BYO Test Runner](/docs/guides/byo-test-runner) — Vitest, Jest, Bun, pytest integration
- [CLI Reference](/docs/reference/cli) — all commands and flags
