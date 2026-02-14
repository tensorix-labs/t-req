#!/usr/bin/env bun

/**
 * Export the OpenAPI spec from the server to a static JSON file.
 *
 * Usage: bun run script/export-openapi.ts
 *
 * This creates packages/app/openapi.json which serves as the single
 * source of truth for SDK code generation and contract testing.
 */

import { spawnSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { createApp } from '../src/server/app';

const dir = path.resolve(import.meta.dirname, '..');

let exitCode = 0;

// Create app with minimal config — we only need the route definitions
const { app, dispose } = createApp({
  workspace: dir, // doesn't matter, just needs a valid dir
  host: 'localhost',
  port: 4097,
  maxBodyBytes: 10 * 1024 * 1024,
  maxSessions: 100
});

try {
  // Fetch the OpenAPI spec from the /doc endpoint using app.request()
  const response = await app.request('/doc');
  if (!response.ok) {
    console.error(`Failed to get OpenAPI spec: ${response.status} ${response.statusText}`);
    exitCode = 1;
  } else {
    const spec = await response.json();

    // Write to openapi.json with stable formatting
    const outPath = path.join(dir, 'openapi.json');
    fs.writeFileSync(outPath, `${JSON.stringify(spec, null, 2)}\n`);

    // Ensure generated spec matches Biome formatting so lint stays clean.
    const biomeBin = path.join(
      dir,
      '..',
      '..',
      'node_modules',
      '.bin',
      process.platform === 'win32' ? 'biome.cmd' : 'biome'
    );
    if (fs.existsSync(biomeBin)) {
      const formatResult = spawnSync(biomeBin, ['format', '--write', outPath], {
        cwd: dir,
        encoding: 'utf-8'
      });
      if (formatResult.status !== 0) {
        const details =
          formatResult.stderr || formatResult.stdout || 'Unknown Biome formatting error';
        console.error(`Failed to format OpenAPI spec with Biome:\n${details}`);
        exitCode = 1;
      }
    }

    console.log(`OpenAPI spec exported to ${outPath}`);
  }
} finally {
  dispose();
}

process.exit(exitCode);
