---
title: Authentication
description: Implement JWT, Basic Auth, API keys, and OAuth flows with @t-req/core
---

@t-req/core supports various authentication patterns through variables, resolvers, and cookies.

## Bearer Token (JWT)

The most common pattern—extract a token from login and use it for subsequent requests:

```http
# auth/login.http
POST https://api.example.com/auth/login
Content-Type: application/json

{"email": "{{email}}", "password": "{{password}}"}
```

```typescript
import { createClient } from '@t-req/core';
import { createNodeIO } from '@t-req/core/runtime';

const client = createClient({
  io: createNodeIO(),
  variables: {
    email: 'user@example.com',
    password: 'secret',
  },
});

// Login and extract token
const loginResponse = await client.run('./auth/login.http');
const { token } = await loginResponse.json();

// Store token for subsequent requests
client.setVariable('token', token);

// Use in authenticated requests
const profile = await client.run('./users/profile.http');
```

```http
# users/profile.http
GET https://api.example.com/users/me
Authorization: Bearer {{token}}
```

## Basic Authentication

Use a resolver to encode credentials:

```typescript
const client = createClient({
  io: createNodeIO(),
  resolvers: {
    $basicAuth: (username, password) => {
      const credentials = `${username}:${password}`;
      return Buffer.from(credentials).toString('base64');
    },
  },
  variables: {
    username: 'admin',
    password: 'secret',
  },
});
```

```http
GET https://api.example.com/admin
Authorization: Basic {{$basicAuth(["{{username}}", "{{password}}"])}}
```

> **Note:** Variables inside resolver calls are interpolated first. With JSON-args, the expression
> `{{$basicAuth(["{{username}}", "{{password}}"])}}` becomes `{{$basicAuth(["admin", "secret"])}}`,
> then the resolver is called with literal strings `"admin"` and `"secret"`.

Or pre-encode in the variable:

```typescript
const client = createClient({
  variables: {
    basicAuth: Buffer.from('admin:secret').toString('base64'),
  },
});
```

```http
GET https://api.example.com/admin
Authorization: Basic {{basicAuth}}
```

## API Keys

### Header-based

```http
GET https://api.example.com/data
X-API-Key: {{apiKey}}
```

### Query parameter

```http
GET https://api.example.com/data?api_key={{apiKey}}
```

### Using environment variables

```typescript
const client = createClient({
  io: createNodeIO(),
  resolvers: {
    $env: (key) => process.env[key] || '',
  },
});
```

```http
GET https://api.example.com/data
X-API-Key: {{$env(API_KEY)}}
```

## OAuth 2.0 Client Credentials

```http
# auth/oauth-token.http
POST https://auth.example.com/oauth/token
Content-Type: application/x-www-form-urlencoded

grant_type=client_credentials&client_id={{clientId}}&client_secret={{clientSecret}}
```

```typescript
const client = createClient({
  io: createNodeIO(),
  variables: {
    clientId: process.env.OAUTH_CLIENT_ID,
    clientSecret: process.env.OAUTH_CLIENT_SECRET,
  },
});

const tokenResponse = await client.run('./auth/oauth-token.http');
const { access_token, expires_in } = await tokenResponse.json();

client.setVariable('accessToken', access_token);

// Use the token
const data = await client.run('./api/data.http');
```

## Token Refresh Pattern

Implement automatic token refresh:

```typescript
async function withAuth<T>(
  fn: () => Promise<Response>
): Promise<Response> {
  const response = await fn();

  if (response.status === 401) {
    // Token expired, refresh it
    const refreshResponse = await client.run('./auth/refresh.http');
    const { token } = await refreshResponse.json();
    client.setVariable('token', token);

    // Retry the original request
    return await fn();
  }

  return response;
}

const profile = await withAuth(() => client.run('./users/profile.http'));
```

## Session Cookies

Use the cookie jar for session-based authentication:

```typescript
import { createClient } from '@t-req/core';
import { createNodeIO } from '@t-req/core/runtime';
import { createCookieJar } from '@t-req/core/cookies';

const client = createClient({
  io: createNodeIO(),
  cookieJar: createCookieJar(),
});

// Login sets session cookie automatically
await client.run('./auth/login.http');

// Subsequent requests include the session cookie
const profile = await client.run('./users/profile.http');
```

See [Cookies](/guides/cookies/) for more details on cookie management.

## Multiple Authentication Contexts

For APIs requiring different auth for different endpoints:

```typescript
// Admin client
const adminClient = createClient({
  io: createNodeIO(),
  variables: { token: adminToken },
});

// User client
const userClient = createClient({
  io: createNodeIO(),
  variables: { token: userToken },
});

// Or switch contexts dynamically
client.setVariable('token', isAdmin ? adminToken : userToken);
```
