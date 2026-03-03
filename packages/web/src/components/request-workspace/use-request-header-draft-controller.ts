import { type Accessor, createEffect, createSignal, on } from 'solid-js';
import type { WorkspaceRequest } from '../../sdk';
import type { RequestDetailsRow } from '../../utils/request-details';
import { applyRequestEditsToContent, cloneRequestRows } from '../../utils/request-editing';

interface UseRequestHeaderDraftControllerInput {
  path: Accessor<string>;
  selectedRequest: Accessor<WorkspaceRequest | undefined>;
  sourceHeaders: Accessor<RequestDetailsRow[]>;
  sourceUrl: Accessor<string | undefined>;
  getFileContent: Accessor<string | undefined>;
  setFileContent: (content: string) => void;
  saveFile: (path: string) => Promise<void>;
  reloadRequests: (path: string) => Promise<void>;
  refetchRequestDetails: () => Promise<unknown> | unknown;
}

interface UseRequestHeaderDraftControllerReturn {
  draftHeaders: Accessor<RequestDetailsRow[]>;
  isDirty: Accessor<boolean>;
  isSaving: Accessor<boolean>;
  saveError: Accessor<string | undefined>;
  onHeaderChange: (index: number, field: 'key' | 'value', value: string) => void;
  onAddHeader: () => void;
  onRemoveHeader: (index: number) => void;
  onDiscard: () => void;
  onSave: () => Promise<void>;
}

const DEFAULT_SAVE_ERROR = 'Unable to save request header edits.';

const makeRequestKey = (
  path: string,
  request?: Pick<WorkspaceRequest, 'index'>
): string | undefined => (request ? `${path}:${request.index}` : undefined);

function toErrorMessage(value: unknown): string {
  if (value instanceof Error && value.message) {
    return value.message;
  }
  return DEFAULT_SAVE_ERROR;
}

export function useRequestHeaderDraftController(
  input: UseRequestHeaderDraftControllerInput
): UseRequestHeaderDraftControllerReturn {
  const initialDraftKey = () => makeRequestKey(input.path(), input.selectedRequest());
  const [draftRequestKey, setDraftRequestKey] = createSignal<string | undefined>(initialDraftKey());
  const [draftHeaders, setDraftHeaders] = createSignal<RequestDetailsRow[]>(
    initialDraftKey() ? cloneRequestRows(input.sourceHeaders()) : []
  );
  const [isDirty, setIsDirty] = createSignal(false);
  const [isSaving, setIsSaving] = createSignal(false);
  const [saveError, setSaveError] = createSignal<string | undefined>(undefined);

  const requestDraftKey = () => makeRequestKey(input.path(), input.selectedRequest());

  createEffect(
    on(requestDraftKey, (nextKey, previousKey) => {
      if (!nextKey) {
        setDraftRequestKey(undefined);
        setDraftHeaders([]);
        setIsDirty(false);
        setIsSaving(false);
        setSaveError(undefined);
        return;
      }

      if (nextKey === previousKey) {
        return;
      }

      setDraftRequestKey(nextKey);
      setDraftHeaders(cloneRequestRows(input.sourceHeaders()));
      setIsDirty(false);
      setIsSaving(false);
      setSaveError(undefined);
    })
  );

  createEffect(
    on([requestDraftKey, input.sourceHeaders], ([nextKey, nextHeaders]) => {
      if (!nextKey || draftRequestKey() !== nextKey || isDirty()) {
        return;
      }
      setDraftHeaders(cloneRequestRows(nextHeaders));
    })
  );

  const markDirty = () => {
    setIsDirty(true);
    setSaveError(undefined);
  };

  const onHeaderChange = (index: number, field: 'key' | 'value', value: string) => {
    setDraftHeaders((rows) => {
      if (index < 0 || index >= rows.length) {
        return rows;
      }
      return rows.map((row, rowIndex) => (rowIndex === index ? { ...row, [field]: value } : row));
    });
    markDirty();
  };

  const onAddHeader = () => {
    setDraftHeaders((rows) => [...rows, { key: '', value: '' }]);
    markDirty();
  };

  const onRemoveHeader = (index: number) => {
    setDraftHeaders((rows) => rows.filter((_, rowIndex) => rowIndex !== index));
    markDirty();
  };

  const onDiscard = () => {
    setDraftHeaders(cloneRequestRows(input.sourceHeaders()));
    setIsDirty(false);
    setSaveError(undefined);
  };

  const onSave = async () => {
    if (isSaving()) {
      return;
    }

    const request = input.selectedRequest();
    const currentPath = input.path();
    const currentContent = input.getFileContent();
    const sourceUrl = input.sourceUrl()?.trim() ?? request?.url;

    if (!request) {
      setSaveError('Select a request before saving header edits.');
      return;
    }

    if (currentContent === undefined) {
      setSaveError('Request file content is still loading. Try saving again.');
      return;
    }

    if (!sourceUrl) {
      setSaveError('Request URL cannot be empty.');
      return;
    }

    const rewrite = applyRequestEditsToContent(
      currentContent,
      request.index,
      sourceUrl,
      draftHeaders()
    );
    if (!rewrite.ok) {
      setSaveError(rewrite.error);
      return;
    }

    input.setFileContent(rewrite.content);
    setIsSaving(true);
    setSaveError(undefined);

    try {
      await input.saveFile(currentPath);
      setIsDirty(false);
      await input.reloadRequests(currentPath);
      await input.refetchRequestDetails();
    } catch (error) {
      setSaveError(toErrorMessage(error));
    } finally {
      setIsSaving(false);
    }
  };

  return {
    draftHeaders,
    isDirty,
    isSaving,
    saveError,
    onHeaderChange,
    onAddHeader,
    onRemoveHeader,
    onDiscard,
    onSave
  };
}
