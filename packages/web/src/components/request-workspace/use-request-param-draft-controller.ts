import { type Accessor, createEffect, on } from 'solid-js';
import { createStore } from 'solid-js/store';
import type { WorkspaceRequest } from '../../sdk';
import type { RequestDetailsRow } from '../../utils/request-details';
import {
  applyRequestEditsToContent,
  buildUrlWithQueryRows,
  cloneRequestRows
} from '../../utils/request-editing';

interface UseRequestParamDraftControllerInput {
  path: Accessor<string>;
  selectedRequest: Accessor<WorkspaceRequest | undefined>;
  sourceParams: Accessor<RequestDetailsRow[]>;
  sourceHeaders: Accessor<RequestDetailsRow[]>;
  sourceUrl: Accessor<string | undefined>;
  getFileContent: Accessor<string | undefined>;
  setFileContent: (content: string) => void;
  saveFile: (path: string) => Promise<void>;
  reloadRequests: (path: string) => Promise<void>;
  refetchRequestDetails: () => Promise<unknown> | unknown;
}

interface UseRequestParamDraftControllerReturn {
  draftParams: Accessor<RequestDetailsRow[]>;
  isDirty: Accessor<boolean>;
  isSaving: Accessor<boolean>;
  saveError: Accessor<string | undefined>;
  onParamChange: (index: number, field: 'key' | 'value', value: string) => void;
  onAddParam: () => void;
  onRemoveParam: (index: number) => void;
  onDiscard: () => void;
  onSave: () => Promise<void>;
}

type ParamDraftState = {
  requestKey?: string;
  params: RequestDetailsRow[];
  isDirty: boolean;
  isSaving: boolean;
  saveError?: string;
};

const DEFAULT_SAVE_ERROR = 'Unable to save request param edits.';

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

export function useRequestParamDraftController(
  input: UseRequestParamDraftControllerInput
): UseRequestParamDraftControllerReturn {
  const requestDraftKey = () => makeRequestKey(input.path(), input.selectedRequest());

  const [draft, setDraft] = createStore<ParamDraftState>({
    requestKey: requestDraftKey(),
    params: requestDraftKey() ? cloneRequestRows(input.sourceParams()) : [],
    isDirty: false,
    isSaving: false,
    saveError: undefined
  });

  const replaceDraft = (requestKey: string | undefined, params: RequestDetailsRow[]) => {
    setDraft({
      requestKey,
      params: requestKey ? cloneRequestRows(params) : [],
      isDirty: false,
      isSaving: false,
      saveError: undefined
    });
  };

  const clearSaveError = () => {
    if (draft.saveError !== undefined) {
      setDraft('saveError', undefined);
    }
  };

  const markDirty = () => {
    setDraft('isDirty', true);
    clearSaveError();
  };

  createEffect(
    on(requestDraftKey, (nextKey, previousKey) => {
      if (nextKey === previousKey) {
        return;
      }

      replaceDraft(nextKey, input.sourceParams());
    })
  );

  createEffect(
    on([requestDraftKey, input.sourceParams], ([nextKey, nextParams]) => {
      if (!nextKey || draft.requestKey !== nextKey || draft.isDirty) {
        return;
      }

      setDraft('params', cloneRequestRows(nextParams));
    })
  );

  const persistRewrite = async (path: string, nextContent: string) => {
    input.setFileContent(nextContent);
    setDraft('isSaving', true);
    setDraft('saveError', undefined);

    try {
      await input.saveFile(path);
      setDraft('isDirty', false);
      await input.reloadRequests(path);
      await input.refetchRequestDetails();
    } catch (error) {
      setDraft('saveError', toErrorMessage(error));
    } finally {
      setDraft('isSaving', false);
    }
  };

  const onParamChange = (index: number, field: 'key' | 'value', value: string) => {
    if (index < 0 || index >= draft.params.length) {
      return;
    }

    setDraft('params', index, field, value);

    if (field === 'value') {
      setDraft('params', index, 'hasValue', true);
    }

    markDirty();
  };

  const onAddParam = () => {
    setDraft('params', (rows) => [...rows, { key: '', value: '', hasValue: true }]);
    markDirty();
  };

  const onRemoveParam = (index: number) => {
    setDraft('params', (rows) => rows.filter((_, rowIndex) => rowIndex !== index));
    markDirty();
  };

  const onDiscard = () => {
    replaceDraft(requestDraftKey(), input.sourceParams());
  };

  const onSave = async () => {
    if (draft.isSaving) {
      return;
    }

    const request = input.selectedRequest();
    const currentPath = input.path();
    const currentContent = input.getFileContent();
    const sourceUrl = input.sourceUrl()?.trim() ?? request?.url;

    if (!request) {
      setDraft('saveError', 'Select a request before saving param edits.');
      return;
    }

    if (currentContent === undefined) {
      setDraft('saveError', 'Request file content is still loading. Try saving again.');
      return;
    }

    if (!sourceUrl) {
      setDraft('saveError', 'Request URL cannot be empty.');
      return;
    }

    const nextUrl = buildUrlWithQueryRows(sourceUrl, draft.params);
    const rewrite = applyRequestEditsToContent(
      currentContent,
      request.index,
      nextUrl,
      input.sourceHeaders()
    );

    if (!rewrite.ok) {
      setDraft('saveError', rewrite.error);
      return;
    }

    await persistRewrite(currentPath, rewrite.content);
  };

  return {
    draftParams: () => draft.params,
    isDirty: () => draft.isDirty,
    isSaving: () => draft.isSaving,
    saveError: () => draft.saveError,
    onParamChange,
    onAddParam,
    onRemoveParam,
    onDiscard,
    onSave
  };
}
