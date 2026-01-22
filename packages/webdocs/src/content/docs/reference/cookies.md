---
title: Cookies
description: API reference for createCookieJar and CookieJar
---

The cookie system provides RFC 6265-compliant cookie management using [tough-cookie](https://github.com/salesforce/tough-cookie).

## createCookieJar

Create a new cookie jar instance.

```typescript
import { createCookieJar } from '@t-req/core/cookies';

const jar = createCookieJar();
```

### Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `rejectPublicSuffixes` | `boolean` | `true` | Reject cookies for public suffixes like `.com` |

```typescript
// Disable public suffix protection (not recommended)
const jar = createCookieJar({ rejectPublicSuffixes: false });
```

## CookieJar Methods

### setCookieSync(cookie, url)

Set a cookie from a Set-Cookie header value.

```typescript
jar.setCookieSync('session=abc123; Path=/; HttpOnly', 'https://example.com/');
```

#### Parameters

| Parameter | Type | Description |
|-----------|------|-------------|
| `cookie` | `string` | Set-Cookie header value |
| `url` | `string` | The URL context for the cookie |

### getCookiesSync(url)

Get all cookies for a URL.

```typescript
const cookies = jar.getCookiesSync('https://example.com/api');

for (const cookie of cookies) {
  console.log(`${cookie.key}=${cookie.value}`);
}
```

#### Parameters

| Parameter | Type | Description |
|-----------|------|-------------|
| `url` | `string` | The URL to get cookies for |

#### Returns

`Cookie[]` - Array of Cookie objects.

### getCookieStringSync(url)

Get the Cookie header string for a URL.

```typescript
const cookieHeader = jar.getCookieStringSync('https://example.com/api');
// "session=abc123; theme=dark"
```

#### Parameters

| Parameter | Type | Description |
|-----------|------|-------------|
| `url` | `string` | The URL to get cookies for |

#### Returns

`string` - Cookie header value.

### serializeSync()

Serialize the jar for persistence.

```typescript
const snapshot = jar.serializeSync();

// Save to file
await Bun.write('./cookies.json', JSON.stringify(snapshot, null, 2));
```

#### Returns

`SerializedCookieJar` - Serializable object containing all cookies.

### CookieJar.deserializeSync(data)

Restore a jar from serialized data.

```typescript
import { CookieJar } from '@t-req/core/cookies';

const data = JSON.parse(await Bun.file('./cookies.json').text());
const jar = CookieJar.deserializeSync(data);
```

#### Parameters

| Parameter | Type | Description |
|-----------|------|-------------|
| `data` | `SerializedCookieJar` | Previously serialized jar data |

#### Returns

`CookieJar` - Restored cookie jar.

### removeCookieSync(domain, path, key)

Remove a specific cookie.

```typescript
jar.removeCookieSync('example.com', '/', 'session');
```

## Cookie Object

The Cookie object returned by `getCookiesSync()`:

```typescript
interface Cookie {
  key: string;           // Cookie name
  value: string;         // Cookie value
  domain: string;        // Domain scope
  path: string;          // Path scope
  expires?: Date;        // Expiration date
  httpOnly: boolean;     // HttpOnly flag
  secure: boolean;       // Secure flag
  sameSite?: string;     // SameSite attribute
  creation: Date;        // When the cookie was created
  lastAccessed: Date;    // Last access time
}
```

## Security Features

### Domain Validation

Cookies are validated against the request domain:

```typescript
// Request to api.example.com
jar.setCookieSync('ok=1; Domain=example.com', 'https://api.example.com/');    // ✓
jar.setCookieSync('ok=1; Domain=api.example.com', 'https://api.example.com/'); // ✓
jar.setCookieSync('bad=1; Domain=other.com', 'https://api.example.com/');     // ✗
```

### Public Suffix Protection

By default, cookies for public suffixes are rejected:

```typescript
jar.setCookieSync('bad=1; Domain=.com', 'https://example.com/');       // ✗ Rejected
jar.setCookieSync('bad=1; Domain=.co.uk', 'https://example.co.uk/');   // ✗ Rejected
jar.setCookieSync('bad=1; Domain=.github.io', 'https://foo.github.io/'); // ✗ Rejected
```

### Secure Cookie Enforcement

Secure cookies require HTTPS:

```typescript
// Only accepted over HTTPS
jar.setCookieSync('token=secret; Secure', 'https://example.com/'); // ✓
jar.setCookieSync('token=secret; Secure', 'http://example.com/');  // ✗
```

### Cookie Ordering

Cookies are returned sorted by:
1. Path length (longest first)
2. Creation time (oldest first)

This follows RFC 6265 ordering requirements.

## Usage with Client

```typescript
import { createClient } from '@t-req/core';
import { createCookieJar } from '@t-req/core/cookies';

const jar = createCookieJar();

const client = createClient({
  cookieJar: jar,
});

// Cookies are automatically:
// - Extracted from Set-Cookie response headers
// - Sent with matching requests
await client.run('./auth/login.http');
await client.run('./api/protected.http'); // Session cookie included
```

## TypeScript Types

```typescript
import type { Cookie, CookieJar } from '@t-req/core/cookies';
```
