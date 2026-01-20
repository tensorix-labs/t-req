#!/usr/bin/env node

import fs from 'node:fs';
import { createRequire } from 'node:module';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const __dirname = path.dirname(fileURLToPath(import.meta.url));

function detectPlatform() {
  const platformMap = { darwin: 'darwin', linux: 'linux', win32: 'windows' };
  const archMap = { x64: 'x64', arm64: 'arm64' };
  return {
    platform: platformMap[os.platform()] ?? os.platform(),
    arch: archMap[os.arch()] ?? os.arch()
  };
}

function findBinaryPackage(packageName) {
  // Try to resolve from node_modules
  try {
    const packageJsonPath = require.resolve(`${packageName}/package.json`);
    return path.dirname(packageJsonPath);
  } catch {
    return null;
  }
}

try {
  const { platform, arch } = detectPlatform();
  const packageName = `@t-req/app-${platform}-${arch}`;
  const binaryName = platform === 'windows' ? 'treq.exe' : 'treq';

  const packageDir = findBinaryPackage(packageName);

  if (!packageDir) {
    console.warn(`Note: Platform package ${packageName} not found.`);
    console.warn('This is expected if your platform is not yet supported.');
    console.warn(
      'Supported platforms: darwin-arm64, darwin-x64, linux-arm64, linux-x64, windows-x64'
    );
    process.exit(0);
  }

  const binaryPath = path.join(packageDir, 'bin', binaryName);

  if (!fs.existsSync(binaryPath)) {
    console.error(`Error: Binary not found at ${binaryPath}`);
    console.error('Try reinstalling @t-req/app');
    process.exit(1);
  }

  // Ensure binary is executable (no-op on Windows)
  if (platform !== 'windows') {
    try {
      fs.chmodSync(binaryPath, 0o755);
    } catch {
      // Ignore chmod errors (might not have permission)
    }
  }

  console.log(`treq: ${platform}-${arch} binary ready`);
} catch (error) {
  console.error('Failed to verify treq binary:', error.message);
  process.exit(1);
}
