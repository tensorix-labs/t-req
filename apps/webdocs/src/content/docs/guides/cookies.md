---
title: Cookies
description: Automatic cookie management with the cookie jar
---

@t-req/core includes a cookie jar for automatic cookie handling across requests, with RFC 6265 compliance via [tough-cookie](https://github.com/salesforce/tough-cookie).

## Basic Usage

Enable cookie handling by creating a cookie jar:

```typescript
import { createClient } from '@t-req/core';
import { createNodeIO } from '@t-req/core/runtime';
import { createCookieJar } from '@t-req/core/cookies';

const jar = createCookieJar();

const client = createClient({
  io: createNodeIO(),
  cookieJar: jar,
});

// Login response sets cookies automatically
await client.run('./auth/login.http');

// Subsequent requests include cookies
const profile = await client.run('./users/profile.http');
```

## Manual Cookie Management

### Set Cookies

```typescript
const jar = createCookieJar();

// Set a cookie from a Set-Cookie header value
jar.setCookieSync('session=abc123; Path=/', 'https://example.com/');

// Set multiple cookies
jar.setCookieSync('theme=dark; Path=/', 'https://example.com/');
jar.setCookieSync('lang=en; Path=/', 'https://example.com/');
```

### Read Cookies

```typescript
// Get all cookies for a URL
const cookies = jar.getCookiesSync('https://example.com/api');
console.log(cookies.map((c) => `${c.key}=${c.value}`));

// Get the Cookie header string
const cookieHeader = jar.getCookieStringSync('https://example.com/api');
// "session=abc123; theme=dark; lang=en"
```

## Persistence

Save and restore cookies across sessions:

### Save Cookies

```typescript
const snapshot = jar.serializeSync();

// Bun
await Bun.write('./cookies.json', JSON.stringify(snapshot, null, 2));

// Node.js
import { writeFile } from 'node:fs/promises';
await writeFile('./cookies.json', JSON.stringify(snapshot, null, 2), 'utf8');
```

### Restore Cookies

```typescript
import { CookieJar } from '@t-req/core/cookies';

// Bun
const loaded = JSON.parse(await Bun.file('./cookies.json').text());

// Node.js
import { readFile } from 'node:fs/promises';
const loaded = JSON.parse(await readFile('./cookies.json', 'utf8'));

// Restore into a new jar
const jar = CookieJar.deserializeSync(loaded);
```

## Security Features

The cookie jar enforces security best practices:

### Domain Scope Validation

Cookies can only be set for the request domain or its parent domains:

```typescript
// Request to api.example.com can set cookies for:
// - api.example.com ✓
// - example.com ✓
// - .com ✗ (public suffix)
```

### Public Suffix Protection

By default, cookies for public suffixes like `.com`, `.co.uk`, `.github.io` are rejected:

```typescript
// This will be rejected
jar.setCookieSync('evil=value; Domain=.com', 'https://example.com/');
```

### Secure Cookie Enforcement

Secure cookies are only accepted from HTTPS and only sent over HTTPS:

```typescript
// Only works over HTTPS
jar.setCookieSync('token=secret; Secure', 'https://example.com/');
```

### RFC 6265 Ordering

Cookies are sorted by path length (longest first), then by creation time.

## Configuration Options

### Disable Public Suffix Protection

For compatibility with servers that incorrectly set cookies (not recommended):

```typescript
const jar = createCookieJar({ rejectPublicSuffixes: false });
```

## Sharing Cookies Between Clients

Multiple clients can share a cookie jar:

```typescript
const sharedJar = createCookieJar();

const client1 = createClient({
  io: createNodeIO(),
  cookieJar: sharedJar,
});

const client2 = createClient({
  io: createNodeIO(),
  cookieJar: sharedJar,
});

// Login with client1
await client1.run('./auth/login.http');

// client2 now has the session cookie
await client2.run('./api/data.http');
```

## Clearing Cookies

Create a new jar to clear all cookies:

```typescript
const client = createClient({
  io: createNodeIO(),
  cookieJar: createCookieJar(), // Fresh jar, no cookies
});
```

Or for domain-specific clearing, iterate and remove:

```typescript
const cookies = jar.getCookiesSync('https://example.com/');
for (const cookie of cookies) {
  jar.removeCookieSync(cookie.domain, cookie.path, cookie.key);
}
```
