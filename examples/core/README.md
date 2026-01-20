# @t-req/core Examples

Examples demonstrating the `.http` file format and `@t-req/core` library usage.

## .http File Examples

| File | Description |
|------|-------------|
| `basic.http` | Basic GET/POST requests |
| `auth.http` | Authentication patterns (Bearer, Basic) |
| `variables.http` | Variable interpolation with `{{var}}` syntax |
| `form-login.http` | Form URL-encoded request |
| `file-upload.http` | File upload with `< ./path` syntax |
| `multipart-upload.http` | Multipart form data |

## E-Commerce Example

The `e-commerce/` directory shows a realistic API collection structure:

```
e-commerce/
├── auth/
│   ├── login.http
│   └── logout.http
├── users/
│   └── profile.http
├── products/
│   ├── list.http
│   └── get.http
├── cart/
│   ├── get.http
│   ├── add.http
│   └── update.http
└── checkout-flow.ts    # Programmatic flow example
```

## Running Examples

### With treq CLI

```bash
# Run a single request
treq run examples/core/basic.http

# Run with variables
treq run examples/core/variables.http --var baseUrl=https://api.example.com
```

### With @t-req/core directly

```typescript
import { createClient } from '@t-req/core';

const client = createClient({
  variables: {
    baseUrl: 'https://api.example.com'
  }
});

const response = await client.run('./examples/core/basic.http');
console.log(await response.json());
```

## Data Files

The `data/` directory contains sample files for upload examples:

- `payload.json` - Sample JSON payload
- `report.txt` - Sample text file
