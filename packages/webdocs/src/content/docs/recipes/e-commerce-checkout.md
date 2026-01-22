---
title: E-Commerce Checkout
description: Complete e-commerce checkout flow example
---

A realistic multi-step workflow demonstrating @t-req/core's capabilities.

## Overview

This recipe implements a complete e-commerce checkout flow:

1. User login
2. Browse products
3. Add items to cart
4. Apply discount code
5. Complete checkout

## File Structure

```
requests/
├── auth/
│   └── login.http
├── products/
│   ├── list.http
│   └── get.http
├── cart/
│   ├── create.http
│   ├── add-item.http
│   └── get.http
├── discounts/
│   └── apply.http
└── checkout/
    └── complete.http
```

## Request Files

### auth/login.http

```http
POST {{baseUrl}}/auth/login
Content-Type: application/json

{
  "email": "{{email}}",
  "password": "{{password}}"
}
```

### products/list.http

```http
GET {{baseUrl}}/products?limit={{limit}}&skip={{skip}}
Authorization: Bearer {{token}}
```

### products/get.http

```http
GET {{baseUrl}}/products/{{productId}}
Authorization: Bearer {{token}}
```

### cart/create.http

```http
POST {{baseUrl}}/carts/add
Authorization: Bearer {{token}}
Content-Type: application/json

{
  "userId": {{userId}}
}
```

### cart/add-item.http

```http
POST {{baseUrl}}/carts/{{cartId}}
Authorization: Bearer {{token}}
Content-Type: application/json

{
  "products": [
    {
      "id": {{productId}},
      "quantity": {{quantity}}
    }
  ]
}
```

### cart/get.http

```http
GET {{baseUrl}}/carts/{{cartId}}
Authorization: Bearer {{token}}
```

### checkout/complete.http

```http
POST {{baseUrl}}/checkout
Authorization: Bearer {{token}}
Content-Type: application/json

{
  "cartId": {{cartId}},
  "paymentMethod": "{{paymentMethod}}",
  "shippingAddress": {
    "street": "{{street}}",
    "city": "{{city}}",
    "zip": "{{zip}}"
  }
}
```

## Implementation

```typescript
import { createClient } from '@t-req/core';
import { createNodeIO } from '@t-req/core/runtime';
import { createCookieJar } from '@t-req/core/cookies';

// Initialize client
const client = createClient({
  io: createNodeIO(),
  cookieJar: createCookieJar(),
  variables: {
    baseUrl: 'https://dummyjson.com',
  },
});

async function checkoutFlow() {
  console.log('Starting checkout flow...\n');

  // Step 1: Login
  console.log('1. Logging in...');
  client.setVariables({
    email: 'emilys',
    password: 'emilyspass',
  });

  const loginResponse = await client.run('./requests/auth/login.http');
  if (!loginResponse.ok) {
    throw new Error(`Login failed: ${loginResponse.status}`);
  }

  const { accessToken: token, id: userId } = await loginResponse.json();
  client.setVariable('token', token);
  client.setVariable('userId', userId);
  console.log(`   Logged in as user ${userId}\n`);

  // Step 2: Browse products
  console.log('2. Fetching products...');
  client.setVariables({ limit: '10', skip: '0' });

  const productsResponse = await client.run('./requests/products/list.http');
  const { products } = await productsResponse.json();
  console.log(`   Found ${products.length} products\n`);

  // Step 3: Get product details
  console.log('3. Getting product details...');
  const selectedProduct = products[0];
  client.setVariable('productId', selectedProduct.id);

  const productResponse = await client.run('./requests/products/get.http');
  const product = await productResponse.json();
  console.log(`   Selected: ${product.title} - $${product.price}\n`);

  // Step 4: Create cart and add item
  console.log('4. Adding to cart...');
  const cartResponse = await client.run('./requests/cart/create.http');
  const { id: cartId } = await cartResponse.json();
  client.setVariable('cartId', cartId);

  client.setVariable('quantity', 2);
  await client.run('./requests/cart/add-item.http');
  console.log(`   Added ${product.title} x2 to cart ${cartId}\n`);

  // Step 5: View cart
  console.log('5. Viewing cart...');
  const viewCartResponse = await client.run('./requests/cart/get.http');
  const cart = await viewCartResponse.json();
  console.log(`   Cart total: $${cart.total}\n`);

  // Step 6: Complete checkout
  console.log('6. Completing checkout...');
  client.setVariables({
    paymentMethod: 'credit_card',
    street: '123 Main St',
    city: 'New York',
    zip: '10001',
  });

  const checkoutResponse = await client.run('./requests/checkout/complete.http');

  if (checkoutResponse.ok) {
    const order = await checkoutResponse.json();
    console.log(`   Order completed! Order ID: ${order.id}\n`);
  } else {
    console.log(`   Checkout simulation (demo API doesn't support checkout)\n`);
  }

  console.log('Checkout flow completed!');
}

// Run the flow
checkoutFlow().catch(console.error);
```

## Running the Example

```bash
# From the t-req/examples directory
bun examples/e-commerce/checkout-flow.ts
```

## Key Patterns Demonstrated

### Variable Extraction

Extract values from responses and use in subsequent requests:

```typescript
const { accessToken: token } = await loginResponse.json();
client.setVariable('token', token);
```

### Per-Request Variables

Override variables for specific requests:

```typescript
await client.run('./products/get.http', {
  variables: { productId: '123' },
});
```

### Error Handling

Check response status before processing:

```typescript
if (!loginResponse.ok) {
  throw new Error(`Login failed: ${loginResponse.status}`);
}
```

### Cookie Persistence

Session cookies are automatically managed:

```typescript
const client = createClient({
  cookieJar: createCookieJar(),
});

// After login, session cookie is stored
await client.run('./auth/login.http');

// Subsequent requests include the cookie
await client.run('./api/protected.http');
```

## Extending the Example

### Add Retry Logic

```typescript
import { withRetry } from './utils/retry';

const response = await withRetry(
  () => client.run('./checkout/complete.http'),
  { retries: 3, delay: 1000 }
);
```

### Add Timing

```typescript
const start = performance.now();
const response = await client.run('./products/list.http');
console.log(`Products fetched in ${(performance.now() - start).toFixed(0)}ms`);
```

### Parallel Product Fetches

```typescript
const productDetails = await Promise.all(
  productIds.map((id) =>
    client.run('./products/get.http', { variables: { productId: id } })
  )
);
```
