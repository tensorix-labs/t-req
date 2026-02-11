#!/usr/bin/env bun

import { readFile } from 'node:fs/promises';
import path from 'node:path';

const RUNTIME_DEP_FIELDS = ['dependencies', 'peerDependencies', 'optionalDependencies'] as const;

type PackageLike = Record<string, unknown>;

function getDependencyMap(pkg: PackageLike, field: (typeof RUNTIME_DEP_FIELDS)[number]) {
  const value = pkg[field];
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  return value as Record<string, unknown>;
}

async function main() {
  const manifestArg = Bun.argv[2];
  if (!manifestArg) {
    console.error('Usage: bun run script/verify-publish-manifest.ts <path-to-package.json>');
    process.exit(1);
  }

  const manifestPath = path.resolve(process.cwd(), manifestArg);
  const raw = await readFile(manifestPath, 'utf8');
  const pkg = JSON.parse(raw) as PackageLike;
  const packageName = typeof pkg['name'] === 'string' ? pkg['name'] : manifestPath;

  const violations: string[] = [];

  for (const field of RUNTIME_DEP_FIELDS) {
    const deps = getDependencyMap(pkg, field);
    for (const [depName, range] of Object.entries(deps)) {
      if (typeof range === 'string' && range.startsWith('workspace:')) {
        violations.push(`${field}.${depName} -> ${range}`);
      }
    }
  }

  if (violations.length > 0) {
    console.error(`Publish manifest validation failed for ${packageName}`);
    console.error('Runtime dependency fields cannot use workspace: protocol:');
    for (const violation of violations) {
      console.error(`- ${violation}`);
    }
    process.exit(1);
  }

  console.log(`Publish manifest validation passed for ${packageName}`);
}

await main();
