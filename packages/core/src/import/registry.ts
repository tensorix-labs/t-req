import type { Importer, ImporterRegistry } from './types';

function normalizeSource(source: string): string {
  return source.trim().toLowerCase();
}

export function createImporterRegistry(): ImporterRegistry {
  const importers = new Map<string, Importer>();

  return {
    register(importer: Importer): void {
      const source = normalizeSource(importer.source);
      if (!source) {
        throw new Error('Importer source cannot be empty');
      }
      if (importers.has(source)) {
        throw new Error(`Importer already registered for source "${source}"`);
      }

      importers.set(source, importer);
    },
    get(source: string): Importer | undefined {
      const normalized = normalizeSource(source);
      if (!normalized) {
        return undefined;
      }
      return importers.get(normalized);
    },
    sources(): string[] {
      return Array.from(importers.keys());
    }
  };
}
