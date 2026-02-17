#!/usr/bin/env bun

import { chmod, copyFile, mkdir, readdir, stat } from 'node:fs/promises';
import * as path from 'node:path';

const desktopDir = path.resolve(import.meta.dirname, '..');
const appDir = path.resolve(desktopDir, '../app');
const coreDir = path.resolve(desktopDir, '../core');
const sdkDir = path.resolve(desktopDir, '../sdk/js');
const appOpenApiPath = path.resolve(desktopDir, '../app/openapi.json');
const sidecarDir = path.join(desktopDir, 'src-tauri', 'sidecars');

// Intentionally macOS-only for this phase. Add Linux/Windows mappings in a later phase.
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

async function ensureWorkspacePackageBuilt(
  packageName: string,
  packageDir: string,
  requiredFiles: string[],
  sourceInputs: string[]
): Promise<void> {
  async function readLatestMtimeMs(targetPath: string): Promise<number> {
    const targetStat = await stat(targetPath);
    let latest = targetStat.mtimeMs;

    if (!targetStat.isDirectory()) {
      return latest;
    }

    const children = await readdir(targetPath, { withFileTypes: true });
    for (const child of children) {
      if (child.name === 'node_modules' || child.name === 'dist' || child.name === '.git') {
        continue;
      }

      const childPath = path.join(targetPath, child.name);
      const childLatest = await readLatestMtimeMs(childPath);
      if (childLatest > latest) {
        latest = childLatest;
      }
    }

    return latest;
  }

  const requiredFileStats = await Promise.all(
    requiredFiles.map(async (relativeFile) => {
      const absoluteFile = path.join(packageDir, relativeFile);
      try {
        const fileStat = await stat(absoluteFile);
        return {
          path: relativeFile,
          exists: true,
          mtimeMs: fileStat.mtimeMs
        };
      } catch {
        return {
          path: relativeFile,
          exists: false,
          mtimeMs: 0
        };
      }
    })
  );

  const missingFiles = requiredFileStats.filter((item) => !item.exists).map((item) => item.path);

  let shouldBuild = missingFiles.length > 0;
  let reason = '';

  if (shouldBuild) {
    reason = `missing build outputs (${missingFiles.join(', ')})`;
  } else {
    const outputOldestMtime = Math.min(...requiredFileStats.map((item) => item.mtimeMs));
    const sourceLatestMtime = Math.max(
      ...(await Promise.all(
        sourceInputs.map(async (input) => {
          const absolutePath = path.isAbsolute(input) ? input : path.join(packageDir, input);
          try {
            return await readLatestMtimeMs(absolutePath);
          } catch {
            return 0;
          }
        })
      ))
    );

    if (sourceLatestMtime > outputOldestMtime) {
      shouldBuild = true;
      reason = 'source inputs are newer than build outputs';
    }
  }

  if (!shouldBuild) {
    return;
  }

  console.log(`[sidecar] rebuilding ${packageName}: ${reason}`);
  const buildProcess = Bun.spawn(['bun', 'run', 'build'], {
    cwd: packageDir,
    stdout: 'inherit',
    stderr: 'inherit'
  });
  const exitCode = await buildProcess.exited;
  if (exitCode !== 0) {
    throw new Error(`failed building ${packageName}: bun run build exited with code ${exitCode}`);
  }
}

async function main(): Promise<void> {
  await ensureWorkspacePackageBuilt(
    '@t-req/core',
    coreDir,
    ['dist/index.js', 'dist/config/index.js'],
    ['src', 'package.json', 'tsconfig.build.json']
  );
  await ensureWorkspacePackageBuilt(
    '@t-req/sdk',
    sdkDir,
    ['dist/index.js', 'dist/client.js'],
    ['src', 'script', 'package.json', appOpenApiPath]
  );

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
