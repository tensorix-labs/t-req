#!/usr/bin/env bun
/**
 * Create Post Workflow
 *
 * Demonstrates a multi-step flow with typed responses:
 * 1. Login to get auth token
 * 2. Create a new post
 * 3. Fetch the created post to verify
 *
 * Run: bun workflows/create-post-flow.ts
 */

import { createClient } from '@t-req/core';
import { resolveProjectConfig } from '@t-req/core/config';
import {
  CreatePostRequest,
  CreatePostResponse,
  LoginRequest,
  LoginResponse,
  Post
} from '../schemas';

const { config } = await resolveProjectConfig({ startDir: process.cwd() });

const client = createClient({
  variables: config.variables
});

// ----------------------------------------------------------------------------
// Step 1: Login
// ----------------------------------------------------------------------------
console.log('Step 1: Logging in...');

// Validate request body before API call
const loginBody = LoginRequest.parse({
  username: config.variables.username,
  password: config.variables.password
});

const loginResponse = await client.run('./collection/auth/login.http', {
  variables: loginBody
});

if (!loginResponse.ok) {
  console.error('Login failed:', loginResponse.status);
  process.exit(1);
}

// Parse and validate with schema - typed as LoginResponse
const loginResult = LoginResponse.parse(await loginResponse.json());

console.log(`  Logged in as ${loginResult.firstName} ${loginResult.lastName}`);
console.log(`  Access token: ${loginResult.accessToken.slice(0, 20)}...`);

// Store token for subsequent requests
client.setVariable('token', loginResult.accessToken);
client.setVariable('userId', loginResult.id);

// ----------------------------------------------------------------------------
// Step 2: Create Post
// ----------------------------------------------------------------------------
console.log('\nStep 2: Creating post...');

// Validate request body before API call
const createBody = CreatePostRequest.parse({
  title: 'My Typed Post',
  body: 'This post was created using a typed collection workflow.',
  userId: loginResult.id
});

const createResponse = await client.run('./collection/posts/create.http', {
  variables: createBody
});

if (!createResponse.ok) {
  console.error('Create post failed:', createResponse.status);
  process.exit(1);
}

// Parse and validate - typed as CreatePostResponse
const createdPost = CreatePostResponse.parse(await createResponse.json());

console.log(`  Created post with ID: ${createdPost.id}`);
console.log(`  Title: ${createdPost.title}`);

// ----------------------------------------------------------------------------
// Step 3: Fetch an existing post (to demonstrate schema validation)
// ----------------------------------------------------------------------------
// Note: JSONPlaceholder doesn't persist created posts, so we fetch an existing one
console.log('\nStep 3: Fetching existing post...');

const getResponse = await client.run('./collection/posts/get.http', {
  variables: { postId: 1 }
});

if (!getResponse.ok) {
  console.error('Get post failed:', getResponse.status);
  process.exit(1);
}

// Parse and validate - typed as Post
const fetchedPost = Post.parse(await getResponse.json());

console.log(`  Fetched post: "${fetchedPost.title.slice(0, 40)}..."`);
console.log(`  Body preview: ${fetchedPost.body.slice(0, 50)}...`);

// ----------------------------------------------------------------------------
// Summary
// ----------------------------------------------------------------------------
console.log('\n----------------------------------------');
console.log('Workflow complete!');
console.log('');
console.log('This workflow demonstrated:');
console.log('  - Multi-step request orchestration');
console.log('  - Schema validation with Zod (LoginResponse, CreatePostResponse, Post)');
console.log('  - Type-safe response handling');
console.log('  - Variable chaining between requests');
