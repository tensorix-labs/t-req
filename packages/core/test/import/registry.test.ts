import { describe, expect, test } from 'bun:test';
import { createImporterRegistry } from '../../src/import/registry.ts';
import type { Importer, ImportResult } from '../../src/import/types.ts';

function makeResult(name: string): ImportResult {
  return {
    name,
    files: [],
    variables: {},
    diagnostics: [],
    stats: {
      requestCount: 0,
      fileCount: 0,
      diagnosticCount: 0
    }
  };
}

function makeImporter(source: string): Importer {
  return {
    source,
    convert: (_input: string) => makeResult(source)
  };
}

describe('createImporterRegistry', () => {
  test('registers and retrieves importers by source', () => {
    const registry = createImporterRegistry();
    const postman = makeImporter('postman');

    registry.register(postman);

    expect(registry.get('postman')).toBe(postman);
    expect(registry.sources()).toEqual(['postman']);
  });

  test('normalizes source keys for get and register', () => {
    const registry = createImporterRegistry();
    const importer = makeImporter(' PostMan ');

    registry.register(importer);

    expect(registry.get('postman')).toBe(importer);
    expect(registry.get('POSTMAN')).toBe(importer);
    expect(registry.sources()).toEqual(['postman']);
  });

  test('throws for duplicate source registration', () => {
    const registry = createImporterRegistry();
    registry.register(makeImporter('postman'));

    expect(() => registry.register(makeImporter('POSTMAN'))).toThrow(
      'Importer already registered for source "postman"'
    );
  });

  test('throws for empty source registration', () => {
    const registry = createImporterRegistry();

    expect(() => registry.register(makeImporter('   '))).toThrow('Importer source cannot be empty');
  });

  test('returns undefined for unknown or blank source lookups', () => {
    const registry = createImporterRegistry();
    registry.register(makeImporter('postman'));

    expect(registry.get('openapi')).toBeUndefined();
    expect(registry.get('   ')).toBeUndefined();
  });
});
