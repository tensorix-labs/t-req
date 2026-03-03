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

## Plugins

Plugins extend t-req with custom hooks for request/response processing, authentication, assertions, and more. The `plugins` key is a top-level array of plugin references.

```jsonc
{
  "plugins": [
    "@t-req/plugin-assert",
    ["@t-req/plugin-oauth2", { "provider": "github" }],
    "file://./plugins/custom.ts",
    {
      "command": ["node", "./plugins/external.js"],
      "timeoutMs": 5000
    }
  ]
}
```

### Plugin source types

| Source | Format | Example |
|--------|--------|---------|
| npm package | `"package-name"` | `"@t-req/plugin-assert"` |
| npm package with options | `["package-name", { options }]` | `["@t-req/plugin-oauth2", { "provider": "github" }]` |
| Local file | `"file://./path"` | `"file://./plugins/custom.ts"` |
| Subprocess | `{ "command": [...] }` | `{ "command": ["node", "./plugin.js"] }` |

### npm package

A string referencing an installed npm package. The package must export a valid t-req plugin.

### npm package with options

A `[packageName, options]` tuple. The options object is passed to the plugin's factory function.

### Local file

A `file://` URL pointing to a local `.ts` or `.js` file that exports a plugin. Relative paths resolve from the project root. By default, the file must be within the project root — see [`security.allowPluginsOutsideProject`](#security) to allow external paths.

### Subprocess plugin

An object with a `command` array and optional configuration:

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `command` | `string[]` | — | Command to spawn (e.g., `["node", "./plugin.js"]`) |
| `config` | `object` | — | Plugin-specific config sent during initialization |
| `timeoutMs` | `number` | — | Per-request timeout in milliseconds |
| `startupTimeoutMs` | `number` | — | Initialization timeout in milliseconds |
| `maxRestarts` | `number` | — | Auto-restart limit |
| `gracePeriodMs` | `number` | — | Shutdown grace period in milliseconds |
| `env` | `object` | — | Additional environment variables |

### Profile-level plugins

Plugins can also be specified per profile. Profile plugins are appended to the base plugin list:

```jsonc
{
  "plugins": ["@t-req/plugin-assert"],
  "profiles": {
    "production": {
      "plugins": ["@t-req/plugin-logging"]
    }
  }
}
```

If a profile plugin has the same name and instance ID as a base plugin, the profile version overrides it.

## Security

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `allowExternalFiles` | boolean | `false` | Allow `{file:path}` to reference files outside the workspace |
| `allowPluginsOutsideProject` | boolean | `false` | Allow `file://` plugins to load from paths outside the project root |
| `pluginPermissions` | object | — | Permission overrides for plugins (see below) |

By default, `{file:path}` substitutions are restricted to files within the workspace root. Set `allowExternalFiles: true` to allow references to files anywhere on the filesystem.

### allowPluginsOutsideProject

When `false` (the default), `file://` plugin paths must resolve to a location within the project root (symlinks are resolved before checking). Set to `true` to load plugins from anywhere on the filesystem.

### pluginPermissions

Controls which capabilities plugins receive. Plugins declare the permissions they need; this setting restricts or overrides those declarations.

Available permissions:

| Permission | Grants |
|------------|--------|
| `secrets` | Access to resolvers that read secrets (Vault, SSM, env vars) |
| `network` | Outbound HTTP requests (OAuth refresh, telemetry) |
| `filesystem` | Read/write files outside the project root |
| `env` | Read `process.env` |
| `subprocess` | Spawn child processes |
| `enterprise` | Access enterprise context (org, user, session data) |

Use `default` to set a baseline for all plugins, and per-plugin keys to override:

```jsonc
{
  "security": {
    "pluginPermissions": {
      "default": ["network"],
      "@t-req/plugin-oauth2": ["secrets", "network", "env"],
      "my-local-plugin": ["filesystem", "subprocess"]
    }
  }
}
```

If no `pluginPermissions` config is present, plugins receive all the permissions they declare.
