import { createClient } from '@t-req/core';

const client = createClient({
  variables: {
    baseUrl: 'https://httpbin.org/',
    userId: '123',
    token: '1234567890'
  }
});

console.log('Running simple GET request...');
await client.run('./post-json.http');

await client.run('./simple-get.http');
// await client.run('./simple-get.http');

console.log('Simple GET request completed');
await client.close();
console.log('Test completed');
