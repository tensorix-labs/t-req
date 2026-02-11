# @t-req/plugin-assert

Inline assertions for [t-req](https://github.com/tensorix-labs/t-req) using `# @assert ...` directives in `.http` files.

[![npm version](https://img.shields.io/npm/v/@t-req/plugin-assert.svg)](https://www.npmjs.com/package/@t-req/plugin-assert)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

## Installation

```bash
npm install @t-req/plugin-assert

# or
bun add @t-req/plugin-assert
yarn add @t-req/plugin-assert
pnpm add @t-req/plugin-assert
```

## Setup

Add to `treq.jsonc`:

```jsonc
{
  "plugins": ["@t-req/plugin-assert"]
}
```

Or load ad-hoc:

```bash
treq run ./requests/user.http --plugin @t-req/plugin-assert
```

## Assertion Syntax

```http
# @assert status == 200
# @assert header Content-Type contains application/json
# @assert body contains "ok"
# @assert jsonpath $.token exists
GET https://api.example.com/health
```

Supported targets:

| Target | Operators | Example |
|---|---|---|
| `status` | `== != > >= < <=` | `# @assert status == 200` |
| `header <name>` | `exists == != contains` | `# @assert header X-Trace-Id exists` |
| `body` | `contains not-contains` | `# @assert body not-contains "error"` |
| `jsonpath <expr>` | `exists == !=` | `# @assert jsonpath $.count == 2` |

## Behavior

- Assertions run in `response.after`.
- One summary report is emitted per request with:
  - `kind: "assert"`
  - `passed: boolean`
  - `total`, `failed`
  - `checks[]` details
- Any failed assertion sets `passed: false`, and `treq run` exits with code `1`.
- Malformed assertions also fail the run (fail-fast behavior).

## Validate Integration

`treq validate` uses this plugin's `validate` hook to surface assertion issues early:

- `assert.syntax`
- `assert.operator`
- `assert.target`
- `assert.missing-value`
- `assert.invalid-jsonpath`
- `assert.position`

Example:

```bash
treq validate ./requests
```

## License

MIT
