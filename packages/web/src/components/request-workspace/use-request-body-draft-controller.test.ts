import { describe, expect, test } from 'bun:test';
import { createRoot, createSignal } from 'solid-js';
import type { WorkspaceRequest } from '../../sdk';
import type { ParseDiagnostic, RequestBodySummary } from '../../utils/request-details';
import { useRequestBodyDraftController } from './use-request-body-draft-controller';

function createInlineJsonSummary(content: string, bodyText: string): RequestBodySummary {
  const requestLineEnd = content.indexOf('\n');
  const bodyStart = content.indexOf(bodyText);
  const bodyEnd = bodyStart + bodyText.length;

  return {
    kind: 'inline',
    hasBody: true,
    hasFormData: false,
    hasBodyFile: false,
    description: 'Request includes an inline body payload.',
    text: bodyText,
    isJsonLike: true,
    spans: {
      block: {
        startOffset: 0,
        endOffset: content.length
      },
      requestLine: {
        startOffset: 0,
        endOffset: requestLineEnd
      },
      url: {
        startOffset: 4,
        endOffset: requestLineEnd
      },
      body: {
        startOffset: bodyStart,
        endOffset: bodyEnd
      }
    }
  };
}

function createFormDataSummary(content: string, bodyText: string): RequestBodySummary {
  const requestLineEnd = content.indexOf('\n');
  const bodyStart = content.indexOf(bodyText);
  const bodyEnd = bodyStart + bodyText.length;

  return {
    kind: 'form-data',
    hasBody: true,
    hasFormData: true,
    hasBodyFile: false,
    description: 'Request includes form data fields.',
    fields: [
      { name: 'title', value: 'old', isFile: false },
      { name: 'document', value: '', isFile: true, path: './old.pdf' }
    ],
    spans: {
      block: {
        startOffset: 0,
        endOffset: content.length
      },
      requestLine: {
        startOffset: 0,
        endOffset: requestLineEnd
      },
      url: {
        startOffset: 5,
        endOffset: requestLineEnd
      },
      body: {
        startOffset: bodyStart,
        endOffset: bodyEnd
      }
    }
  };
}

function createFileBodySummary(content: string, bodyText: string): RequestBodySummary {
  const requestLineEnd = content.indexOf('\n');
  const bodyStart = content.indexOf(bodyText);
  const bodyEnd = bodyStart + bodyText.length;

  return {
    kind: 'file',
    hasBody: true,
    hasFormData: false,
    hasBodyFile: true,
    description: 'Request body is loaded from a file reference.',
    filePath: './old.json',
    spans: {
      block: {
        startOffset: 0,
        endOffset: content.length
      },
      requestLine: {
        startOffset: 0,
        endOffset: requestLineEnd
      },
      url: {
        startOffset: 5,
        endOffset: requestLineEnd
      },
      body: {
        startOffset: bodyStart,
        endOffset: bodyEnd
      }
    }
  };
}

describe('useRequestBodyDraftController', () => {
  test('tracks body edits, formatting, and dirty state', () => {
    createRoot((dispose) => {
      const initialContent = [
        'POST https://api.example.com/users',
        'Content-Type: application/json',
        '',
        '{"name":"old"}'
      ].join('\n');
      const [path] = createSignal('requests.http');
      const [selectedRequest] = createSignal<WorkspaceRequest | undefined>({
        index: 0,
        method: 'POST',
        url: 'https://api.example.com/users'
      });
      const [sourceBody] = createSignal<RequestBodySummary>(
        createInlineJsonSummary(initialContent, '{"name":"old"}')
      );
      const [requestDiagnostics] = createSignal<ParseDiagnostic[]>([]);
      const [fileContent] = createSignal(initialContent);

      const controller = useRequestBodyDraftController({
        path,
        selectedRequest,
        sourceBody,
        requestDiagnostics,
        getFileContent: fileContent,
        setFileContent: () => {},
        saveFile: async () => {},
        reloadRequests: async () => {},
        refetchRequestDetails: async () => {}
      });

      expect(controller.isDirty()).toBe(false);
      expect(controller.validationError()).toBeUndefined();
      expect(controller.draftBody()).toBe('{"name":"old"}');

      controller.onBodyChange('{ invalid-json }');
      expect(controller.isDirty()).toBe(true);
      expect(controller.validationError()).toBeDefined();

      controller.onBodyChange('{"name":"new","id":1}');
      controller.onBodyPrettify();
      expect(controller.validationError()).toBeUndefined();
      expect(controller.draftBody()).toContain('\n');

      controller.onBodyMinify();
      expect(controller.draftBody()).toBe('{"name":"new","id":1}');

      controller.onDiscard();
      expect(controller.isDirty()).toBe(false);
      expect(controller.draftBody()).toBe('{"name":"old"}');

      dispose();
    });
  });

  test('saves valid inline json body and refetches details', async () => {
    const setFileContentCalls: string[] = [];
    const saveCalls: string[] = [];
    const reloadCalls: string[] = [];
    let refetchCalls = 0;

    await createRoot(async (dispose) => {
      const initialContent = [
        'POST https://api.example.com/users',
        'Content-Type: application/json',
        '',
        '{"name":"old"}'
      ].join('\n');
      const [path] = createSignal('requests.http');
      const [selectedRequest] = createSignal<WorkspaceRequest | undefined>({
        index: 0,
        method: 'POST',
        url: 'https://api.example.com/users'
      });
      const [sourceBody] = createSignal<RequestBodySummary>(
        createInlineJsonSummary(initialContent, '{"name":"old"}')
      );
      const [requestDiagnostics] = createSignal<ParseDiagnostic[]>([]);
      const [fileContent, setFileContentSignal] = createSignal(initialContent);

      const controller = useRequestBodyDraftController({
        path,
        selectedRequest,
        sourceBody,
        requestDiagnostics,
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

      controller.onBodyChange('{"name":"new"}');
      await controller.onSave();

      expect(controller.saveError()).toBeUndefined();
      expect(controller.validationError()).toBeUndefined();
      expect(controller.isDirty()).toBe(false);
      expect(saveCalls).toEqual(['requests.http']);
      expect(reloadCalls).toEqual(['requests.http']);
      expect(refetchCalls).toBe(1);
      expect(setFileContentCalls).toHaveLength(1);
      expect(setFileContentCalls[0]).toContain('{"name":"new"}');

      dispose();
    });
  });

  test('blocks save when body json is invalid', async () => {
    const saveCalls: string[] = [];

    await createRoot(async (dispose) => {
      const initialContent = [
        'POST https://api.example.com/users',
        'Content-Type: application/json',
        '',
        '{"name":"old"}'
      ].join('\n');
      const [path] = createSignal('requests.http');
      const [selectedRequest] = createSignal<WorkspaceRequest | undefined>({
        index: 0,
        method: 'POST',
        url: 'https://api.example.com/users'
      });
      const [sourceBody] = createSignal<RequestBodySummary>(
        createInlineJsonSummary(initialContent, '{"name":"old"}')
      );
      const [requestDiagnostics] = createSignal<ParseDiagnostic[]>([]);
      const [fileContent] = createSignal(initialContent);

      const controller = useRequestBodyDraftController({
        path,
        selectedRequest,
        sourceBody,
        requestDiagnostics,
        getFileContent: fileContent,
        setFileContent: () => {},
        saveFile: async (nextPath) => {
          saveCalls.push(nextPath);
        },
        reloadRequests: async () => {},
        refetchRequestDetails: async () => {}
      });

      controller.onBodyChange('{ invalid-json }');
      await controller.onSave();

      expect(controller.isDirty()).toBe(true);
      expect(controller.validationError()).toBeDefined();
      expect(controller.saveError()).toBe('Body JSON is invalid. Fix errors before saving.');
      expect(saveCalls).toEqual([]);

      dispose();
    });
  });

  test('exposes template warnings from diagnostics and body content', () => {
    createRoot((dispose) => {
      const initialContent = [
        'POST https://api.example.com/users',
        'Content-Type: application/json',
        '',
        '{"name":"{{user.name}}"}'
      ].join('\n');
      const [path] = createSignal('requests.http');
      const [selectedRequest] = createSignal<WorkspaceRequest | undefined>({
        index: 0,
        method: 'POST',
        url: 'https://api.example.com/users'
      });
      const [sourceBody] = createSignal<RequestBodySummary>(
        createInlineJsonSummary(initialContent, '{"name":"{{user.name}}"}')
      );
      const [requestDiagnostics] = createSignal<ParseDiagnostic[]>([
        {
          severity: 'warning',
          code: 'empty-variable',
          message: 'Empty variable reference',
          range: {
            start: { line: 3, column: 9 },
            end: { line: 3, column: 13 }
          }
        }
      ]);
      const [fileContent] = createSignal(initialContent);

      const controller = useRequestBodyDraftController({
        path,
        selectedRequest,
        sourceBody,
        requestDiagnostics,
        getFileContent: fileContent,
        setFileContent: () => {},
        saveFile: async () => {},
        reloadRequests: async () => {},
        refetchRequestDetails: async () => {}
      });

      expect(controller.templateWarnings()).toEqual(['Empty variable reference']);

      dispose();
    });
  });

  test('saves edited form-data body and refetches details', async () => {
    const setFileContentCalls: string[] = [];
    const saveCalls: string[] = [];
    const reloadCalls: string[] = [];
    let refetchCalls = 0;

    await createRoot(async (dispose) => {
      const bodyText = ['title = old', 'document = @./old.pdf'].join('\n');
      const initialContent = [
        'POST https://api.example.com/upload',
        'Content-Type: multipart/form-data',
        '',
        bodyText
      ].join('\n');
      const [path] = createSignal('requests.http');
      const [selectedRequest] = createSignal<WorkspaceRequest | undefined>({
        index: 0,
        method: 'POST',
        url: 'https://api.example.com/upload'
      });
      const [sourceBody] = createSignal<RequestBodySummary>(
        createFormDataSummary(initialContent, bodyText)
      );
      const [requestDiagnostics] = createSignal<ParseDiagnostic[]>([]);
      const [fileContent, setFileContentSignal] = createSignal(initialContent);

      const controller = useRequestBodyDraftController({
        path,
        selectedRequest,
        sourceBody,
        requestDiagnostics,
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

      expect(controller.bodyMode()).toBe('form-data');
      controller.onFormDataValueChange(0, 'new');
      controller.onFormDataValueChange(1, './new.pdf');
      await controller.onSave();

      expect(controller.saveError()).toBeUndefined();
      expect(controller.isDirty()).toBe(false);
      expect(saveCalls).toEqual(['requests.http']);
      expect(reloadCalls).toEqual(['requests.http']);
      expect(refetchCalls).toBe(1);
      expect(setFileContentCalls).toHaveLength(1);
      expect(setFileContentCalls[0]).toContain('title = new');
      expect(setFileContentCalls[0]).toContain('document = @./new.pdf');

      dispose();
    });
  });

  test('saves edited file body reference and blocks empty path', async () => {
    const setFileContentCalls: string[] = [];
    const saveCalls: string[] = [];
    const reloadCalls: string[] = [];
    let refetchCalls = 0;

    await createRoot(async (dispose) => {
      const bodyText = '< ./old.json';
      const initialContent = [
        'POST https://api.example.com/upload',
        'Content-Type: application/json',
        '',
        bodyText
      ].join('\n');
      const [path] = createSignal('requests.http');
      const [selectedRequest] = createSignal<WorkspaceRequest | undefined>({
        index: 0,
        method: 'POST',
        url: 'https://api.example.com/upload'
      });
      const [sourceBody] = createSignal<RequestBodySummary>(
        createFileBodySummary(initialContent, bodyText)
      );
      const [requestDiagnostics] = createSignal<ParseDiagnostic[]>([]);
      const [fileContent, setFileContentSignal] = createSignal(initialContent);

      const controller = useRequestBodyDraftController({
        path,
        selectedRequest,
        sourceBody,
        requestDiagnostics,
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

      controller.onFilePathChange('   ');
      await controller.onSave();
      expect(controller.saveError()).toBe('Body file path cannot be empty.');
      expect(saveCalls).toEqual([]);

      controller.onFilePathChange('./next.json');
      await controller.onSave();

      expect(controller.saveError()).toBeUndefined();
      expect(controller.isDirty()).toBe(false);
      expect(saveCalls).toEqual(['requests.http']);
      expect(reloadCalls).toEqual(['requests.http']);
      expect(refetchCalls).toBe(1);
      expect(setFileContentCalls).toHaveLength(1);
      expect(setFileContentCalls[0]).toContain('< ./next.json');

      dispose();
    });
  });
});
