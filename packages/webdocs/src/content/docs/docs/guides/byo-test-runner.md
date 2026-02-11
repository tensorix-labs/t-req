---
title: BYO Test Runner
description: Use any test framework with t-req. Your runner handles assertions, t-req handles HTTP.
---

t-req handles HTTP parsing and execution. Your test framework handles assertions. This separation means you can use the test runner you already know — Vitest, Jest, Bun test, pytest, or anything else.

## Philosophy

`.http` files are data, not test specs. They define what request to send, not what to assert. Your test framework provides:

- Test organization and naming
- Assertions and matchers
- Setup/teardown lifecycle
- Parallel execution
- Coverage and reporting

t-req provides:

- `.http` file parsing with variable interpolation
- Request execution with cookie handling
- Profile-based configuration
- Observer mode for TUI observability

## Alternative: inline assertions plugin

If you want a runner-less path for simple CI checks, use [`@t-req/plugin-assert`](https://www.npmjs.com/package/@t-req/plugin-assert):

```jsonc
{
  "plugins": ["@t-req/plugin-assert"]
}
```

```http
# @assert status == 200
# @assert jsonpath $.token exists
GET {{baseUrl}}/auth/login
```

Then run:

```bash
treq run ./requests/auth/login.http
```

Any failed assertion exits with code `1`. This complements BYO test runner; it does not replace advanced test-suite workflows.

## Vitest example

```typescript
// tests/api.test.ts
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createClient } from '@t-req/core';

describe('User API', () => {
  const client = createClient({
    variables: { baseUrl: 'https://api.example.com' },
  });

  let token: string;

  beforeAll(async () => {
    const res = await client.run('./requests/auth/login.http', {
      variables: { username: 'admin', password: 'secret' },
    });
    const body = await res.json();
    token = body.accessToken;
    client.setVariable('token', token);
  });

  afterAll(async () => {
    await client.close();
  });

  it('lists users', async () => {
    const res = await client.run('./requests/users/list.http');
    expect(res.status).toBe(200);

    const users = await res.json();
    expect(users).toBeInstanceOf(Array);
    expect(users.length).toBeGreaterThan(0);
  });

  it('gets user profile', async () => {
    const res = await client.run('./requests/users/profile.http', {
      variables: { userId: '1' },
    });
    expect(res.status).toBe(200);

    const profile = await res.json();
    expect(profile).toHaveProperty('email');
  });
});
```

## Jest example

The same pattern works with Jest:

```typescript
// tests/api.test.ts
import { createClient } from '@t-req/core';

const client = createClient({
  variables: { baseUrl: 'https://api.example.com' },
});

afterAll(() => client.close());

test('lists users', async () => {
  const res = await client.run('./requests/users/list.http');
  expect(res.status).toBe(200);

  const users = await res.json();
  expect(Array.isArray(users)).toBe(true);
});
```

## Bun test example

```typescript
// tests/api.test.ts
import { describe, it, expect, afterAll } from 'bun:test';
import { createClient } from '@t-req/core';

const client = createClient({
  variables: { baseUrl: 'https://api.example.com' },
});

afterAll(() => client.close());

describe('API', () => {
  it('returns 200 for health check', async () => {
    const res = await client.run('./requests/health.http');
    expect(res.status).toBe(200);
  });
});
```

## pytest example

Python tests use the t-req server API directly via HTTP:

```python
# tests/test_api.py
import requests
import pytest

TREQ_SERVER = "http://localhost:4096"

@pytest.fixture(scope="session")
def session_id():
    res = requests.post(f"{TREQ_SERVER}/session", json={
        "variables": {"baseUrl": "https://api.example.com"}
    })
    sid = res.json()["id"]
    yield sid
    requests.delete(f"{TREQ_SERVER}/session/{sid}")

def test_list_users(session_id):
    res = requests.post(f"{TREQ_SERVER}/execute", json={
        "sessionId": session_id,
        "path": "./requests/users/list.http"
    })
    assert res.status_code == 200
    data = res.json()
    assert data["response"]["status"] == 200
```

Start the server before running tests:

```bash
treq serve &
pytest tests/
```

## Auto-detection

When running tests from the TUI, t-req automatically detects the right test framework by looking at your project's dependencies:

| Framework | Detection |
|-----------|-----------|
| bun test  | `bun.lockb` present or `bun` in path |
| vitest    | `vitest` in `devDependencies` |
| jest      | `jest` in `devDependencies` |
| pytest    | `pytest` or `.py` test files |

## Observer mode tie-in

When tests run through the TUI (via `treq open`), every `createClient()` call automatically connects to the server. All HTTP requests appear in real-time in the TUI — no extra configuration needed.

See [Observer Mode](/docs/guides/observer-mode) for details on how this works.
