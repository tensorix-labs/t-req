# @t-req/plugin-base

Base resolvers for [t-req](https://github.com/tensorix-labs/t-req) — UUIDs, timestamps, environment variables, encoding, and random values.

[![npm version](https://img.shields.io/npm/v/@t-req/plugin-base.svg)](https://www.npmjs.com/package/@t-req/plugin-base)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

## Installation

```bash
npm install @t-req/plugin-base

# or
bun add @t-req/plugin-base
yarn add @t-req/plugin-base
pnpm add @t-req/plugin-base
```

Bundled with the t-req CLI — no separate install needed if you're using `treq`.

## Setup

Add to your `treq.jsonc`:

```jsonc
{
  "plugins": ["@t-req/plugin-base"]
}
```

This is included by default when you run `treq init`.

## Resolvers

| Resolver | Args | Description | Example output |
|----------|------|-------------|----------------|
| `$uuid` | — | UUID v4 | `f47ac10b-58cc-4372-a567-0e02b2c3d479` |
| `$timestamp` | — | Unix timestamp (seconds) | `1706745600` |
| `$timestampMs` | — | Unix timestamp (milliseconds) | `1706745600000` |
| `$isodate` | — | ISO 8601 datetime | `2025-01-31T12:00:00.000Z` |
| `$randomInt` | `min`, `max` | Random integer in range (inclusive) | `42` |
| `$base64` | `value` | Base64 encode | `aGVsbG8=` |
| `$base64Decode` | `value` | Base64 decode | `hello` |
| `$env` | `key` | Read environment variable (empty string if unset) | `my-secret` |

## Usage in .http files

```http
POST {{baseUrl}}/users
Content-Type: application/json
X-Request-ID: {{$uuid()}}
X-Timestamp: {{$isodate()}}
Authorization: Bearer {{$env(API_TOKEN)}}

{
  "id": "{{$uuid()}}",
  "createdAt": {{$timestamp()}},
  "verificationCode": {{$randomInt(1000, 9999)}}
}
```

Encoding:

```http
POST {{baseUrl}}/auth
Authorization: Basic {{$base64(username:password)}}
```

## Permissions

This plugin declares the `env` permission for `$env` resolver access to `process.env`.

With no explicit permission config, all declared permissions are granted automatically. To lock down permissions:

```jsonc
{
  "plugins": ["@t-req/plugin-base"],
  "security": {
    "pluginPermissions": {
      "base": ["env"]
    }
  }
}
```

## License

MIT
