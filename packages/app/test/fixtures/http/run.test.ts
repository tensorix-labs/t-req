import { afterAll, describe, expect, it } from 'bun:test';
import { createClient } from '@t-req/core';

const client = createClient({
  variables: {
    baseUrl: 'https://httpbin.org/',
    userId: '123',
    token: '1234567890'
  }
});

afterAll(async () => {
  await client.close();
});

describe('httpbin API', () => {
  it('should get a simple GET request', async () => {
    const response = await client.run('./simple-get.http');
    expect(response.ok).toBe(true);
    expect(response.status).toBe(200);
  });
});
