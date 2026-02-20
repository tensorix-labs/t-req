import { describe, expect, it } from 'bun:test';
import {
  buildCreateFilePath,
  isCrossDirectoryMove,
  resolveSelectionAfterDeletedPath,
  runConfirmedDelete,
  runCreateFileMutation,
  runDeleteFileMutation,
  runRenameFileMutation,
  runSaveFileContentMutation,
  toCreateDirectory,
  toCreateHttpPath
} from './mutations';
import type { ExplorerFileDocument, ExplorerFlatNode } from './types';

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

function fileDocument(path: string, content: string): ExplorerFileDocument {
  return {
    path,
    content,
    lastModified: Date.now()
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

describe('isCrossDirectoryMove', () => {
  it('returns false when staying in the same directory', () => {
    expect(isCrossDirectoryMove('requests/a.http', 'requests/b.http')).toBe(false);
    expect(isCrossDirectoryMove('a.http', 'b.http')).toBe(false);
  });

  it('returns true when directory changes', () => {
    expect(isCrossDirectoryMove('requests/a.http', 'other/b.http')).toBe(true);
    expect(isCrossDirectoryMove('a.http', 'requests/b.http')).toBe(true);
  });
});

describe('toCreateDirectory', () => {
  it('returns undefined for empty directory input', () => {
    expect(toCreateDirectory('')).toEqual({
      ok: true,
      directory: undefined
    });
  });

  it('normalizes path separators and trims slashes', () => {
    expect(toCreateDirectory('/requests\\users/')).toEqual({
      ok: true,
      directory: 'requests/users'
    });
  });

  it('rejects directory traversal segments', () => {
    expect(toCreateDirectory('requests/../secret')).toEqual({
      ok: false,
      error: 'Directory cannot include "..".'
    });
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

describe('runSaveFileContentMutation', () => {
  it('saves content, updates selected file, and refetches workspace files', async () => {
    const calls: string[] = [];
    let selectedFile: ExplorerFileDocument | undefined;

    await runSaveFileContentMutation('a.http', 'GET https://api.example.com', {
      saveFile: async (path, content) => {
        calls.push(`save:${path}:${content}`);
        return fileDocument(path, content);
      },
      setSelectedFile: (file) => {
        selectedFile = file;
      },
      refetchWorkspaceFiles: async () => {
        calls.push('refetch');
      }
    });

    expect(calls).toEqual(['save:a.http:GET https://api.example.com', 'refetch']);
    expect(selectedFile).toEqual(expect.objectContaining({ path: 'a.http' }));
  });

  it('bubbles save failures and does not refetch', async () => {
    const calls: string[] = [];

    await expect(
      runSaveFileContentMutation('a.http', 'body', {
        saveFile: async () => {
          calls.push('save');
          throw new Error('save failed');
        },
        setSelectedFile: () => {
          calls.push('setSelectedFile');
        },
        refetchWorkspaceFiles: async () => {
          calls.push('refetch');
        }
      })
    ).rejects.toThrow('save failed');

    expect(calls).toEqual(['save']);
  });
});

describe('runRenameFileMutation', () => {
  it('renames the selected file and refetches workspace files', async () => {
    const calls: string[] = [];
    let selectedPath: string | undefined = 'requests/a.http';

    await runRenameFileMutation('requests/a.http', 'requests/b.http', {
      readFile: async (path) => {
        calls.push(`read:${path}`);
        return fileDocument(path, 'GET https://api.example.com');
      },
      createFile: async (path, content) => {
        calls.push(`create:${path}:${content}`);
      },
      deleteFile: async (path) => {
        calls.push(`delete:${path}`);
      },
      selectedPath: () => selectedPath,
      setSelectedPath: (path) => {
        selectedPath = path;
      },
      refetchWorkspaceFiles: async () => {
        calls.push('refetch');
      }
    });

    expect(calls).toEqual([
      'read:requests/a.http',
      'create:requests/b.http:GET https://api.example.com',
      'delete:requests/a.http',
      'refetch'
    ]);
    expect(selectedPath).toBe('requests/b.http');
  });

  it('does not update selection when another file is selected', async () => {
    let selectedPath: string | undefined = 'requests/z.http';

    await runRenameFileMutation('requests/a.http', 'requests/b.http', {
      readFile: async (path) => fileDocument(path, ''),
      createFile: async () => {},
      deleteFile: async () => {},
      selectedPath: () => selectedPath,
      setSelectedPath: (path) => {
        selectedPath = path;
      },
      refetchWorkspaceFiles: async () => {}
    });

    expect(selectedPath).toBe('requests/z.http');
  });

  it('is a no-op when source and destination are the same', async () => {
    const calls: string[] = [];

    await runRenameFileMutation('requests/a.http', 'requests/a.http', {
      readFile: async () => {
        calls.push('read');
        return fileDocument('requests/a.http', '');
      },
      createFile: async () => {
        calls.push('create');
      },
      deleteFile: async () => {
        calls.push('delete');
      },
      selectedPath: () => 'requests/a.http',
      setSelectedPath: () => {
        calls.push('setSelectedPath');
      },
      refetchWorkspaceFiles: async () => {
        calls.push('refetch');
      }
    });

    expect(calls).toEqual([]);
  });

  it('bubbles rename failures and does not refetch when create fails', async () => {
    const calls: string[] = [];

    await expect(
      runRenameFileMutation('requests/a.http', 'requests/b.http', {
        readFile: async (path) => {
          calls.push(`read:${path}`);
          return fileDocument(path, 'content');
        },
        createFile: async () => {
          calls.push('create');
          throw new Error('create failed');
        },
        deleteFile: async () => {
          calls.push('delete');
        },
        selectedPath: () => 'requests/a.http',
        setSelectedPath: () => {
          calls.push('setSelectedPath');
        },
        refetchWorkspaceFiles: async () => {
          calls.push('refetch');
        }
      })
    ).rejects.toThrow('create failed');

    expect(calls).toEqual(['read:requests/a.http', 'create']);
  });

  it('returns explicit destination conflict error when target already exists', async () => {
    await expect(
      runRenameFileMutation('requests/a.http', 'requests/b.http', {
        readFile: async (path) => fileDocument(path, 'content'),
        createFile: async () => {
          throw new Error('file already exists');
        },
        deleteFile: async () => {},
        selectedPath: () => 'requests/a.http',
        setSelectedPath: () => {},
        refetchWorkspaceFiles: async () => {}
      })
    ).rejects.toThrow('Destination already exists: "requests/b.http".');
  });

  it('rolls back created destination when deleting source fails', async () => {
    const calls: string[] = [];

    await expect(
      runRenameFileMutation('requests/a.http', 'requests/b.http', {
        readFile: async (path) => {
          calls.push(`read:${path}`);
          return fileDocument(path, 'content');
        },
        createFile: async (path) => {
          calls.push(`create:${path}`);
        },
        deleteFile: async (path) => {
          calls.push(`delete:${path}`);
          if (path === 'requests/a.http') {
            throw new Error('delete source failed');
          }
        },
        selectedPath: () => 'requests/a.http',
        setSelectedPath: () => {
          calls.push('setSelectedPath');
        },
        refetchWorkspaceFiles: async () => {
          calls.push('refetch');
        }
      })
    ).rejects.toThrow(
      'Rename failed while deleting "requests/a.http". The created file at "requests/b.http" was rolled back.'
    );

    expect(calls).toEqual([
      'read:requests/a.http',
      'create:requests/b.http',
      'delete:requests/a.http',
      'delete:requests/b.http'
    ]);
  });

  it('surfaces partial-apply error when source delete and rollback both fail', async () => {
    await expect(
      runRenameFileMutation('requests/a.http', 'requests/b.http', {
        readFile: async (path) => fileDocument(path, 'content'),
        createFile: async () => {},
        deleteFile: async () => {
          throw new Error('delete failed');
        },
        selectedPath: () => 'requests/a.http',
        setSelectedPath: () => {},
        refetchWorkspaceFiles: async () => {}
      })
    ).rejects.toThrow(
      'Rename partially applied. Created "requests/b.http" but failed deleting "requests/a.http", and rollback failed.'
    );
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
