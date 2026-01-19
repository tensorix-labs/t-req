---
title: Form Data
description: Submit forms and URL-encoded data with @t-req/core
---

@t-req/core provides a simple syntax for form submissions, automatically choosing between `multipart/form-data` and `application/x-www-form-urlencoded`.

## URL-Encoded Forms

For simple forms without files:

```http
POST https://api.example.com/login

username = {{user}}
password = {{pass}}
```

This sends:
```
Content-Type: application/x-www-form-urlencoded

username=john&password=secret
```

## Multipart Forms

When files are included, @t-req/core uses multipart:

```http
POST https://api.example.com/profile

name = John Doe
avatar = @./images/photo.jpg
```

This sends:
```
Content-Type: multipart/form-data; boundary=...
```

## Form Syntax

### Text Fields

```http
field = value
field=value
field = value with spaces
```

Spaces around `=` are optional. Values are trimmed.

### File Fields

```http
file = @./path/to/file.pdf
file = @./path/to/file.pdf | custom-name.pdf
```

### Variables in Fields

```http
POST https://api.example.com/contact

name = {{userName}}
email = {{userEmail}}
message = {{userMessage}}
attachment = @./{{attachmentPath}}
```

## Form Detection Rules

@t-req/core determines whether a body should be parsed as form data based on these rules:

1. **All non-empty lines must match** the `name = value` pattern
2. **Single-line body with `&`** is treated as pre-encoded URL query string, not form data
3. **Explicit non-form Content-Type** (like `application/json` or `text/plain`) bypasses form parsing

```http
# This is parsed as form data
POST https://api.example.com/submit

name = John
email = john@example.com
```

```http
# This is NOT parsed as form data (single line with &)
POST https://api.example.com/submit

name=John&email=john@example.com
```

```http
# This is NOT parsed as form data (explicit Content-Type)
POST https://api.example.com/submit
Content-Type: application/json

name = John
email = john@example.com
```

:::note[Content-Type Case Sensitivity]
@t-req/core only checks for `Content-Type` and `content-type` header names. Other case variations (like `CONTENT-TYPE` or `Content-type`) may not be recognized for form detection bypass.
:::

## Content-Type Inference

@t-req/core automatically sets the Content-Type:

| Condition | Content-Type |
|-----------|--------------|
| Only text fields | `application/x-www-form-urlencoded` |
| Any file fields | `multipart/form-data` |

## Explicit Content-Type

Override the automatic detection if needed:

```http
POST https://api.example.com/data
Content-Type: application/x-www-form-urlencoded

field1 = value1
field2 = value2
```

## JSON Body Alternative

For APIs expecting JSON, use a regular body:

```http
POST https://api.example.com/login
Content-Type: application/json

{
  "username": "{{user}}",
  "password": "{{pass}}"
}
```

## Special Characters

Form values are automatically URL-encoded:

```http
POST https://api.example.com/search

query = hello world & more
special = symbols!@#$%
```

Becomes: `query=hello%20world%20%26%20more&special=symbols%21%40%23%24%25`

## Array Fields

Some APIs expect array fields:

```http
POST https://api.example.com/settings

tags = javascript
tags = typescript
tags = nodejs
```

This sends three separate `tags` fields, which many frameworks interpret as an array.

## Empty Values

Empty values are valid:

```http
POST https://api.example.com/form

required_field = some value
optional_field =
```

## Combining with Headers

Add custom headers alongside form data:

```http
POST https://api.example.com/upload
Authorization: Bearer {{token}}
X-Request-ID: {{$uuid()}}

title = My Document
file = @./document.pdf
```

## Debugging Form Submissions

To see what's being sent, use the engine with event logging:

```typescript
import { createEngine } from '@t-req/core';
import { createFetchTransport } from '@t-req/core/runtime';

const engine = createEngine({
  transport: createFetchTransport(fetch),
  onEvent: (e) => {
    if (e.type === 'request:start') {
      console.log('Headers:', e.request.headers);
      console.log('Body:', e.request.body);
    }
  },
});
```
