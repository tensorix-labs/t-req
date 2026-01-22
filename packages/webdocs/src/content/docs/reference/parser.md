---
title: Parser
description: API reference for parse and parseFileWithIO functions
---

The parser converts `.http` file content into structured request objects.

## parse

Parse `.http` content into an array of requests.

```typescript
import { parse } from '@t-req/core';

const requests = parse(`
### Get Users
GET https://api.example.com/users
Authorization: Bearer {{token}}

### Create User
POST https://api.example.com/users
Content-Type: application/json

{"name": "{{name}}", "email": "{{email}}"}
`);

console.log(requests.length); // 2
console.log(requests[0].name); // "Get Users"
console.log(requests[0].method); // "GET"
```

### Parameters

| Parameter | Type | Description |
|-----------|------|-------------|
| `content` | `string` | The `.http` file content to parse |

### Returns

`ParsedRequest[]` - Array of parsed request objects.

## parseFileWithIO

Parse a `.http` file from disk using an IO adapter.

```typescript
import { parseFileWithIO } from '@t-req/core';
import { createNodeIO } from '@t-req/core/runtime';

const io = createNodeIO();
const requests = await parseFileWithIO('./api/users.http', io);
```

### Parameters

| Parameter | Type | Description |
|-----------|------|-------------|
| `path` | `string` | Path to the `.http` file |
| `io` | `IO` | Filesystem adapter |

### Returns

`Promise<ParsedRequest[]>` - Array of parsed request objects.

## ParsedRequest

The structure returned by the parser:

```typescript
interface ParsedRequest {
  // Request name from ### or @name
  name?: string;

  // HTTP method (GET, POST, PUT, DELETE, PATCH, etc.)
  method: string;

  // Full URL (may contain {{variables}})
  url: string;

  // HTTP headers as key-value pairs
  headers: Record<string, string>;

  // Request body (may contain {{variables}})
  body?: string;

  // Parsed form data (if form syntax is used)
  formData?: FormField[];

  // File reference for body (< ./path)
  bodyFile?: FileReference;

  // Original raw content of the request block
  raw: string;

  // Meta directives from # @key value
  meta: Record<string, string>;
}
```

## FormField

Parsed form field from `field = value` syntax:

```typescript
interface FormField {
  // Field name
  name: string;

  // Field value (text value for non-file fields)
  value: string;

  // Whether this field is a file upload
  isFile: boolean;

  // File path if isFile is true (from @./path syntax)
  path?: string;

  // Custom filename for file upload (from | syntax)
  filename?: string;
}
```

## FileReference

Reference to an external file:

```typescript
interface FileReference {
  // File path (relative to .http file)
  path: string;
}
```

## Parsing Examples

### Simple Request

```typescript
const requests = parse(`
GET https://api.example.com/users
Accept: application/json
`);

// Result:
// [{
//   method: 'GET',
//   url: 'https://api.example.com/users',
//   headers: { Accept: 'application/json' },
//   raw: 'GET https://api.example.com/users\nAccept: application/json',
//   meta: {}
// }]
```

### Request with Body

```typescript
const requests = parse(`
POST https://api.example.com/users
Content-Type: application/json

{"name": "John", "email": "john@example.com"}
`);

// Result:
// [{
//   method: 'POST',
//   url: 'https://api.example.com/users',
//   headers: { 'Content-Type': 'application/json' },
//   body: '{"name": "John", "email": "john@example.com"}',
//   raw: 'POST https://api.example.com/users\nContent-Type: application/json\n\n{"name": "John", "email": "john@example.com"}',
//   meta: {}
// }]
```

### Request with Meta

```typescript
const requests = parse(`
# @name createUser
# @description Creates a new user
# @timeout 5000
POST https://api.example.com/users
Content-Type: application/json

{"name": "John"}
`);

// Result:
// [{
//   name: 'createUser',
//   method: 'POST',
//   url: 'https://api.example.com/users',
//   headers: { 'Content-Type': 'application/json' },
//   body: '{"name": "John"}',
//   raw: '# @name createUser\n# @description Creates a new user\n# @timeout 5000\nPOST https://api.example.com/users\nContent-Type: application/json\n\n{"name": "John"}',
//   meta: {
//     name: 'createUser',
//     description: 'Creates a new user',
//     timeout: '5000'
//   }
// }]
```

### Form Data

```typescript
const requests = parse(`
POST https://api.example.com/upload

title = My Document
file = @./document.pdf
`);

// Result:
// [{
//   method: 'POST',
//   url: 'https://api.example.com/upload',
//   headers: {},
//   formData: [
//     { name: 'title', value: 'My Document', isFile: false },
//     { name: 'file', value: '', isFile: true, path: './document.pdf' }
//   ],
//   raw: 'POST https://api.example.com/upload\n\ntitle = My Document\nfile = @./document.pdf',
//   meta: {}
// }]
```

## Error Handling

```typescript
try {
  const requests = parse('invalid content');
} catch (error) {
  // ParseError with details about the syntax error
  console.error(error.message);
}
```

## TypeScript Types

```typescript
import type {
  ParsedRequest,
  FormField,
  FileReference,
} from '@t-req/core';
```
