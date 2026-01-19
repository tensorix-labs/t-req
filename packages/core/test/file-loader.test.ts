import { describe, expect, test } from 'bun:test';
import * as path from 'node:path';
import {
  inferMimeType,
  isBinaryMimeType,
  loadFileBody,
  validateFilePath
} from '../src/file-loader.ts';

const fixturesDir = path.join(import.meta.dir, 'fixtures');

// ============================================================================
// inferMimeType Tests
// ============================================================================

describe('inferMimeType', () => {
  describe('text types', () => {
    test('detects JSON', () => {
      expect(inferMimeType('./data.json')).toBe('application/json');
      expect(inferMimeType('path/to/file.json')).toBe('application/json');
    });

    test('detects XML', () => {
      expect(inferMimeType('./config.xml')).toBe('application/xml');
    });

    test('detects plain text', () => {
      expect(inferMimeType('./readme.txt')).toBe('text/plain');
    });

    test('detects HTML', () => {
      expect(inferMimeType('./index.html')).toBe('text/html');
      expect(inferMimeType('./page.htm')).toBe('text/html');
    });

    test('detects CSS', () => {
      expect(inferMimeType('./styles.css')).toBe('text/css');
    });

    test('detects JavaScript', () => {
      expect(inferMimeType('./app.js')).toBe('application/javascript');
      expect(inferMimeType('./module.mjs')).toBe('application/javascript');
    });

    test('detects TypeScript', () => {
      expect(inferMimeType('./app.ts')).toBe('application/typescript');
    });

    test('detects CSV', () => {
      expect(inferMimeType('./data.csv')).toBe('text/csv');
    });

    test('detects Markdown', () => {
      expect(inferMimeType('./readme.md')).toBe('text/markdown');
    });

    test('detects YAML', () => {
      expect(inferMimeType('./config.yaml')).toBe('text/yaml');
      expect(inferMimeType('./config.yml')).toBe('text/yaml');
    });

    test('detects SVG', () => {
      expect(inferMimeType('./logo.svg')).toBe('image/svg+xml');
    });
  });

  describe('binary image types', () => {
    test('detects JPEG', () => {
      expect(inferMimeType('./photo.jpg')).toBe('image/jpeg');
      expect(inferMimeType('./photo.jpeg')).toBe('image/jpeg');
    });

    test('detects PNG', () => {
      expect(inferMimeType('./logo.png')).toBe('image/png');
    });

    test('detects GIF', () => {
      expect(inferMimeType('./animation.gif')).toBe('image/gif');
    });

    test('detects WebP', () => {
      expect(inferMimeType('./image.webp')).toBe('image/webp');
    });
  });

  describe('binary document types', () => {
    test('detects PDF', () => {
      expect(inferMimeType('./document.pdf')).toBe('application/pdf');
    });

    test('detects Word documents', () => {
      expect(inferMimeType('./doc.doc')).toBe('application/msword');
      expect(inferMimeType('./doc.docx')).toBe(
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
      );
    });

    test('detects Excel spreadsheets', () => {
      expect(inferMimeType('./data.xls')).toBe('application/vnd.ms-excel');
      expect(inferMimeType('./data.xlsx')).toBe(
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
      );
    });
  });

  describe('binary archive types', () => {
    test('detects ZIP', () => {
      expect(inferMimeType('./archive.zip')).toBe('application/zip');
    });

    test('detects gzip', () => {
      expect(inferMimeType('./file.gz')).toBe('application/gzip');
    });

    test('detects tar', () => {
      expect(inferMimeType('./archive.tar')).toBe('application/x-tar');
    });
  });

  describe('unknown extensions', () => {
    test('returns octet-stream for unknown extension', () => {
      expect(inferMimeType('./file.unknown')).toBe('application/octet-stream');
    });

    test('returns octet-stream for no extension', () => {
      expect(inferMimeType('./Makefile')).toBe('application/octet-stream');
    });
  });

  describe('case insensitivity', () => {
    test('handles uppercase extensions', () => {
      expect(inferMimeType('./FILE.JSON')).toBe('application/json');
      expect(inferMimeType('./IMAGE.PNG')).toBe('image/png');
    });

    test('handles mixed case extensions', () => {
      expect(inferMimeType('./data.Json')).toBe('application/json');
    });
  });
});

// ============================================================================
// isBinaryMimeType Tests
// ============================================================================

describe('isBinaryMimeType', () => {
  describe('text types return false', () => {
    test('text/* types are not binary', () => {
      expect(isBinaryMimeType('text/plain')).toBe(false);
      expect(isBinaryMimeType('text/html')).toBe(false);
      expect(isBinaryMimeType('text/css')).toBe(false);
      expect(isBinaryMimeType('text/csv')).toBe(false);
      expect(isBinaryMimeType('text/markdown')).toBe(false);
      expect(isBinaryMimeType('text/yaml')).toBe(false);
    });

    test('application text types are not binary', () => {
      expect(isBinaryMimeType('application/json')).toBe(false);
      expect(isBinaryMimeType('application/xml')).toBe(false);
      expect(isBinaryMimeType('application/javascript')).toBe(false);
      expect(isBinaryMimeType('application/typescript')).toBe(false);
    });

    test('SVG is not binary', () => {
      expect(isBinaryMimeType('image/svg+xml')).toBe(false);
    });
  });

  describe('binary types return true', () => {
    test('image types are binary', () => {
      expect(isBinaryMimeType('image/png')).toBe(true);
      expect(isBinaryMimeType('image/jpeg')).toBe(true);
      expect(isBinaryMimeType('image/gif')).toBe(true);
      expect(isBinaryMimeType('image/webp')).toBe(true);
    });

    test('application binary types are binary', () => {
      expect(isBinaryMimeType('application/pdf')).toBe(true);
      expect(isBinaryMimeType('application/zip')).toBe(true);
      expect(isBinaryMimeType('application/octet-stream')).toBe(true);
    });

    test('audio types are binary', () => {
      expect(isBinaryMimeType('audio/mpeg')).toBe(true);
      expect(isBinaryMimeType('audio/wav')).toBe(true);
    });

    test('video types are binary', () => {
      expect(isBinaryMimeType('video/mp4')).toBe(true);
      expect(isBinaryMimeType('video/webm')).toBe(true);
    });
  });
});

// ============================================================================
// validateFilePath Tests
// ============================================================================

describe('validateFilePath', () => {
  describe('valid paths', () => {
    test('allows simple relative path', () => {
      const result = validateFilePath('./data.json', '/app');
      expect(result).toBe('/app/data.json');
    });

    test('allows relative path without dot prefix', () => {
      const result = validateFilePath('data.json', '/app');
      expect(result).toBe('/app/data.json');
    });

    test('allows nested relative path', () => {
      const result = validateFilePath('./fixtures/payload.json', '/app');
      expect(result).toBe('/app/fixtures/payload.json');
    });

    test('allows path that resolves within base', () => {
      const result = validateFilePath('./nested/../other/file.txt', '/app');
      expect(result).toBe('/app/other/file.txt');
    });

    test('allows path to base directory itself', () => {
      const result = validateFilePath('.', '/app');
      expect(result).toBe('/app');
    });
  });

  describe('path traversal rejection', () => {
    test('rejects simple parent traversal', () => {
      expect(() => validateFilePath('../secret.txt', '/app')).toThrow(
        'Path escapes base directory: ../secret.txt'
      );
    });

    test('rejects deep parent traversal', () => {
      expect(() => validateFilePath('../../../etc/passwd', '/app')).toThrow(
        'Path escapes base directory: ../../../etc/passwd'
      );
    });

    test('rejects traversal hidden in middle of path', () => {
      expect(() => validateFilePath('./data/../../etc/passwd', '/app')).toThrow(
        'Path escapes base directory: ./data/../../etc/passwd'
      );
    });
  });

  describe('absolute path rejection', () => {
    test('rejects absolute unix path', () => {
      expect(() => validateFilePath('/etc/passwd', '/app')).toThrow(
        'Absolute paths not allowed: /etc/passwd'
      );
    });

    test('rejects absolute path to valid location', () => {
      expect(() => validateFilePath('/app/data.json', '/app')).toThrow(
        'Absolute paths not allowed: /app/data.json'
      );
    });
  });
});

// ============================================================================
// loadFileBody Tests
// ============================================================================

describe('loadFileBody', () => {
  describe('text files', () => {
    test('loads JSON file as text', async () => {
      const result = await loadFileBody('./payload.json', { basePath: fixturesDir });

      expect(result.isBinary).toBe(false);
      expect(result.mimeType).toBe('application/json');
      expect(typeof result.content).toBe('string');
      expect(result.content).toContain('"name"');
      expect(result.content).toContain('Test User');
    });

    test('loads text file as text', async () => {
      const result = await loadFileBody('./sample.txt', { basePath: fixturesDir });

      expect(result.isBinary).toBe(false);
      expect(result.mimeType).toBe('text/plain');
      expect(typeof result.content).toBe('string');
      expect(result.content).toContain('sample text file');
    });
  });

  describe('binary files', () => {
    test('loads PNG file as binary', async () => {
      const result = await loadFileBody('./test.png', { basePath: fixturesDir });

      expect(result.isBinary).toBe(true);
      expect(result.mimeType).toBe('image/png');
      expect(result.content).toBeInstanceOf(ArrayBuffer);
      expect((result.content as ArrayBuffer).byteLength).toBeGreaterThan(0);
    });
  });

  describe('error handling', () => {
    test('throws on file not found', async () => {
      await expect(loadFileBody('./nonexistent.json', { basePath: fixturesDir })).rejects.toThrow(
        'File not found: ./nonexistent.json'
      );
    });

    test('throws on path traversal', async () => {
      await expect(loadFileBody('../../../etc/passwd', { basePath: fixturesDir })).rejects.toThrow(
        'Path escapes base directory'
      );
    });

    test('throws on absolute path', async () => {
      await expect(loadFileBody('/etc/passwd', { basePath: fixturesDir })).rejects.toThrow(
        'Absolute paths not allowed'
      );
    });
  });

  describe('default basePath', () => {
    test('uses process.cwd() when basePath not provided', async () => {
      // This test verifies that the default basePath works
      // We use a relative path from the project root
      const result = await loadFileBody('./test/fixtures/payload.json');

      expect(result.isBinary).toBe(false);
      expect(result.mimeType).toBe('application/json');
      expect(result.content).toContain('Test User');
    });
  });
});
