---
title: Configuration
description: Complete reference for treq.jsonc configuration.
---

t-req is configured via a `treq.jsonc` file at the root of your workspace. The file supports JSON with comments.

## Full structure

```jsonc
{
  // Global variables available to all requests
  "variables": {
    "baseUrl": "https://api.example.com",
    "apiVersion": "v2"
  },

  // Default request settings
  "defaults": {
    "timeoutMs": 30000,
    "followRedirects": true,
    "validateSSL": true,
    "proxy": "http://proxy.example.com:8080",
    "headers": {
      "Accept": "application/json"
    }
  },

  // Cookie handling
  "cookies": {
    "enabled": true,
    "jarPath": ".cookies.json"
  },

  // Dynamic value resolvers
  "resolvers": {
    "timestamp": {
      "type": "command",
      "command": "date +%s"
    }
  },

  // Security settings
  "security": {
    "allowExternalFiles": false
  },

  // Environment profiles
  "profiles": {
    "local": {
      "variables": {
        "baseUrl": "http://localhost:3000"
      }
    },
    "staging": {
      "variables": {
        "baseUrl": "https://staging-api.example.com",
        "token": "{env:STAGING_TOKEN}"
      }
    },
    "production": {
      "variables": {
        "baseUrl": "https://api.example.com",
        "token": "{env:PROD_TOKEN}"
      },
      "defaults": {
        "timeoutMs": 10000
      }
    }
  }
}
```

## Variables

Variables are key-value pairs available to all `.http` files in the workspace via `{{variableName}}` syntax.

```jsonc
{
  "variables": {
    "baseUrl": "https://api.example.com",
    "userId": "1",
    "token": "my-token"
  }
}
```

### Variable substitution in config values

Config values support two substitution patterns:

| Pattern | Description | Example |
|---------|-------------|---------|
| `{env:VAR}` | Read from environment variable | `{env:API_KEY}` |
| `{file:path}` | Read from file contents | `{file:./secrets/token.txt}` |

`{file:path}` supports `~` for home directory expansion and resolves relative paths from the config file location. File contents are trimmed of trailing whitespace and newlines.

### Template variables in .http files

Inside `.http` files, use double-brace syntax:

| Pattern | Description | Example |
|---------|-------------|---------|
| `{{variableName}}` | Simple variable | `{{baseUrl}}/users` |
| `{{nested.key}}` | Dot notation for nested values | `{{user.profile.name}}` |
| `{{$resolverName()}}` | Call a resolver | `{{$timestamp()}}` |
| `{{$resolverName(args)}}` | Resolver with arguments | `{{$random(0, 100)}}` |

Example `.http` file:

```http
GET {{baseUrl}}/users/{{userId}}
Authorization: Bearer {{token}}
```

## Defaults

Default settings applied to all requests unless overridden:

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `timeoutMs` | number | 30000 | Request timeout in milliseconds |
| `followRedirects` | boolean | true | Automatically follow HTTP redirects |
| `validateSSL` | boolean | true | Validate SSL certificates |
| `proxy` | string | — | Proxy URL for all requests |
| `headers` | object | — | Default headers applied to every request |

## Cookies

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `enabled` | boolean | — | Enable automatic cookie handling |
| `jarPath` | string | — | Path to persistent cookie jar file |

When enabled, cookies from `Set-Cookie` response headers are stored and sent with subsequent requests automatically.

## Resolvers

Resolvers provide dynamic values in `.http` files via `{{$name()}}` syntax.

### Command resolver

Runs an external command and uses its stdout as the value:

```jsonc
{
  "resolvers": {
    "timestamp": {
      "type": "command",
      "command": "date +%s"
    },
    "uuid": {
      "type": "command",
      "command": "uuidgen"
    }
  }
}
```

Use in a `.http` file:

```http
POST {{baseUrl}}/events
Content-Type: application/json

{
  "id": "{{$uuid()}}",
  "timestamp": "{{$timestamp()}}"
}
```

Command resolvers act as an external plugin system — any executable that writes to stdout can provide values.

## Profiles

Profiles let you switch between environments. Each profile can override `variables`, `defaults`, `cookies`, and `resolvers` from the root config.

```jsonc
{
  "variables": {
    "baseUrl": "https://api.example.com"
  },
  "profiles": {
    "local": {
      "variables": {
        "baseUrl": "http://localhost:3000"
      }
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

Activate a profile via the CLI:

```bash
treq run requests/api.http --profile staging
```

Or select one in the TUI.

Profile values are merged on top of the root configuration. Only the fields you specify in a profile are overridden.

## Security

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `allowExternalFiles` | boolean | false | Allow `{file:path}` to reference files outside the workspace |

By default, `{file:path}` substitutions are restricted to files within the workspace root. Set `allowExternalFiles: true` to allow references to files anywhere on the filesystem.
