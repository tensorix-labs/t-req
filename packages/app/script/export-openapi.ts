#!/usr/bin/env bun

/**
 * Export the OpenAPI spec from the server to a static JSON file.
 *
 * Usage: bun run script/export-openapi.ts
 *
 * This creates packages/app/openapi.json which serves as the single
 * source of truth for SDK code generation and contract testing.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { createApp } from '../src/server/app';

const dir = path.resolve(import.meta.dirname, '..');

// Create app with minimal config — we only need the route definitions
const { app, dispose } = createApp({
  workspace: dir, // doesn't matter, just needs a valid dir
  host: 'localhost',
  port: 4097,
  maxBodyBytes: 10 * 1024 * 1024,
  maxSessions: 100
});

// Fetch the OpenAPI spec from the /doc endpoint using app.request()
const response = await app.request('/doc');
if (!response.ok) {
  console.error(`Failed to get OpenAPI spec: ${response.status} ${response.statusText}`);
  process.exit(1);
}

const spec = await response.json();

// Write to openapi.json with stable formatting
const outPath = path.join(dir, 'openapi.json');
fs.writeFileSync(outPath, `${JSON.stringify(spec, null, 2)}\n`);

console.log(`OpenAPI spec exported to ${outPath}`);

dispose();
