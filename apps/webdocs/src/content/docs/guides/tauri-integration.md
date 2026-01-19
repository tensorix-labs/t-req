---
title: Tauri Integration
description: Use @t-req/core in Tauri desktop applications
---

@t-req/core is designed to work in Tauri desktop applications, where the renderer process has limited filesystem access.

## The Challenge

In Tauri apps:
- The **renderer** (your frontend) runs in a sandboxed web context
- The **backend** (Rust) has full filesystem access
- You need to bridge between them for file operations

## Recommended Approach: `runString()`

The simplest approach is to use `runString()` with content from your editor or backend:

```typescript
// In your Tauri frontend
import { createClient } from '@t-req/core';

const client = createClient();

// If you have the .http content already (e.g., from an editor)
const httpContent = `
GET https://api.example.com/users/{{userId}}
Authorization: Bearer {{token}}
`;

const response = await client.runString(httpContent, {
  variables: {
    userId: '123',
    token: 'your-jwt-token',
  },
});

const data = await response.json();
```

This works because:
- No filesystem access is needed
- HTTP requests go directly from the renderer
- Variables are resolved in-memory

## Loading Files from Tauri Backend

If you need to load `.http` files from disk:

### 1. Create Tauri Commands

```rust
// src-tauri/src/main.rs
use std::fs;
use std::path::PathBuf;

#[tauri::command]
fn read_http_file(path: &str, workspace_root: &str) -> Result<String, String> {
    // Security: Ensure path is within workspace
    let full_path = PathBuf::from(workspace_root).join(path);
    let canonical = full_path.canonicalize()
        .map_err(|e| e.to_string())?;

    if !canonical.starts_with(workspace_root) {
        return Err("Path outside workspace".to_string());
    }

    fs::read_to_string(canonical)
        .map_err(|e| e.to_string())
}

#[tauri::command]
fn read_binary_file(path: &str, workspace_root: &str) -> Result<Vec<u8>, String> {
    let full_path = PathBuf::from(workspace_root).join(path);
    let canonical = full_path.canonicalize()
        .map_err(|e| e.to_string())?;

    if !canonical.starts_with(workspace_root) {
        return Err("Path outside workspace".to_string());
    }

    fs::read(canonical)
        .map_err(|e| e.to_string())
}
```

### 2. Create Frontend IO Adapter

```typescript
// src/lib/tauri-io.ts
import { invoke } from '@tauri-apps/api/core';

export interface TauriIOOptions {
  workspaceRoot: string;
}

export function createTauriIO(options: TauriIOOptions) {
  const { workspaceRoot } = options;

  return {
    async readFile(path: string): Promise<string> {
      return invoke('read_http_file', { path, workspaceRoot });
    },

    async readBinaryFile(path: string): Promise<Uint8Array> {
      const bytes: number[] = await invoke('read_binary_file', {
        path,
        workspaceRoot,
      });
      return new Uint8Array(bytes);
    },

    resolvePath(base: string, relative: string): string {
      // Simple path resolution
      const baseParts = base.split('/').slice(0, -1);
      const relativeParts = relative.split('/');

      for (const part of relativeParts) {
        if (part === '..') {
          baseParts.pop();
        } else if (part !== '.') {
          baseParts.push(part);
        }
      }

      return baseParts.join('/');
    },
  };
}
```

### 3. Use in Your App

```typescript
import { createClient } from '@t-req/core';
import { createTauriIO } from './lib/tauri-io';

const client = createClient({
  io: createTauriIO({
    workspaceRoot: '/path/to/workspace',
  }),
  variables: {
    baseUrl: 'https://api.example.com',
  },
});

// Now you can run from files
const response = await client.run('./requests/users/list.http');
```

## Security Considerations

### Workspace Isolation

Always validate that file paths stay within your workspace:

```rust
if !canonical.starts_with(workspace_root) {
    return Err("Path outside workspace".to_string());
}
```

### Sensitive Variables

Don't store sensitive values in variables visible to the renderer:

```typescript
// Instead of storing tokens in client variables
// Use resolvers that fetch from secure storage

const client = createClient({
  resolvers: {
    $secureToken: async () => {
      // Fetch from Tauri's secure storage
      return invoke('get_secure_token');
    },
  },
});
```

### HTTP Security

By default, Tauri blocks HTTP requests. Configure your `tauri.conf.json`:

```json
{
  "security": {
    "csp": null
  },
  "app": {
    "security": {
      "dangerousRemoteUrlAccess": ["https://*.example.com"]
    }
  }
}
```

## Editor Integration

For a `.http` file editor:

```typescript
// Editor component
const [httpContent, setHttpContent] = useState('');
const [response, setResponse] = useState(null);

const runRequest = async () => {
  const client = createClient();

  try {
    const res = await client.runString(httpContent, {
      variables: editorVariables,
    });

    setResponse({
      status: res.status,
      headers: Object.fromEntries(res.headers),
      body: await res.text(),
    });
  } catch (error) {
    setResponse({ error: error.message });
  }
};
```

## Full Example

See the [t-req desktop app](https://github.com/tensorix-labs/t-req-desktop) for a complete Tauri integration example.

Key features demonstrated:
- File browser for `.http` files
- Editor with syntax highlighting
- Variable management
- Request/response viewer
- Cookie jar persistence
