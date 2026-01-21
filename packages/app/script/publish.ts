#!/usr/bin/env bun

import * as path from 'node:path';
import { $ } from 'bun';
import pkg from '../package.json';

const dir = path.resolve(import.meta.dirname, '..');
process.chdir(dir);

const version = pkg.version;
const dryRun = process.argv.includes('--dry-run');

const targets = [
  { os: 'darwin', arch: 'arm64' },
  { os: 'darwin', arch: 'x64' },
  { os: 'linux', arch: 'arm64' },
  { os: 'linux', arch: 'x64' },
  { os: 'windows', arch: 'x64' }
] as const;

// Build binaries map for optionalDependencies
const binaries: Record<string, string> = {};
for (const { os, arch } of targets) {
  binaries[`@t-req/app-${os}-${arch}`] = version;
}

console.log(`Publishing @t-req/app v${version}${dryRun ? ' (dry-run)' : ''}`);
console.log();

// Step 1: Build all platform binaries
console.log('Step 1: Building all platform binaries...');
await $`bun run build:all`;
console.log();

// Step 2: Smoke test current platform binary
const platformMap: Record<string, string> = { darwin: 'darwin', linux: 'linux', win32: 'windows' };
const currentPlatform = platformMap[process.platform] ?? process.platform;
const currentArch = process.arch;
const currentBinaryDir = `app-${currentPlatform}-${currentArch}`;
const currentBinaryPath = path.join(dir, 'dist', currentBinaryDir, 'bin', 'treq');

console.log(`Step 2: Smoke testing ${currentBinaryDir}...`);
const result = await $`${currentBinaryPath} --version`.quiet();
console.log(`  Binary version: ${result.text().trim()}`);
console.log();

// Step 3: Publish platform packages
console.log('Step 3: Publishing platform packages...');
for (const { os, arch } of targets) {
  const name = `app-${os}-${arch}`;
  const pkgName = `@t-req/app-${os}-${arch}`;
  const distPath = path.join(dir, 'dist', name);

  console.log(`  Publishing ${pkgName}...`);

  // Ensure binaries are executable
  await $`chmod -R 755 ${distPath}/bin`.quiet();

  if (dryRun) {
    await $`npm pack`.cwd(distPath).quiet();
    console.log(`    [dry-run] Would publish ${pkgName}@${version}`);
  } else {
    await $`npm publish --access public`.cwd(distPath);
  }
}
console.log();

// Step 4: Create and publish wrapper package
console.log('Step 4: Creating wrapper package...');
const wrapperDir = path.join(dir, 'dist', 'app');
await $`mkdir -p ${wrapperDir}`;
await $`cp -r ${dir}/bin ${wrapperDir}/bin`;
await $`cp ${dir}/script/postinstall.mjs ${wrapperDir}/postinstall.mjs`;
await $`cp ${dir}/README.md ${wrapperDir}/README.md`;
await $`cp ${path.join(dir, '..', '..', 'LICENSE')} ${wrapperDir}/LICENSE`;

const wrapperPkg = {
  name: '@t-req/app',
  version,
  description: pkg.description,
  license: pkg.license,
  repository: pkg.repository,
  homepage: pkg.homepage,
  bugs: pkg.bugs,
  keywords: pkg.keywords,
  author: pkg.author,
  engines: pkg.engines,
  bin: {
    treq: './bin/treq'
  },
  scripts: {
    postinstall: 'bun ./postinstall.mjs || node ./postinstall.mjs'
  },
  optionalDependencies: binaries
};

await Bun.write(path.join(wrapperDir, 'package.json'), JSON.stringify(wrapperPkg, null, 2));

console.log('Step 5: Publishing wrapper package...');
if (dryRun) {
  await $`npm pack`.cwd(wrapperDir).quiet();
  console.log(`  [dry-run] Would publish @t-req/app@${version}`);
} else {
  await $`npm publish --access public`.cwd(wrapperDir);
}
console.log();

console.log(`Done! Published @t-req/app v${version}${dryRun ? ' (dry-run)' : ''}`);
