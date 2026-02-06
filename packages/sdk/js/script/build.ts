#!/usr/bin/env bun

/**
 * Generate the SDK from the OpenAPI spec.
 *
 * Usage: bun run script/build.ts
 *
 * Reads ../../app/openapi.json and generates typed SDK code into src/gen/.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { createClient } from '@hey-api/openapi-ts';

const root = path.resolve(import.meta.dirname, '..');
const input = path.resolve(root, '../../app/openapi.json');
const output = path.resolve(root, 'src/gen');

await createClient({
  input,
  output: {
    path: output,
    clean: true
  },
  plugins: [
    {
      name: '@hey-api/typescript',
      exportFromIndex: false
    },
    {
      name: '@hey-api/sdk',
      exportFromIndex: false,
      auth: false,
      operations: {
        strategy: 'single',
        containerName: 'TreqClient'
      }
    },
    {
      name: '@hey-api/client-fetch',
      exportFromIndex: false,
      baseUrl: 'http://localhost:4097'
    }
  ]
});

// Post-process: replace BodyInit references with `any` in generated client code.
// The @hey-api/client-fetch plugin uses BodyInit (a DOM type) which isn't available
// in all consumer tsconfigs. Since these are just type assertions, `any` is safe.
const clientGenPath = path.join(output, 'client', 'client.gen.ts');
let clientCode = fs.readFileSync(clientGenPath, 'utf-8');
clientCode = clientCode.replaceAll('BodyInit', 'any');
fs.writeFileSync(clientGenPath, clientCode);

console.log(`SDK generated at ${output}`);
