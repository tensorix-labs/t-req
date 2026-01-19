---
title: .http File Format
description: Complete syntax reference for .http files
---

@t-req/core uses the standard `.http` file format, compatible with VS Code REST Client and JetBrains HTTP Client.

## Basic Structure

```http
### Request Name
# @name requestId
# @description Optional description
METHOD https://example.com/path
Header-Name: Header-Value

Request body here
```

## Request Separators

Requests are separated by `###`:

```http
### First Request
GET https://api.example.com/users

###

### Second Request
POST https://api.example.com/users
Content-Type: application/json

{"name": "John"}
```

## Request Names

Request names can be specified two ways:

```http
### Get All Users
GET https://api.example.com/users

###
# @name getUserById
GET https://api.example.com/users/1
```

## Comments

Comments start with `#` or `//`:

```http
# This is a comment
// This is also a comment
GET https://api.example.com/users
```

## Meta Directives

Meta directives provide additional request metadata:

```http
# @name myRequest
# @description Fetches user data
# @timeout 5000
GET https://api.example.com/users
```

## Headers

Headers follow the request line, one per line:

```http
GET https://api.example.com/users
Authorization: Bearer {{token}}
Accept: application/json
Content-Type: application/json
X-Custom-Header: custom-value
```

## Request Body

The body starts after an empty line following the headers:

```http
POST https://api.example.com/users
Content-Type: application/json

{
  "name": "{{name}}",
  "email": "{{email}}"
}
```

## Variables

Variables use `{{variable}}` syntax:

```http
GET https://{{baseUrl}}/users/{{userId}}
Authorization: Bearer {{token}}
```

See [Variables](/concepts/variables/) for more details.

## File References

Load request body from an external file:

```http
POST https://api.example.com/data
Content-Type: application/json

< ./fixtures/payload.json
```

The file path is relative to the `.http` file location.

## Form Data

Simple syntax for forms and file uploads:

```http
POST https://api.example.com/upload

title = Quarterly Report
description = Q4 2025 summary
document = @./reports/q4-2025.pdf
```

**Syntax:**
- `field = value` — text field
- `field = @./path` — file upload
- `field = @./path | custom.pdf` — file with custom filename (spaces around `|` required)

**Content-Type is inferred:**
- Files present → `multipart/form-data`
- Text only → `application/x-www-form-urlencoded`

**Detection rules:**
- All lines must match `name = value` pattern to be parsed as form data
- Single-line body with `&` is treated as pre-encoded URL string
- Setting `Content-Type: application/json` or `text/plain` disables form parsing

See [Form Data Guide](/guides/form-data/) for detailed examples.

## Best Practice: One Request Per File

For testability and clarity, we recommend one request per file:

```
requests/
├── auth/
│   ├── login.http
│   ├── logout.http
│   └── refresh.http
├── users/
│   ├── create.http
│   ├── get.http
│   ├── update.http
│   └── delete.http
└── orders/
    ├── create.http
    └── list.http
```

This makes each request independently executable and testable.

## Format Rules Summary

| Element | Syntax |
|---------|--------|
| Request separator | `###` |
| Request name | `### Name` or `# @name name` |
| Comment | `#` or `//` |
| Meta directive | `# @key value` |
| Variable | `{{variable}}` |
| File reference | `< ./path/to/file` |
| Form field | `field = value` |
| File upload | `field = @./path` |
