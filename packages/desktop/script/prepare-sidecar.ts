#!/usr/bin/env bun

import { chmod, copyFile, mkdir, stat } from 'node:fs/promises';
import * as path from 'node:path';

const desktopDir = path.resolve(import.meta.dirname, '..');
const appDir = path.resolve(desktopDir, '../app');
const sidecarDir = path.join(desktopDir, 'src-tauri', 'sidecars');

const tripleToAppDistDir: Record<string, string> = {
  'aarch64-apple-darwin': 'app-darwin-arm64',
  'x86_64-apple-darwin': 'app-darwin-x64'
};

function readHostTriple(): string {
  const result = Bun.spawnSync({
    cmd: ['rustc', '--print', 'host-tuple'],
    stdout: 'pipe',
    stderr: 'pipe'
  });

  if (result.exitCode !== 0) {
    const stderr = Buffer.from(result.stderr).toString().trim();
    throw new Error(`failed to resolve Rust host triple via rustc --print host-tuple: ${stderr}`);
  }

  const triple = Buffer.from(result.stdout).toString().trim();
  if (!triple) {
    throw new Error('rustc --print host-tuple returned an empty result');
  }

  return triple;
}

async function main(): Promise<void> {
  const targetTriple = readHostTriple();
  const appDistDir = tripleToAppDistDir[targetTriple];

  if (!appDistDir) {
    throw new Error(
      `unsupported host target triple "${targetTriple}". macOS-only triples supported: ${Object.keys(tripleToAppDistDir).join(', ')}`
    );
  }

  console.log(`[sidecar] target triple: ${targetTriple}`);
  console.log('[sidecar] building @t-req/app single-target binary');
  const buildProcess = Bun.spawn(['bun', 'run', 'build:single'], {
    cwd: appDir,
    stdout: 'inherit',
    stderr: 'inherit'
  });
  const buildExitCode = await buildProcess.exited;
  if (buildExitCode !== 0) {
    throw new Error(`bun run build:single failed with exit code ${buildExitCode}`);
  }

  const sourceBinaryPath = path.join(appDir, 'dist', appDistDir, 'bin', 'treq');
  const destinationBinaryPath = path.join(sidecarDir, `treq-${targetTriple}`);

  await stat(sourceBinaryPath);
  await mkdir(sidecarDir, { recursive: true });

  console.log(`[sidecar] source: ${sourceBinaryPath}`);
  console.log(`[sidecar] destination: ${destinationBinaryPath}`);

  await copyFile(sourceBinaryPath, destinationBinaryPath);
  await chmod(destinationBinaryPath, 0o755);

  console.log('[sidecar] copy complete');
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`[sidecar] failed: ${message}`);
  process.exit(1);
});
