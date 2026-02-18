import { describe, expect, it } from 'bun:test';
import {
  buildExplorerTree,
  createInitialExpandedDirs,
  flattenExplorerTree,
  hasExplorerPath,
  pruneExpandedDirs
} from './tree';

describe('buildExplorerTree', () => {
  it('builds a hierarchical tree and sorts directories before files', () => {
    const tree = buildExplorerTree([
      { path: 'zeta.http', requestCount: 2 },
      { path: 'src/Beta.http', requestCount: 1 },
      { path: 'src/alpha.http', requestCount: 3 },
      { path: 'scripts/run.ts', requestCount: 0 },
      { path: 'docs/Guide.http', requestCount: 1 }
    ]);

    expect(tree.map((node) => node.path)).toEqual(['docs', 'scripts', 'src', 'zeta.http']);

    const srcNode = tree.find((node) => node.path === 'src');
    expect(srcNode?.children?.map((node) => node.path)).toEqual([
      'src/alpha.http',
      'src/Beta.http'
    ]);
  });
});

describe('flattenExplorerTree', () => {
  const tree = buildExplorerTree([
    { path: 'src/index.http', requestCount: 1 },
    { path: 'src/nested/detail.http', requestCount: 1 },
    { path: 'README.md' }
  ]);

  it('flattens only root nodes when no directories are expanded', () => {
    const flattened = flattenExplorerTree(tree, {});
    expect(flattened.map((item) => item.node.path)).toEqual(['src', 'README.md']);
  });

  it('includes nested nodes for expanded directories', () => {
    const flattened = flattenExplorerTree(tree, {
      src: true,
      'src/nested': true
    });

    expect(flattened.map((item) => item.node.path)).toEqual([
      'src',
      'src/nested',
      'src/nested/detail.http',
      'src/index.http',
      'README.md'
    ]);
  });
});

describe('directory expansion helpers', () => {
  it('expands only first-level directories by default', () => {
    const tree = buildExplorerTree([
      { path: 'src/http/main.http' },
      { path: 'tests/unit/sample.http' },
      { path: 'README.md' }
    ]);

    expect(createInitialExpandedDirs(tree)).toEqual({
      src: true,
      tests: true
    });
  });

  it('keeps only valid expanded directory paths', () => {
    const tree = buildExplorerTree([{ path: 'src/index.http' }]);

    const pruned = pruneExpandedDirs(
      {
        src: true,
        'src/index.http': true,
        unknown: true
      },
      tree
    );

    expect(pruned).toEqual({
      src: true
    });
  });

  it('checks if a path exists in the tree', () => {
    const tree = buildExplorerTree([{ path: 'src/index.http' }]);

    expect(hasExplorerPath(tree, 'src/index.http')).toBe(true);
    expect(hasExplorerPath(tree, 'src/missing.http')).toBe(false);
  });
});
