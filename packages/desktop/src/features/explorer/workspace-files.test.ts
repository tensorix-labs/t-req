import { describe, expect, it } from 'bun:test';
import { toExplorerFiles } from './workspace-files';

describe('toExplorerFiles', () => {
  it('keeps only .http files from workspace discovery', () => {
    const files = [
      { path: 'requests/list.http', requestCount: 2 },
      { path: 'scripts/setup.ts', requestCount: 0 },
      { path: 'tests/request.test.ts', requestCount: 0 },
      { path: 'README.md', requestCount: 0 },
      { path: 'nested/upper.HTTP', requestCount: 1 }
    ];

    expect(toExplorerFiles(files)).toEqual([
      { path: 'requests/list.http', requestCount: 2 },
      { path: 'nested/upper.HTTP', requestCount: 1 }
    ]);
  });
});
