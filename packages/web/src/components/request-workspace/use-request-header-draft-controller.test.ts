import { describe, expect, test } from 'bun:test';
import { createRoot, createSignal } from 'solid-js';
import type { WorkspaceRequest } from '../../sdk';
import { useRequestHeaderDraftController } from './use-request-header-draft-controller';

describe('useRequestHeaderDraftController', () => {
  test('tracks header row mutations and dirty state', () => {
    createRoot((dispose) => {
      const [path] = createSignal('requests.http');
      const [selectedRequest] = createSignal<WorkspaceRequest | undefined>({
        index: 0,
        method: 'GET',
        url: 'https://api.example.com/users'
      });
      const [sourceHeaders] = createSignal([
        { key: 'Accept', value: 'application/json' },
        { key: 'X-Trace-Id', value: 'trace-1' }
      ]);
      const [fileContent] = createSignal(
        [
          'GET https://api.example.com/users',
          'Accept: application/json',
          'X-Trace-Id: trace-1'
        ].join('\n')
      );

      const controller = useRequestHeaderDraftController({
        path,
        selectedRequest,
        sourceHeaders,
        sourceUrl: () => selectedRequest()?.url,
        getFileContent: fileContent,
        setFileContent: () => {},
        saveFile: async () => {},
        reloadRequests: async () => {},
        refetchRequestDetails: async () => {}
      });

      expect(controller.isDirty()).toBe(false);
      expect(controller.draftHeaders()).toEqual(sourceHeaders());

      controller.onHeaderChange(0, 'value', 'text/plain');
      expect(controller.isDirty()).toBe(true);
      expect(controller.draftHeaders()[0]?.value).toBe('text/plain');

      controller.onAddHeader();
      expect(controller.draftHeaders()).toHaveLength(3);

      controller.onRemoveHeader(1);
      expect(controller.draftHeaders()).toEqual([
        { key: 'Accept', value: 'text/plain' },
        { key: '', value: '' }
      ]);

      controller.onDiscard();
      expect(controller.isDirty()).toBe(false);
      expect(controller.draftHeaders()).toEqual(sourceHeaders());

      dispose();
    });
  });

  test('applies header edits through save flow and refetches parse details', async () => {
    const setFileContentCalls: string[] = [];
    const saveCalls: string[] = [];
    const reloadCalls: string[] = [];
    let refetchCalls = 0;

    await createRoot(async (dispose) => {
      const [path] = createSignal('requests.http');
      const [selectedRequest] = createSignal<WorkspaceRequest | undefined>({
        index: 0,
        method: 'GET',
        url: 'https://api.example.com/users'
      });
      const [sourceHeaders] = createSignal([{ key: 'Accept', value: 'application/json' }]);
      const [fileContent, setFileContentSignal] = createSignal(
        ['GET https://api.example.com/users', 'Accept: application/json', '', '{"ok":true}'].join(
          '\n'
        )
      );

      const controller = useRequestHeaderDraftController({
        path,
        selectedRequest,
        sourceHeaders,
        sourceUrl: () => selectedRequest()?.url,
        getFileContent: fileContent,
        setFileContent: (content) => {
          setFileContentCalls.push(content);
          setFileContentSignal(content);
        },
        saveFile: async (nextPath) => {
          saveCalls.push(nextPath);
        },
        reloadRequests: async (nextPath) => {
          reloadCalls.push(nextPath);
        },
        refetchRequestDetails: async () => {
          refetchCalls += 1;
        }
      });

      controller.onHeaderChange(0, 'value', 'text/plain');
      controller.onAddHeader();
      controller.onHeaderChange(1, 'key', 'X-Debug');
      controller.onHeaderChange(1, 'value', '1');
      await controller.onSave();

      expect(controller.saveError()).toBeUndefined();
      expect(controller.isDirty()).toBe(false);
      expect(controller.isSaving()).toBe(false);
      expect(saveCalls).toEqual(['requests.http']);
      expect(reloadCalls).toEqual(['requests.http']);
      expect(refetchCalls).toBe(1);
      expect(setFileContentCalls).toHaveLength(1);
      expect(setFileContentCalls[0]).toContain('Accept: text/plain');
      expect(setFileContentCalls[0]).toContain('X-Debug: 1');

      dispose();
    });
  });

  test('clears dirty state after successful disk save even when reload fails', async () => {
    const saveCalls: string[] = [];
    const reloadCalls: string[] = [];
    let refetchCalls = 0;

    await createRoot(async (dispose) => {
      const [path] = createSignal('requests.http');
      const [selectedRequest] = createSignal<WorkspaceRequest | undefined>({
        index: 0,
        method: 'GET',
        url: 'https://api.example.com/users'
      });
      const [sourceHeaders] = createSignal([{ key: 'Accept', value: 'application/json' }]);
      const [fileContent, setFileContentSignal] = createSignal(
        ['GET https://api.example.com/users', 'Accept: application/json', '', '{"ok":true}'].join(
          '\n'
        )
      );

      const controller = useRequestHeaderDraftController({
        path,
        selectedRequest,
        sourceHeaders,
        sourceUrl: () => selectedRequest()?.url,
        getFileContent: fileContent,
        setFileContent: (content) => {
          setFileContentSignal(content);
        },
        saveFile: async (nextPath) => {
          saveCalls.push(nextPath);
        },
        reloadRequests: async (nextPath) => {
          reloadCalls.push(nextPath);
          throw new Error('reload failed');
        },
        refetchRequestDetails: async () => {
          refetchCalls += 1;
        }
      });

      controller.onHeaderChange(0, 'value', 'text/plain');
      expect(controller.isDirty()).toBe(true);

      await controller.onSave();

      expect(controller.isDirty()).toBe(false);
      expect(controller.isSaving()).toBe(false);
      expect(controller.saveError()).toBe('reload failed');
      expect(saveCalls).toEqual(['requests.http']);
      expect(reloadCalls).toEqual(['requests.http']);
      expect(refetchCalls).toBe(0);

      dispose();
    });
  });

  test('ignores additional save requests while one save is in flight', async () => {
    const saveCalls: string[] = [];
    let resolveSave: (() => void) | undefined;

    await createRoot(async (dispose) => {
      const [path] = createSignal('requests.http');
      const [selectedRequest] = createSignal<WorkspaceRequest | undefined>({
        index: 0,
        method: 'GET',
        url: 'https://api.example.com/users'
      });
      const [sourceHeaders] = createSignal([{ key: 'Accept', value: 'application/json' }]);
      const [fileContent, setFileContentSignal] = createSignal(
        ['GET https://api.example.com/users', 'Accept: application/json', '', '{"ok":true}'].join(
          '\n'
        )
      );

      const controller = useRequestHeaderDraftController({
        path,
        selectedRequest,
        sourceHeaders,
        sourceUrl: () => selectedRequest()?.url,
        getFileContent: fileContent,
        setFileContent: (content) => {
          setFileContentSignal(content);
        },
        saveFile: async (nextPath) => {
          saveCalls.push(nextPath);
          await new Promise<void>((resolve) => {
            resolveSave = resolve;
          });
        },
        reloadRequests: async () => {},
        refetchRequestDetails: async () => {}
      });

      controller.onHeaderChange(0, 'value', 'text/plain');

      const firstSave = controller.onSave();
      const secondSave = controller.onSave();

      expect(controller.isSaving()).toBe(true);
      expect(saveCalls).toEqual(['requests.http']);

      resolveSave?.();
      await firstSave;
      await secondSave;

      expect(controller.isSaving()).toBe(false);
      expect(saveCalls).toEqual(['requests.http']);

      dispose();
    });
  });
});
