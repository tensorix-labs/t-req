import { createRemoteClient } from '@t-req/core';

const client = createRemoteClient({
  variables: {
    baseUrl: 'https://httpbin.org/',
    //baseUrl: 'https://dummyjson.com/carts',
    userId: '123',
    token: '1234567890'
  }
});
console.log('Running simple GET request...');
await client.run('./simple-get.http');
// await client.run('./simple-get.http');
// await client.run('./post-json.http');

console.log('Simple GET request completed');
await client.close();
console.log('Test completed');
