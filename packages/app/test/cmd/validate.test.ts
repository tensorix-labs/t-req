import { describe, expect, test } from 'bun:test';
import { resolve } from 'node:path';
import {
  formatDiagnosticLine,
  formatSummary,
  validateBuilder,
  validateCommand
} from '../../src/cmd/validate';

const FIXTURES_DIR = resolve(import.meta.dir, '../fixtures/validate');

// ============================================================================
// Command Definition
// ============================================================================

describe('validate command definition', () => {
  test('command string matches expected pattern', () => {
    expect(validateCommand.command).toBe('validate <path>');
  });

  test('builder has path, json, and verbose options', () => {
    expect(validateBuilder.path.type).toBe('string');
    expect(validateBuilder.json.type).toBe('boolean');
    expect(validateBuilder.verbose.type).toBe('boolean');
  });
});

// ============================================================================
// Formatting Helpers
// ============================================================================

describe('formatDiagnosticLine', () => {
  test('formats error diagnostic without color', () => {
    const d = {
      severity: 'error' as const,
      code: 'missing-url',
      message: 'Missing URL after GET method',
      range: { start: { line: 2, column: 0 }, end: { line: 2, column: 3 } }
    };
    const line = formatDiagnosticLine(d, false);
    expect(line).toContain('3:1');
    expect(line).toContain('error');
    expect(line).toContain('missing-url');
    expect(line).toContain('Missing URL after GET method');
  });

  test('formats warning diagnostic without color', () => {
    const d = {
      severity: 'warning' as const,
      code: 'duplicate-header',
      message: "Duplicate header 'Accept'",
      range: { start: { line: 3, column: 0 }, end: { line: 3, column: 6 } }
    };
    const line = formatDiagnosticLine(d, false);
    expect(line).toContain('4:1');
    expect(line).toContain('warn');
    expect(line).toContain('duplicate-header');
  });
});

describe('formatSummary', () => {
  test('formats plural correctly', () => {
    const result = {
      files: [],
      summary: {
        filesScanned: 5,
        filesWithErrors: 2,
        filesWithWarnings: 1,
        totalErrors: 3,
        totalWarnings: 1,
        totalInfos: 0
      }
    };
    const s = formatSummary(result);
    expect(s).toContain('3 errors');
    expect(s).toContain('1 warning');
    expect(s).toContain('5 files scanned');
  });

  test('formats singular correctly', () => {
    const result = {
      files: [],
      summary: {
        filesScanned: 1,
        filesWithErrors: 1,
        filesWithWarnings: 0,
        totalErrors: 1,
        totalWarnings: 0,
        totalInfos: 0
      }
    };
    const s = formatSummary(result);
    expect(s).toContain('1 error,');
    expect(s).toContain('0 warnings');
    expect(s).toContain('1 file scanned');
  });
});

// ============================================================================
// Integration: CLI via subprocess
// ============================================================================

async function runValidateCli(
  ...args: string[]
): Promise<{ stdout: string; stderr: string; exitCode: number }> {
  const proc = Bun.spawn(
    ['bun', 'run', resolve(import.meta.dir, '../../src/index.ts'), 'validate', ...args],
    {
      stdout: 'pipe',
      stderr: 'pipe',
      env: { ...process.env, NO_COLOR: '1' }
    }
  );

  const [stdout, stderr] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text()
  ]);
  const exitCode = await proc.exited;

  return { stdout, stderr, exitCode };
}

describe('validate single file', () => {
  test('valid file produces zero diagnostics and exit code 0', async () => {
    const { stdout, stderr, exitCode } = await runValidateCli(resolve(FIXTURES_DIR, 'valid.http'));
    expect(exitCode).toBe(0);
    expect(stderr).toContain('0 errors');
    // No file output in non-verbose mode for clean files
    expect(stdout).toBe('');
  });

  test('file with errors produces diagnostics and exit code 1', async () => {
    const { stdout, stderr, exitCode } = await runValidateCli(resolve(FIXTURES_DIR, 'errors.http'));
    expect(exitCode).toBe(1);
    expect(stdout).toContain('missing-url');
    expect(stdout).toContain('unclosed-variable');
    expect(stderr).toContain('2 errors');
  });

  test('file with only warnings produces exit code 0', async () => {
    const { stdout, stderr, exitCode } = await runValidateCli(
      resolve(FIXTURES_DIR, 'warnings.http')
    );
    expect(exitCode).toBe(0);
    expect(stdout).toContain('duplicate-header');
    expect(stderr).toContain('0 errors');
    expect(stderr).toContain('1 warning');
  });
});

describe('validate directory', () => {
  test('discovers all .http files recursively', async () => {
    const { stderr, exitCode } = await runValidateCli(FIXTURES_DIR);
    // The directory has 3 fixture files
    expect(stderr).toContain('3 files scanned');
    // Has errors from errors.http
    expect(exitCode).toBe(1);
  });
});

describe('JSON output mode', () => {
  test('produces valid JSON with correct structure', async () => {
    const { stdout, exitCode } = await runValidateCli(
      resolve(FIXTURES_DIR, 'errors.http'),
      '--json'
    );
    expect(exitCode).toBe(1);

    const parsed = JSON.parse(stdout);
    expect(parsed).toHaveProperty('files');
    expect(parsed).toHaveProperty('summary');
    expect(Array.isArray(parsed.files)).toBe(true);
    expect(parsed.files.length).toBe(1);
    expect(parsed.files[0].diagnostics.length).toBe(2);
    expect(parsed.summary.totalErrors).toBe(2);
    expect(parsed.summary.filesScanned).toBe(1);
  });

  test('each diagnostic has severity, code, message, range', async () => {
    const { stdout } = await runValidateCli(resolve(FIXTURES_DIR, 'errors.http'), '--json');
    const parsed = JSON.parse(stdout);
    const d = parsed.files[0].diagnostics[0];
    expect(d).toHaveProperty('severity');
    expect(d).toHaveProperty('code');
    expect(d).toHaveProperty('message');
    expect(d).toHaveProperty('range');
    expect(d.range).toHaveProperty('start');
    expect(d.range).toHaveProperty('end');
  });
});

describe('verbose mode', () => {
  test('shows files with no issues', async () => {
    const { stdout, exitCode } = await runValidateCli(
      resolve(FIXTURES_DIR, 'valid.http'),
      '--verbose'
    );
    expect(exitCode).toBe(0);
    expect(stdout).toContain('valid.http');
    expect(stdout).toContain('No issues found');
  });
});

describe('error handling', () => {
  test('non-existent path errors gracefully', async () => {
    const { stderr, exitCode } = await runValidateCli('/tmp/does-not-exist-treq.http');
    expect(exitCode).toBe(1);
    expect(stderr).toContain('Path not found');
  });

  test('non-.http file errors gracefully', async () => {
    const { stderr, exitCode } = await runValidateCli(
      resolve(import.meta.dir, '../../package.json')
    );
    expect(exitCode).toBe(1);
    expect(stderr).toContain('Not an .http file');
  });
});
