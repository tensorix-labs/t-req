/**
 * E-Commerce Checkout Flow
 *
 * A realistic example showing how to test an e-commerce API flow.
 * Uses dummyjson.com as a real backend.
 *
 * Run: cd examples && bun e-commerce/checkout-flow.ts
 */

import { createClient } from '@t-req/core';
import { createCookieJar } from '@t-req/core/cookies';

const REQUESTS = './e-commerce';

const jar = createCookieJar();
const client = createClient({
  cookieJar: jar,
  variables: {
    baseUrl: 'https://dummyjson.com'
  }
});

// ----------------------------------------------------------------------------
// 1. Login
// ----------------------------------------------------------------------------
console.log('Logging in...');
const loginRes = await client.run(`${REQUESTS}/auth/login.http`, {
  variables: { username: 'emilys', password: 'emilyspass' }
});

if (!loginRes.ok) {
  throw new Error(`Login failed: ${loginRes.status}`);
}

const {
  accessToken,
  id: userId,
  firstName
} = (await loginRes.json()) as {
  accessToken: string;
  id: number;
  firstName: string;
};

// Store auth for all subsequent requests
client.setVariable('token', accessToken);
client.setVariable('userId', userId);

console.log(`Welcome back, ${firstName}!`);

// ----------------------------------------------------------------------------
// 2. Browse products
// ----------------------------------------------------------------------------
console.log('\nBrowsing products...');
const productsRes = await client.run(`${REQUESTS}/products/list.http`, {
  variables: { limit: 10, skip: 0 }
});

const { products } = (await productsRes.json()) as {
  products: Array<{ id: number; title: string; price: number }>;
};

console.log(`Found ${products.length} products:`);
for (const p of products.slice(0, 3)) {
  console.log(`  - ${p.title} ($${p.price})`);
}

// Store featured product for later
client.setVariable('featuredProductId', products[0]?.id);

// ----------------------------------------------------------------------------
// 3. Add items to cart
// ----------------------------------------------------------------------------
console.log('\nAdding items to cart...');
let cartId: number | undefined;

for (const product of products.slice(0, 2)) {
  const addRes = await client.run(`${REQUESTS}/cart/add.http`, {
    variables: { productId: product.id, quantity: 1 }
  });

  const cart = (await addRes.json()) as { id: number; total: number };
  cartId = cart.id;
  console.log(`  Added ${product.title} - Cart total: $${cart.total}`);
}

// Store cartId for subsequent requests
client.setVariable('cartId', cartId);

// ----------------------------------------------------------------------------
// 4. Update quantity
// ----------------------------------------------------------------------------
console.log('\nUpdating quantity...');
const updateRes = await client.run(`${REQUESTS}/cart/update.http`, {
  variables: {
    productId: products[0]?.id,
    quantity: 3 // increase quantity
  }
});

const _updatedCart = (await updateRes.json()) as Record<string, unknown>;
console.log(`Cart updated successfully`);

// ----------------------------------------------------------------------------
// 5. Get product details (uses stored featuredProductId)
// ----------------------------------------------------------------------------
console.log('\nGetting featured product details...');
const productRes = await client.run(`${REQUESTS}/products/get.http`, {
  variables: { productId: client.getVariables().featuredProductId }
});

const product = (await productRes.json()) as {
  title: string;
  description: string;
  stock: number;
};
console.log(`Featured: ${product.title}`);
console.log(`  ${product.description.slice(0, 80)}...`);
console.log(`  In stock: ${product.stock}`);

// ----------------------------------------------------------------------------
// 6. Get user profile (confirm shipping address)
// ----------------------------------------------------------------------------
console.log('\nConfirming shipping address...');
const profileRes = await client.run(`${REQUESTS}/users/profile.http`);
// Note: no variables needed - uses {{userId}} already set on client

const profile = (await profileRes.json()) as {
  address: { address: string; city: string; state: string; postalCode: string };
};
const addr = profile.address;
console.log(`Shipping to: ${addr.address}, ${addr.city}, ${addr.state} ${addr.postalCode}`);

// ----------------------------------------------------------------------------
// 7. Logout
// ----------------------------------------------------------------------------
console.log('\nLogging out...');
await client.run(`${REQUESTS}/auth/logout.http`);

console.log('\n✓ Checkout flow complete!');
