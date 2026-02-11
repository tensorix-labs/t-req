#!/usr/bin/env bun

/**
 * Unified release script for t-req monorepo
 *
 * Usage:
 *   bun run script/release.ts --package core
 *   bun run script/release.ts --package app
 *   bun run script/release.ts --package core --package app
 *   bun run script/release.ts --package core --dry-run
 *
 * This script:
 * 1. Validates clean working directory and main branch
 * 2. Reads version from package.json (never mutates it)
 * 3. Verifies tag doesn't already exist
 * 4. Creates and pushes git tag
 * 5. Tag triggers GitHub Actions for actual publishing
 */

import * as path from 'node:path';
import { $ } from 'bun';

const ROOT_DIR = path.resolve(import.meta.dirname, '..');

interface PackageConfig {
  path: string;
  tagPrefix: string;
}

const PACKAGES: Record<string, PackageConfig> = {
  core: { path: 'packages/core', tagPrefix: 'core-v' },
  app: { path: 'packages/app', tagPrefix: 'app-v' },
  sdk: { path: 'packages/sdk/js', tagPrefix: 'sdk-v' },
  'plugin-base': { path: 'packages/plugins/base', tagPrefix: 'plugin-base-v' },
  'plugin-assert': { path: 'packages/plugins/assert', tagPrefix: 'plugin-assert-v' }
};

function parseArgs(): { packages: string[]; dryRun: boolean } {
  const args = process.argv.slice(2);
  const packages: string[] = [];
  let dryRun = false;

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--package' || arg === '-p') {
      const pkg = args[++i];
      if (!pkg || pkg.startsWith('-')) {
        console.error('Error: --package requires a package name');
        process.exit(1);
      }
      packages.push(pkg);
    } else if (arg === '--dry-run' || arg === '-n') {
      dryRun = true;
    } else if (arg === '--help' || arg === '-h') {
      printHelp();
      process.exit(0);
    } else {
      console.error(`Unknown argument: ${arg}`);
      printHelp();
      process.exit(1);
    }
  }

  if (packages.length === 0) {
    console.error('Error: At least one --package is required');
    printHelp();
    process.exit(1);
  }

  return { packages, dryRun };
}

function printHelp(): void {
  console.log(`
Usage: bun run script/release.ts [options]

Options:
  --package, -p <name>   Package to release (core, app, sdk, plugin-base, plugin-assert). Can be specified multiple times.
  --dry-run, -n          Show what would be done without making changes
  --help, -h             Show this help message

Examples:
  bun run script/release.ts --package core
  bun run script/release.ts --package app --dry-run
  bun run script/release.ts --package sdk
  bun run script/release.ts --package plugin-base
  bun run script/release.ts --package plugin-assert
  bun run script/release.ts --package core --package app
`);
}

async function getGitStatus(): Promise<{ clean: boolean; branch: string }> {
  const statusResult = await $`git status --porcelain`.quiet();
  const clean = statusResult.text().trim() === '';

  const branchResult = await $`git rev-parse --abbrev-ref HEAD`.quiet();
  const branch = branchResult.text().trim();

  return { clean, branch };
}

async function tagExists(tag: string): Promise<boolean> {
  try {
    await $`git rev-parse ${tag}`.quiet();
    return true;
  } catch {
    return false;
  }
}

async function getPackageVersion(packagePath: string): Promise<string> {
  const pkgJsonPath = path.join(ROOT_DIR, packagePath, 'package.json');
  const pkg = await Bun.file(pkgJsonPath).json();
  return pkg.version;
}

async function createAndPushTag(tag: string, message: string, dryRun: boolean): Promise<void> {
  if (dryRun) {
    console.log(`  [dry-run] Would create tag: ${tag}`);
    console.log(`  [dry-run] Would push tag to origin`);
    return;
  }

  await $`git tag -a ${tag} -m ${message}`;
  console.log(`  Created tag: ${tag}`);

  await $`git push origin ${tag}`;
  console.log(`  Pushed tag to origin`);
}

async function releasePackage(
  packageName: string,
  config: PackageConfig,
  dryRun: boolean
): Promise<void> {
  console.log(`\nReleasing ${packageName}...`);

  // Read version from package.json
  const version = await getPackageVersion(config.path);
  const tag = `${config.tagPrefix}${version}`;
  console.log(`  Version: ${version}`);
  console.log(`  Tag: ${tag}`);

  // Check if tag already exists
  if (await tagExists(tag)) {
    console.error(`  Error: Tag ${tag} already exists`);
    console.error(
      `  Either the version has already been released, or you need to bump the version first.`
    );
    process.exit(1);
  }

  // Create and push tag
  await createAndPushTag(tag, `Release ${packageName} ${version}`, dryRun);

  console.log(`  Done! GitHub Actions will handle publishing.`);
}

async function main(): Promise<void> {
  const { packages, dryRun } = parseArgs();

  console.log('t-req Release Script');
  console.log('====================');

  if (dryRun) {
    console.log('[DRY RUN MODE]');
  }

  // Validate packages
  for (const pkg of packages) {
    if (!PACKAGES[pkg]) {
      console.error(`Error: Unknown package "${pkg}"`);
      console.error(`Available packages: ${Object.keys(PACKAGES).join(', ')}`);
      process.exit(1);
    }
  }

  // Check git status
  console.log('\nChecking git status...');
  const { clean, branch } = await getGitStatus();

  if (!clean) {
    console.error('Error: Working directory is not clean');
    console.error('Please commit or stash your changes before releasing.');
    process.exit(1);
  }
  console.log('  Working directory is clean');

  if (branch !== 'main') {
    console.error(`Error: Not on main branch (currently on ${branch})`);
    console.error('Releases should be made from the main branch.');
    process.exit(1);
  }
  console.log('  On main branch');

  // Ensure we have the latest
  console.log('\nFetching latest from origin...');
  await $`git fetch origin --tags`.quiet();
  console.log('  Fetched latest tags');

  // Verify local is not behind remote
  const behindResult = await $`git rev-list --count HEAD..origin/main`.quiet();
  const behindCount = parseInt(behindResult.text().trim());
  if (behindCount > 0) {
    console.error(`Error: Local main is ${behindCount} commit(s) behind origin/main`);
    console.error('Run: git pull origin main');
    process.exit(1);
  }
  console.log('  Local branch is up to date');

  // Release each package
  for (const pkg of packages) {
    await releasePackage(pkg, PACKAGES[pkg], dryRun);
  }

  console.log('\n====================');
  if (dryRun) {
    console.log('Dry run complete. No changes were made.');
  } else {
    console.log('Release tags pushed! Monitor GitHub Actions for publishing status.');
  }
}

main().catch((error) => {
  console.error('Release failed:', error);
  process.exit(1);
});
