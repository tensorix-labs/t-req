import { describe, expect, it } from 'bun:test';
import {
  buildCreateFilePath,
  resolveSelectionAfterDeletedPath,
  runConfirmedDelete,
  runCreateFileMutation,
  runDeleteFileMutation,
  toCreateHttpPath
} from './mutations';
import type { ExplorerFlatNode } from './types';

function file(path: string): ExplorerFlatNode {
  const name = path.includes('/') ? path.slice(path.lastIndexOf('/') + 1) : path;
  return {
    node: {
      name,
      path,
      isDir: false,
      depth: 0,
      requestCount: 0
    },
    isExpanded: false
  };
}

function directory(path: string): ExplorerFlatNode {
  const name = path.includes('/') ? path.slice(path.lastIndexOf('/') + 1) : path;
  return {
    node: {
      name,
      path,
      isDir: true,
      depth: 0,
      children: []
    },
    isExpanded: true
  };
}

describe('toCreateHttpPath', () => {
  it('normalizes a filename and appends .http when missing', () => {
    expect(toCreateHttpPath('  users  ')).toEqual({
      ok: true,
      path: 'users.http'
    });
  });

  it('keeps an explicit .http extension', () => {
    expect(toCreateHttpPath('users.http')).toEqual({
      ok: true,
      path: 'users.http'
    });
  });

  it('rejects invalid inputs', () => {
    expect(toCreateHttpPath('')).toEqual({
      ok: false,
      error: 'Filename is required.'
    });
    expect(toCreateHttpPath('a/b')).toEqual({
      ok: false,
      error: 'Filename cannot include path separators.'
    });
    expect(toCreateHttpPath('..')).toEqual({
      ok: false,
      error: 'Filename cannot include "..".'
    });
    expect(toCreateHttpPath('.http')).toEqual({
      ok: false,
      error: 'Filename cannot be only an extension.'
    });
  });
});

describe('buildCreateFilePath', () => {
  it('joins directory and filename', () => {
    expect(buildCreateFilePath('new.http', 'requests/api')).toBe('requests/api/new.http');
  });

  it('uses filename directly for workspace root', () => {
    expect(buildCreateFilePath('new.http')).toBe('new.http');
  });
});

describe('resolveSelectionAfterDeletedPath', () => {
  it('prefers the next visible file', () => {
    const visible = [directory('requests'), file('a.http'), file('b.http')];
    expect(resolveSelectionAfterDeletedPath(visible, 'a.http')).toBe('b.http');
  });

  it('falls back to previous visible file', () => {
    const visible = [file('a.http'), file('b.http')];
    expect(resolveSelectionAfterDeletedPath(visible, 'b.http')).toBe('a.http');
  });

  it('returns undefined when no fallback file exists', () => {
    expect(resolveSelectionAfterDeletedPath([file('a.http')], 'a.http')).toBeUndefined();
  });
});

describe('runCreateFileMutation', () => {
  it('creates, refetches, and selects created path', async () => {
    const calls: string[] = [];
    let selectedPath: string | undefined;

    await runCreateFileMutation('new.http', {
      createFile: async (path) => {
        calls.push(`create:${path}`);
      },
      refetch: async () => {
        calls.push('refetch');
      },
      setSelectedPath: (path) => {
        selectedPath = path;
      }
    });

    expect(calls).toEqual(['create:new.http', 'refetch']);
    expect(selectedPath).toBe('new.http');
  });

  it('bubbles create failures and does not refetch', async () => {
    const calls: string[] = [];

    await expect(
      runCreateFileMutation('new.http', {
        createFile: async () => {
          calls.push('create');
          throw new Error('boom');
        },
        refetch: async () => {
          calls.push('refetch');
        },
        setSelectedPath: () => {}
      })
    ).rejects.toThrow('boom');

    expect(calls).toEqual(['create']);
  });
});

describe('runDeleteFileMutation', () => {
  it('deletes, selects next fallback file, and refetches', async () => {
    const calls: string[] = [];
    let selectedPath: string | undefined = 'a.http';

    await runDeleteFileMutation('a.http', {
      deleteFile: async (path) => {
        calls.push(`delete:${path}`);
      },
      refetch: async () => {
        calls.push('refetch');
      },
      selectedPath: () => selectedPath,
      setSelectedPath: (path) => {
        selectedPath = path;
      },
      flattenedVisible: () => [file('a.http'), file('b.http')]
    });

    expect(calls).toEqual(['delete:a.http', 'refetch']);
    expect(selectedPath).toBe('b.http');
  });

  it('bubbles delete failures and does not refetch', async () => {
    const calls: string[] = [];
    let selectedPath: string | undefined = 'a.http';

    await expect(
      runDeleteFileMutation('a.http', {
        deleteFile: async () => {
          calls.push('delete');
          throw new Error('nope');
        },
        refetch: async () => {
          calls.push('refetch');
        },
        selectedPath: () => selectedPath,
        setSelectedPath: (path) => {
          selectedPath = path;
        },
        flattenedVisible: () => [file('a.http'), file('b.http')]
      })
    ).rejects.toThrow('nope');

    expect(calls).toEqual(['delete']);
    expect(selectedPath).toBe('a.http');
  });
});

describe('runConfirmedDelete', () => {
  it('does not mutate when confirmation is rejected', async () => {
    const calls: string[] = [];

    const didDelete = await runConfirmedDelete(
      'a.http',
      () => false,
      async (path) => {
        calls.push(path);
      }
    );

    expect(didDelete).toBe(false);
    expect(calls).toEqual([]);
  });

  it('deletes when confirmation is accepted', async () => {
    const calls: string[] = [];

    const didDelete = await runConfirmedDelete(
      'a.http',
      () => true,
      async (path) => {
        calls.push(path);
      }
    );

    expect(didDelete).toBe(true);
    expect(calls).toEqual(['a.http']);
  });
});
