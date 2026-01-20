#!/usr/bin/env bun

import * as path from 'node:path';
import { $ } from 'bun';
import pkg from '../package.json';

const dir = path.resolve(import.meta.dirname, '..');
process.chdir(dir);

const version = pkg.version;

const targets = [
  { os: 'darwin', arch: 'arm64', bunTarget: 'bun-darwin-arm64' },
  { os: 'darwin', arch: 'x64', bunTarget: 'bun-darwin-x64' },
  { os: 'linux', arch: 'arm64', bunTarget: 'bun-linux-arm64' },
  { os: 'linux', arch: 'x64', bunTarget: 'bun-linux-x64' },
  { os: 'windows', arch: 'x64', bunTarget: 'bun-windows-x64' }
] as const;

// Check for --single flag to build only current platform
const singlePlatform = process.argv.includes('--single');

await $`rm -rf dist`;

const platformMap: Record<string, string> = { darwin: 'darwin', linux: 'linux', win32: 'windows' };
const currentPlatform = platformMap[process.platform] ?? process.platform;
const currentArch = process.arch;

const filteredTargets = singlePlatform
  ? targets.filter((t) => t.os === currentPlatform && t.arch === currentArch)
  : targets;

if (singlePlatform && filteredTargets.length === 0) {
  console.error(`No target found for current platform: ${currentPlatform}-${currentArch}`);
  process.exit(1);
}

for (const { os, arch, bunTarget } of filteredTargets) {
  const name = `app-${os}-${arch}`;
  const isWindows = os === 'windows';
  const binaryName = isWindows ? 'treq.exe' : 'treq';
  console.log(`Building ${name}...`);

  await $`mkdir -p dist/${name}/bin`;

  const outfile = path.join(dir, 'dist', name, 'bin', binaryName);
  const entrypoint = path.join(dir, 'src', 'index.ts');

  await $`bun build --compile --target=${bunTarget} --outfile=${outfile} ${entrypoint}`;

  // Write platform package.json
  const platformPkg = {
    name: `@t-req/app-${os}-${arch}`,
    version,
    os: [os === 'windows' ? 'win32' : os],
    cpu: [arch],
    bin: {
      treq: `./bin/${binaryName}`
    }
  };
  await Bun.write(`dist/${name}/package.json`, JSON.stringify(platformPkg, null, 2));
}

console.log('Build complete!');
