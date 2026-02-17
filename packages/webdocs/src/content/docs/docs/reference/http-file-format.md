---
title: HTTP File Format
description: Complete syntax reference for .http files.
---

t-req parses `.http` files — a human-readable format for defining HTTP requests. This reference covers the complete syntax.

## Request line

Every request starts with a method and URL:

```http
GET https://api.example.com/users
```

The HTTP version is optional:

```http
GET https://api.example.com/users HTTP/1.1
```

Supported methods: `GET`, `POST`, `PUT`, `DELETE`, `PATCH`, `HEAD`, `OPTIONS`, `TRACE`, `CONNECT`.

## Request separators

Use `###` to separate multiple requests in a single file:

```http
GET https://api.example.com/users

###

POST https://api.example.com/users
Content-Type: application/json

{"name": "Alice"}
```

### Named requests

Add a name after the separator to identify the request:

```http
### Get all users
GET https://api.example.com/users

### Create user
POST https://api.example.com/users
Content-Type: application/json

{"name": "Alice"}
```

Run a named request with the CLI:

```bash
treq run api.http --name "Create user"
```

## Comments

Lines starting with `#` or `//` are comments (before the request line):

```http
# This is a comment
// This is also a comment
GET https://api.example.com/users
```

## Headers

Headers follow the request line, one per line in `Name: Value` format:

```http
GET https://api.example.com/users
Authorization: Bearer my-token
Accept: application/json
Content-Type: application/json
```

Header names are case-insensitive per HTTP spec.

## Request body

Separate the body from headers with a blank line:

```http
POST https://api.example.com/users
Content-Type: application/json

{
  "name": "Alice",
  "email": "alice@example.com"
}
```

The body continues until the end of the request block (next `###` or end of file).

### File references

Load the body from an external file with `< ./path`:

```http
POST https://api.example.com/users
Content-Type: application/json

< ./fixtures/user.json
```

Paths are relative to the `.http` file location.

## Variables

Use `{{variableName}}` to interpolate variables:

```http
GET {{baseUrl}}/users/{{userId}}
Authorization: Bearer {{token}}
```

Variables come from:
- `treq.jsonc` configuration
- Profile-specific overrides
- CLI `--var` flags
- Programmatic `client.setVariable()`

### Nested variables

Access nested object properties with dot notation:

```http
GET {{baseUrl}}/users
X-User-Id: {{user.id}}
X-User-Name: {{user.profile.name}}
```

## Resolvers

Resolvers provide dynamic values using `{{$name()}}` syntax:

```http
POST {{baseUrl}}/events
Content-Type: application/json

{
  "timestamp": "{{$timestamp()}}",
  "secret": "{{$secret(API_KEY)}}"
}
```

### Built-in resolvers

Configure resolvers in `treq.jsonc`:

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

### Resolver arguments

Pass arguments to resolvers:

```http
{{$random(0, 100)}}
{{$env(API_KEY)}}
{{$secret(DATABASE_PASSWORD)}}
```

Arguments can include variable references:

```http
{{$secret({{secretName}})}}
```

## Meta directives

Use `# @directive value` comments to add metadata:

```http
# @name create-user
# @description Creates a new user account
# @timeout 5000
POST {{baseUrl}}/users
Content-Type: application/json

{"name": "Alice"}
```

| Directive | Description |
|-----------|-------------|
| `@name` | Request name (alternative to `### Name` syntax) |
| `@description` | Human-readable description |
| `@timeout` | Request timeout in milliseconds |
| `@assert` | Inline assertion expression (via `@t-req/plugin-assert`) |
| `@sse` | Mark request as Server-Sent Events stream |
| `@lastEventId` | Resume from a specific event ID |

Meta directives must appear before the request line.

## Inline Assertions (`@t-req/plugin-assert`)

With the assertion plugin enabled, add one or more `@assert` directives before the request line:

```http
# @assert status == 200
# @assert header Content-Type contains application/json
# @assert body contains "token"
# @assert jsonpath $.token exists
GET https://api.example.com/auth/login
Accept: application/json
```

Supported assertion targets:

| Target | Operators | Example |
|-----------|-------------|-------------|
| `status` | `== != > >= < <=` | `# @assert status == 200` |
| `header <name>` | `exists == != contains` | `# @assert header X-Trace-Id exists` |
| `body` | `contains not-contains` | `# @assert body not-contains "error"` |
| `jsonpath <expr>` | `exists == !=` | `# @assert jsonpath $.count == 2` |

Invalid or failing assertions cause `treq run` to exit with code `1`.

## Server-Sent Events (SSE)

Mark a request as an SSE stream with the `@sse` directive:

```http
# @sse
GET https://api.example.com/events/stream
Authorization: Bearer {{token}}
```

SSE is also auto-detected from the `Accept` header:

```http
GET https://api.example.com/events/stream
Accept: text/event-stream
```

### SSE directives

| Directive | Description |
|-----------|-------------|
| `@sse` | Mark request as SSE (enables streaming response) |
| `@timeout` | Connection timeout in ms (default: 30000) |
| `@lastEventId` | Resume from event ID (sets `Last-Event-ID` header) |

### Example with all options

```http
# @name stockPrices
# @sse
# @timeout 60000
# @lastEventId event-42
GET https://api.example.com/prices/stream
Authorization: Bearer {{token}}
```

## WebSocket (protocol v1.1)

WebSocket request blocks define connection metadata only. Message interaction is runtime-driven through API/SDK clients.

```http
# @ws
# @ws-subprotocols graphql-ws,json
# @ws-connect-timeout 30000
GET wss://api.example.com/graphql
Authorization: Bearer {{token}}
```

WebSocket is detected by:

- `@ws` directive, or
- `ws://` / `wss://` URL scheme

### WebSocket directives

| Directive | Description |
|-----------|-------------|
| `@ws` | Mark request as WebSocket |
| `@ws-subprotocols` | Comma-separated requested subprotocols |
| `@ws-connect-timeout` | Connect timeout in milliseconds |

### v1.1 body restriction

WebSocket definitions cannot include:

- inline request body
- body file references (`< ./file`)
- form-data blocks

The parser still captures raw blocks, but server execution (`POST /execute/ws`) rejects these with validation errors in protocol `1.1`.

## Form data

t-req supports a friendly form syntax with `name = value` on separate lines:

```http
POST {{baseUrl}}/login
Content-Type: application/x-www-form-urlencoded

username = alice
password = secret123
```

This is automatically detected when all body lines match the `name = value` pattern.

### File uploads

Upload files in form data with `@./path`:

```http
POST {{baseUrl}}/upload
Content-Type: multipart/form-data

title = My Document
file = @./documents/report.pdf
```

### Custom filenames

Specify a custom filename with `| filename`:

```http
POST {{baseUrl}}/upload
Content-Type: multipart/form-data

document = @./report.pdf | annual-report-2024.pdf
```

### Variable paths

File paths can include variables:

```http
POST {{baseUrl}}/upload
Content-Type: multipart/form-data

file = @{{uploadPath}}
```

## URL features

### Query parameters

Include query parameters directly in the URL:

```http
GET {{baseUrl}}/users?page=1&limit=10&sort=name
```

Or use variables:

```http
GET {{baseUrl}}/users?page={{page}}&limit={{limit}}
```

### Fragments

URL fragments are preserved:

```http
GET {{baseUrl}}/docs#section-2
```

### Ports

Specify custom ports:

```http
GET http://localhost:3000/api/users
GET https://api.example.com:8443/secure
```

### Basic auth in URL

Include credentials in the URL (not recommended for production):

```http
GET https://user:password@api.example.com/private
```

### IPv6 addresses

IPv6 addresses use bracket notation:

```http
GET http://[::1]:3000/api/users
GET http://[2001:db8::1]/resource
```

## Complete example

```http
# User API requests
# These requests demonstrate the full .http syntax

### List users
# @description Get paginated list of users
GET {{baseUrl}}/users?page={{page}}&limit=10
Authorization: Bearer {{token}}
Accept: application/json

### Get user by ID
GET {{baseUrl}}/users/{{userId}}
Authorization: Bearer {{token}}

### Create user
# @name create-user
# @timeout 5000
POST {{baseUrl}}/users
Authorization: Bearer {{token}}
Content-Type: application/json

{
  "name": "{{user.name}}",
  "email": "{{user.email}}",
  "createdAt": "{{$timestamp()}}"
}

### Upload avatar
POST {{baseUrl}}/users/{{userId}}/avatar
Authorization: Bearer {{token}}
Content-Type: multipart/form-data

avatar = @./fixtures/avatar.png | profile.png

### Delete user
DELETE {{baseUrl}}/users/{{userId}}
Authorization: Bearer {{token}}

### Stream events
# @sse
# @timeout 60000
GET {{baseUrl}}/events/stream
Authorization: Bearer {{token}}
```
