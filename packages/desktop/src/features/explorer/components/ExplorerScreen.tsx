import { type PostExecuteResponses, unwrap } from '@t-req/sdk/client';
import {
  createEffect,
  createMemo,
  createResource,
  createSignal,
  Match,
  on,
  Show,
  Switch
} from 'solid-js';
import { createStore } from 'solid-js/store';
import { useServer } from '../../../context/server-context';
import { toErrorMessage } from '../../../lib/errors';
import {
  type CreateWorkspaceItemKind,
  DEFAULT_CREATE_WORKSPACE_ITEM_KIND,
  getRequestTemplate,
  isCreateRequestKind
} from '../create-request';
import { FALLBACK_REQUEST_METHOD, FALLBACK_REQUEST_URL } from '../request-line';
import { useExplorerStore } from '../use-explorer-store';
import { formatJsonBodyText, validateJsonBodyText } from '../utils/json-body';
import { buildCreateFilePath, toCreateHttpPath } from '../utils/mutations';
import { parentDirectory } from '../utils/path';
import {
  findRequestBlock,
  type RequestBodyField,
  type RequestDetailsRow,
  toRequestBodySummary,
  toRequestHeaders,
  toRequestParams
} from '../utils/request-details';
import {
  applyRequestEditsToContent,
  applySpanEditToContent,
  buildUrlWithParams,
  cloneRequestRows,
  insertRequestBodyIntoContent
} from '../utils/request-editing';
import { cloneFormDataFields, serializeFormDataBody } from '../utils/request-form-data';
import { isHttpProtocol, type RequestOption, toRequestOption } from '../utils/request-workspace';
import { CreateRequestDialog } from './CreateRequestDialog';
import { ExplorerToolbar } from './ExplorerToolbar';
import { ExplorerTree } from './ExplorerTree';
import { ChevronRightIcon } from './icons';
import {
  EmptyRequestWorkspace,
  RequestDetailsPanel,
  RequestUrlBar,
  ResponseBodyPanel
} from './workspace';

export default function ExplorerScreen() {
  type RequestBodyDraftMode = 'none' | 'inline' | 'form-data' | 'file';

  const toDraftBodyMode = (kind: 'none' | 'inline' | 'form-data' | 'file'): RequestBodyDraftMode =>
    kind;

  const server = useServer();
  const explorer = useExplorerStore();
  const [createDialog, setCreateDialog] = createStore<{
    name: string;
    kind: CreateWorkspaceItemKind;
    targetDir: string | undefined;
    error: string | undefined;
    isOpen: boolean;
  }>({
    name: '',
    kind: DEFAULT_CREATE_WORKSPACE_ITEM_KIND,
    targetDir: undefined,
    error: undefined,
    isOpen: false
  });
  const [selectedRequestIndex, setSelectedRequestIndex] = createSignal(0);
  const [isSending, setIsSending] = createSignal(false);
  const [draftRequestKey, setDraftRequestKey] = createSignal<string | undefined>(undefined);
  const [draftParams, setDraftParams] = createSignal<RequestDetailsRow[]>([]);
  const [draftHeaders, setDraftHeaders] = createSignal<RequestDetailsRow[]>([]);
  const [draftBodyMode, setDraftBodyMode] = createSignal<RequestBodyDraftMode>('none');
  const [draftBody, setDraftBody] = createSignal('');
  const [draftFormData, setDraftFormData] = createSignal<RequestBodyField[]>([]);
  const [isDetailsDirty, setIsDetailsDirty] = createSignal(false);
  const [detailsSaveError, setDetailsSaveError] = createSignal<string | undefined>(undefined);
  const [latestExecution, setLatestExecution] = createSignal<PostExecuteResponses[200] | undefined>(
    undefined
  );
  const [executionError, setExecutionError] = createSignal<string | undefined>(undefined);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = createSignal(false);
  const [isResponseCollapsed, setIsResponseCollapsed] = createSignal(false);
  const selectedPath = explorer.selectedPath;
  const selectedRequests = explorer.selectedRequests;
  const isRequestsLoading = explorer.isRequestsLoading;
  const requestsLoadError = explorer.requestsLoadError;
  const visibleItems = explorer.flattenedVisible;
  const selectedItem = createMemo(() => {
    const path = selectedPath();
    if (!path) {
      return undefined;
    }
    return visibleItems().find((entry) => entry.node.path === path);
  });
  const selectedIsDirectory = createMemo(() => Boolean(selectedItem()?.node.isDir));
  const selectedRequestCount = createMemo(() => {
    const item = selectedItem();
    if (!item || item.node.isDir) {
      return 0;
    }
    return item?.node.requestCount ?? 0;
  });
  const mutationError = explorer.mutationError;
  const isFileLoading = explorer.isFileLoading;
  const isSavingFile = explorer.isSavingFile;
  const fileLoadError = explorer.fileLoadError;
  const selectedRequest = createMemo(() => {
    const requests = selectedRequests();
    if (requests.length === 0) {
      return undefined;
    }
    const targetIndex = selectedRequestIndex();
    return requests.find((request) => request.index === targetIndex) ?? requests[0];
  });
  const parseSource = createMemo(() => {
    const client = server.client();
    const path = selectedPath();
    if (!client || !path) {
      return null;
    }
    return {
      client,
      path
    };
  });
  const [parsedRequestFile, { refetch: refetchParsedRequestFile }] = createResource(
    parseSource,
    async (context) => {
      return await unwrap(
        context.client.postParse({
          body: {
            path: context.path,
            includeDiagnostics: true,
            includeBodyContent: true
          }
        })
      );
    }
  );
  const selectedRequestBlock = createMemo(() => {
    const request = selectedRequest();
    if (!request) {
      return undefined;
    }
    return findRequestBlock(parsedRequestFile()?.requests ?? [], request.index);
  });
  const requestDraftKey = createMemo(() => {
    const path = selectedPath();
    const request = selectedRequest();
    if (!path || !request) {
      return undefined;
    }
    return `${path}:${request.index}`;
  });
  const requestSourceUrl = createMemo(() => {
    return selectedRequestBlock()?.request?.url ?? selectedRequest()?.url;
  });
  const requestSourceParams = createMemo(() => {
    const url = requestSourceUrl();
    if (!url) {
      return [];
    }
    return toRequestParams(url);
  });
  const requestSourceHeaders = createMemo(() => {
    const parsedRequest = selectedRequestBlock()?.request;
    if (!parsedRequest) {
      return [];
    }
    return toRequestHeaders(parsedRequest.headers);
  });
  const requestSourceDiagnostics = createMemo(() => selectedRequestBlock()?.diagnostics ?? []);
  const requestSourceBody = createMemo(() => toRequestBodySummary(selectedRequestBlock()?.request));
  const requestSourceFormData = createMemo(() => {
    const sourceBody = requestSourceBody();
    if (sourceBody.kind !== 'form-data' || !sourceBody.fields) {
      return [];
    }
    return cloneFormDataFields(sourceBody.fields);
  });

  createEffect(
    on(requestDraftKey, (nextKey, previousKey) => {
      if (!nextKey) {
        setDraftRequestKey(undefined);
        setDraftParams([]);
        setDraftHeaders([]);
        setDraftBodyMode('none');
        setDraftBody('');
        setDraftFormData([]);
        setIsDetailsDirty(false);
        setDetailsSaveError(undefined);
        return;
      }

      if (nextKey === previousKey) {
        return;
      }

      setDraftRequestKey(nextKey);
      setDraftParams(cloneRequestRows(requestSourceParams()));
      setDraftHeaders(cloneRequestRows(requestSourceHeaders()));
      setDraftBodyMode(toDraftBodyMode(requestSourceBody().kind));
      setDraftBody(requestSourceBody().text ?? '');
      setDraftFormData(cloneFormDataFields(requestSourceFormData()));
      setIsDetailsDirty(false);
      setDetailsSaveError(undefined);
    })
  );

  createEffect(
    on(
      [
        requestDraftKey,
        requestSourceParams,
        requestSourceHeaders,
        requestSourceBody,
        requestSourceFormData
      ],
      ([nextKey, nextParams, nextHeaders, nextBody, nextFormData]) => {
        if (!nextKey || draftRequestKey() !== nextKey || isDetailsDirty()) {
          return;
        }

        setDraftParams(cloneRequestRows(nextParams));
        setDraftHeaders(cloneRequestRows(nextHeaders));
        setDraftBodyMode(toDraftBodyMode(nextBody.kind));
        setDraftBody(nextBody.text ?? '');
        setDraftFormData(cloneFormDataFields(nextFormData));
      }
    )
  );

  const updateDraftRows = (
    rows: RequestDetailsRow[],
    index: number,
    field: 'key' | 'value',
    value: string
  ): RequestDetailsRow[] => {
    if (index < 0 || index >= rows.length) {
      return rows;
    }

    return rows.map((row, rowIndex) => {
      if (rowIndex !== index) {
        return row;
      }
      return {
        ...row,
        [field]: value
      };
    });
  };

  const markDetailsDirty = () => {
    setIsDetailsDirty(true);
    setDetailsSaveError(undefined);
  };

  const handleDraftParamChange = (index: number, field: 'key' | 'value', value: string) => {
    setDraftParams((rows) => updateDraftRows(rows, index, field, value));
    markDetailsDirty();
  };

  const handleDraftHeaderChange = (index: number, field: 'key' | 'value', value: string) => {
    setDraftHeaders((rows) => updateDraftRows(rows, index, field, value));
    markDetailsDirty();
  };

  const handleDraftBodyChange = (value: string) => {
    setDraftBody(value);
    markDetailsDirty();
  };

  const handleDraftBodyModeChange = (nextMode: RequestBodyDraftMode) => {
    if (nextMode === draftBodyMode()) {
      return;
    }

    setDraftBodyMode(nextMode);
    if (nextMode === 'form-data' && draftFormData().length === 0) {
      setDraftFormData([{ name: '', value: '', isFile: false }]);
    }
    markDetailsDirty();
  };

  const updateDraftFormDataRows = (
    fields: RequestBodyField[],
    index: number,
    update: (field: RequestBodyField) => RequestBodyField
  ): RequestBodyField[] => {
    if (index < 0 || index >= fields.length) {
      return fields;
    }

    return fields.map((field, fieldIndex) => {
      if (fieldIndex !== index) {
        return field;
      }
      return update(field);
    });
  };

  const handleDraftFormDataNameChange = (index: number, value: string) => {
    setDraftFormData((fields) =>
      updateDraftFormDataRows(fields, index, (field) => ({
        ...field,
        name: value
      }))
    );
    markDetailsDirty();
  };

  const handleDraftFormDataTypeChange = (index: number, isFile: boolean) => {
    setDraftFormData((fields) =>
      updateDraftFormDataRows(fields, index, (field) => {
        if (!isFile) {
          return {
            name: field.name,
            value: field.value,
            isFile: false
          };
        }

        const filename = field.filename?.trim();
        return {
          name: field.name,
          value: '',
          isFile: true,
          path: field.path ?? '',
          ...(filename ? { filename } : {})
        };
      })
    );
    markDetailsDirty();
  };

  const handleDraftFormDataValueChange = (index: number, value: string) => {
    setDraftFormData((fields) =>
      updateDraftFormDataRows(fields, index, (field) => {
        if (field.isFile) {
          return {
            ...field,
            path: value
          };
        }

        return {
          ...field,
          value
        };
      })
    );
    markDetailsDirty();
  };

  const handleDraftFormDataFilenameChange = (index: number, value: string) => {
    setDraftFormData((fields) =>
      updateDraftFormDataRows(fields, index, (field) => {
        const filename = value.trim();
        if (!filename) {
          const nextField = { ...field };
          delete nextField.filename;
          return nextField;
        }

        return {
          ...field,
          filename
        };
      })
    );
    markDetailsDirty();
  };

  const addDraftFormDataField = () => {
    setDraftFormData((fields) => [...fields, { name: '', value: '', isFile: false }]);
    markDetailsDirty();
  };

  const removeDraftFormDataField = (index: number) => {
    setDraftFormData((fields) => fields.filter((_, fieldIndex) => fieldIndex !== index));
    markDetailsDirty();
  };

  const addDraftParam = () => {
    setDraftParams((rows) => [...rows, { key: '', value: '' }]);
    markDetailsDirty();
  };

  const removeDraftParam = (index: number) => {
    setDraftParams((rows) => rows.filter((_, rowIndex) => rowIndex !== index));
    markDetailsDirty();
  };

  const addDraftHeader = () => {
    setDraftHeaders((rows) => [...rows, { key: '', value: '' }]);
    markDetailsDirty();
  };

  const removeDraftHeader = (index: number) => {
    setDraftHeaders((rows) => rows.filter((_, rowIndex) => rowIndex !== index));
    markDetailsDirty();
  };

  const discardRequestDetailsDraft = () => {
    setDraftParams(cloneRequestRows(requestSourceParams()));
    setDraftHeaders(cloneRequestRows(requestSourceHeaders()));
    setDraftBodyMode(toDraftBodyMode(requestSourceBody().kind));
    setDraftBody(requestSourceBody().text ?? '');
    setDraftFormData(cloneFormDataFields(requestSourceFormData()));
    setIsDetailsDirty(false);
    setDetailsSaveError(undefined);
  };

  const saveRequestDetailsDraft = async () => {
    const request = selectedRequest();
    const sourceUrl = requestSourceUrl();
    const content = explorer.fileDraftContent();
    if (!request) {
      setDetailsSaveError('Select a request before saving request details.');
      return;
    }
    if (!sourceUrl) {
      setDetailsSaveError('Unable to resolve the request URL for this request.');
      return;
    }
    if (content === undefined) {
      setDetailsSaveError('Request file content is still loading. Try saving again.');
      return;
    }

    const sourceBody = requestSourceBody();
    const sourceBodyText = sourceBody.kind === 'inline' ? (sourceBody.text ?? '') : '';
    const sourceFormData = sourceBody.kind === 'form-data' ? (sourceBody.fields ?? []) : [];
    const sourceFileBodyText = sourceBody.kind === 'file' ? `< ${sourceBody.filePath ?? ''}` : '';
    const sourceBodyMode = toDraftBodyMode(sourceBody.kind);
    const sourceSerializedBody =
      sourceBodyMode === 'inline'
        ? sourceBodyText
        : sourceBodyMode === 'form-data'
          ? serializeFormDataBody(sourceFormData)
          : sourceBodyMode === 'file'
            ? sourceFileBodyText
            : '';
    const nextBodyMode = draftBodyMode();
    const nextSerializedBody =
      nextBodyMode === 'inline'
        ? draftBody()
        : nextBodyMode === 'form-data'
          ? serializeFormDataBody(draftFormData())
          : nextBodyMode === 'file'
            ? sourceFileBodyText
            : '';
    const shouldRewriteBody =
      nextBodyMode !== sourceBodyMode || nextSerializedBody !== sourceSerializedBody;

    let contentWithBody = content;
    if (shouldRewriteBody && sourceBody.spans?.body) {
      const bodySpan = sourceBody.spans?.body;
      if (!bodySpan) {
        setDetailsSaveError('Unable to update body text because body span data was unavailable.');
        return;
      }

      const bodyRewrite = applySpanEditToContent(contentWithBody, bodySpan, nextSerializedBody);
      if (!bodyRewrite.ok) {
        setDetailsSaveError(bodyRewrite.error);
        return;
      }
      contentWithBody = bodyRewrite.content;
    }
    if (shouldRewriteBody && !sourceBody.spans?.body && nextSerializedBody.length > 0) {
      const bodyInsert = insertRequestBodyIntoContent(
        contentWithBody,
        request.index,
        nextSerializedBody
      );
      if (!bodyInsert.ok) {
        setDetailsSaveError(bodyInsert.error);
        return;
      }
      contentWithBody = bodyInsert.content;
    }

    const nextUrl = buildUrlWithParams(sourceUrl, draftParams());
    const updatedContent = applyRequestEditsToContent(
      contentWithBody,
      request.index,
      nextUrl,
      draftHeaders()
    );
    if (!updatedContent.ok) {
      setDetailsSaveError(updatedContent.error);
      return;
    }

    explorer.setFileDraftContent(updatedContent.content);
    setDetailsSaveError(undefined);
    try {
      await explorer.saveSelectedFile();
      setIsDetailsDirty(false);
      await refetchParsedRequestFile();
    } catch (error) {
      setDetailsSaveError(toErrorMessage(error));
    }
  };

  const requestDetailsSaveError = createMemo(() => detailsSaveError() ?? explorer.fileSaveError());

  const requestOptions = createMemo<RequestOption[]>(() => selectedRequests().map(toRequestOption));
  const requestMethod = createMemo(() => {
    const parsedMethod = selectedRequestBlock()?.request?.method;
    if (parsedMethod) {
      return parsedMethod.toUpperCase();
    }
    return selectedRequest()?.method.toUpperCase() ?? FALLBACK_REQUEST_METHOD;
  });
  const requestUrl = createMemo(() => {
    const sourceUrl = requestSourceUrl();
    const key = requestDraftKey();
    if (!sourceUrl || !key) {
      return FALLBACK_REQUEST_URL;
    }

    if (draftRequestKey() === key) {
      return buildUrlWithParams(sourceUrl, draftParams());
    }

    return sourceUrl;
  });
  const isInlineJsonBodyMode = createMemo(() => {
    if (draftBodyMode() !== 'inline') {
      return false;
    }

    const body = requestSourceBody();
    if (body.kind === 'inline') {
      return body.isJsonLike ?? false;
    }

    return true;
  });
  const inlineJsonBodyText = createMemo(() => {
    if (!isInlineJsonBodyMode()) {
      return undefined;
    }
    return draftBody();
  });
  const bodyValidationError = createMemo(() => {
    const text = inlineJsonBodyText();
    if (text === undefined) {
      return undefined;
    }
    return validateJsonBodyText(text);
  });
  const hasSelectedRequest = createMemo(() => Boolean(selectedRequest()));
  const fileDiagnostics = createMemo(() => parsedRequestFile()?.diagnostics ?? []);

  const requestDetailsError = createMemo(() => {
    if (!parseSource() || !parsedRequestFile.error) {
      return undefined;
    }
    return `Failed to parse request details: ${toErrorMessage(parsedRequestFile.error)}`;
  });
  const isRequestDetailsLoading = createMemo(
    () => Boolean(parseSource()) && parsedRequestFile.loading
  );
  const isUnsupportedProtocol = createMemo(() => {
    const request = selectedRequest();
    if (!request) {
      return false;
    }
    return !isHttpProtocol(request.protocol);
  });
  const unsupportedProtocolLabel = createMemo(() => {
    const request = selectedRequest();
    if (!request || !isUnsupportedProtocol()) {
      return undefined;
    }
    return request.protocol?.toUpperCase() ?? 'THIS';
  });
  const isBusy = createMemo(() => explorer.isMutating());
  const sendDisabled = createMemo(() => {
    if (!selectedPath() || !selectedRequest() || !server.client()) {
      return true;
    }
    if (isUnsupportedProtocol()) {
      return true;
    }
    if (bodyValidationError()) {
      return true;
    }
    return isBusy() || isFileLoading() || isRequestsLoading() || isSavingFile() || isSending();
  });
  const explorerGridStyle = createMemo<Record<string, string>>(() => ({
    '--explorer-grid-cols': isSidebarCollapsed()
      ? 'minmax(0, 1fr)'
      : 'minmax(260px, 300px) minmax(0, 1fr)',
    '--explorer-grid-rows-mobile': isSidebarCollapsed()
      ? 'minmax(0, 1fr)'
      : 'minmax(220px, 42%) minmax(0, 1fr)'
  }));
  const requestPanelsStyle = createMemo<Record<string, string>>(() => ({
    '--request-panels-cols': isResponseCollapsed()
      ? 'minmax(0, 1fr) 34px'
      : 'minmax(320px, 48%) minmax(0, 1fr)'
  }));

  const openCreateDialog = () => {
    let targetDir = createDialog.targetDir;
    const path = selectedPath();
    if (path && selectedIsDirectory()) {
      targetDir = path;
    } else if (path) {
      const nextTarget = parentDirectory(path);
      targetDir = nextTarget || undefined;
    }

    setCreateDialog({
      name: '',
      kind: DEFAULT_CREATE_WORKSPACE_ITEM_KIND,
      targetDir,
      error: undefined,
      isOpen: true
    });
  };

  const closeCreateDialog = () => {
    setCreateDialog({
      name: '',
      kind: DEFAULT_CREATE_WORKSPACE_ITEM_KIND,
      error: undefined,
      isOpen: false
    });
  };

  const submitCreateDialog = async () => {
    setCreateDialog('error', undefined);

    if (!isCreateRequestKind(createDialog.kind)) {
      setCreateDialog('error', 'Selected type is not available yet.');
      return;
    }

    const parsedPath = toCreateHttpPath(createDialog.name);
    if (!parsedPath.ok) {
      setCreateDialog('error', parsedPath.error);
      return;
    }

    try {
      await explorer.createFile({
        path: buildCreateFilePath(parsedPath.path, createDialog.targetDir),
        content: getRequestTemplate(createDialog.kind)
      });
      closeCreateDialog();
    } catch {
      // Store mutation error is displayed in the explorer panel.
    }
  };

  const handleToggleDirectory = (path: string) => {
    setCreateDialog('targetDir', path);
    explorer.toggleDir(path);
  };

  const handleSelectFile = (path: string) => {
    const nextTarget = parentDirectory(path);
    setCreateDialog('targetDir', nextTarget || undefined);
    setSelectedRequestIndex(0);
    setLatestExecution(undefined);
    setExecutionError(undefined);
    explorer.selectPath(path);
  };

  const handleRequestIndexChange = (requestIndex: number) => {
    setSelectedRequestIndex(requestIndex);
    setLatestExecution(undefined);
    setExecutionError(undefined);
  };

  const createTargetLabel = createMemo(() => createDialog.targetDir ?? 'workspace root');
  const toggleSidebarCollapsed = () => {
    setIsSidebarCollapsed((previous) => {
      const next = !previous;
      if (next) {
        closeCreateDialog();
      }
      return next;
    });
  };
  const collapseResponsePanel = () => setIsResponseCollapsed(true);
  const expandResponsePanel = () => setIsResponseCollapsed(false);

  const sendSelectedRequest = async () => {
    const path = selectedPath();
    const request = selectedRequest();
    const client = server.client();
    if (!path || !request || !client) {
      return;
    }

    if (!isHttpProtocol(request.protocol)) {
      setExecutionError(
        `Execution for ${request.protocol?.toUpperCase() ?? 'this'} requests is not wired yet.`
      );
      return;
    }

    setIsSending(true);
    setExecutionError(undefined);
    setLatestExecution(undefined);

    try {
      const response = await unwrap(
        client.postExecute({
          body: {
            path,
            requestIndex: request.index
          }
        })
      );
      setLatestExecution(response);
    } catch (error) {
      setExecutionError(`Failed to execute request: ${toErrorMessage(error)}`);
    } finally {
      setIsSending(false);
    }
  };

  const prettifyDraftBody = () => {
    if (!isInlineJsonBodyMode()) {
      return;
    }

    const result = formatJsonBodyText(draftBody(), 'prettify');
    if (!result.ok) {
      return;
    }

    setDraftBody(result.text);
    markDetailsDirty();
  };

  const minifyDraftBody = () => {
    if (!isInlineJsonBodyMode()) {
      return;
    }

    const result = formatJsonBodyText(draftBody(), 'minify');
    if (!result.ok) {
      return;
    }

    setDraftBody(result.text);
    markDetailsDirty();
  };

  const copyDraftBody = async () => {
    if (!selectedRequest()) {
      return;
    }

    try {
      await navigator.clipboard.writeText(draftBody());
    } catch {
      // Ignore clipboard failures and keep editing flow uninterrupted.
    }
  };

  const refreshExplorer = () => void explorer.refresh();
  const submitCreateDialogRequest = () => void submitCreateDialog();
  const sendSelectedRequestAction = () => void sendSelectedRequest();
  const copyDraftBodyAction = () => void copyDraftBody();
  const saveRequestDetailsDraftAction = () => void saveRequestDetailsDraft();

  return (
    <main
      class="flex-1 min-h-0 overflow-hidden grid grid-cols-[var(--explorer-grid-cols)] gap-0 px-2 pt-2 max-[960px]:grid-cols-1 max-[960px]:grid-rows-[var(--explorer-grid-rows-mobile)]"
      style={explorerGridStyle()}
    >
      <Show when={!isSidebarCollapsed()}>
        <section
          class="min-h-0 flex flex-col overflow-hidden border border-base-300 border-r-0 rounded-tl-[14px] bg-[linear-gradient(180deg,_var(--app-pane-gradient-start)_0%,_var(--app-bg)_100%)] max-[960px]:border-r max-[960px]:rounded-tr-[14px]"
          aria-label="Workspace files"
        >
          <ExplorerToolbar
            onCreate={openCreateDialog}
            onRefresh={refreshExplorer}
            isRefreshing={explorer.isLoading()}
            isMutating={isBusy()}
            workspaceRoot={explorer.workspaceRoot()}
          />

          <div class="flex-1 min-h-0 overflow-y-auto overflow-x-hidden bg-transparent py-2">
            <Show when={explorer.error()}>
              {(message) => (
                <div
                  class="mx-3 mt-3 rounded-box border border-error/40 bg-error/15 px-4 py-3 text-sm text-base-content"
                  role="alert"
                >
                  <strong class="block font-semibold">
                    Unable to load workspace request files.
                  </strong>
                  <span class="mt-1 block text-xs">{message()}</span>
                </div>
              )}
            </Show>

            <Show when={mutationError()}>
              {(message) => (
                <div
                  class="mx-3 mt-3 rounded-box border border-error/40 bg-error/15 px-4 py-3 text-sm text-base-content"
                  role="alert"
                >
                  <strong class="block font-semibold">Workspace update failed.</strong>
                  <span class="mt-1 block text-xs">{message()}</span>
                </div>
              )}
            </Show>

            <Switch>
              <Match when={explorer.isLoading() && explorer.flattenedVisible().length === 0}>
                <div class="mx-3 mt-3 rounded-box border border-base-300 bg-base-200/60 px-4 py-4 text-sm text-base-content/80">
                  <strong class="block font-semibold text-base-content">Loading workspace…</strong>
                  <span class="mt-1 block text-xs">
                    Fetching files from the local sidecar server.
                  </span>
                </div>
              </Match>

              <Match when={!explorer.isLoading() && explorer.flattenedVisible().length === 0}>
                <div class="mx-3 mt-3 rounded-box border border-base-300 bg-base-200/60 px-4 py-4 text-sm text-base-content/80">
                  <strong class="block font-semibold text-base-content">
                    No HTTP request files discovered.
                  </strong>
                  <span class="mt-1 block text-xs">
                    Try refreshing after adding `.http` files to this workspace.
                  </span>
                </div>
              </Match>

              <Match when={explorer.flattenedVisible().length > 0}>
                <ExplorerTree
                  items={visibleItems()}
                  selectedPath={selectedPath()}
                  onToggleDir={handleToggleDirectory}
                  onSelectFile={handleSelectFile}
                />
              </Match>
            </Switch>
          </div>
        </section>
      </Show>

      <CreateRequestDialog
        open={createDialog.isOpen}
        isBusy={isBusy()}
        name={createDialog.name}
        kind={createDialog.kind}
        targetLabel={createTargetLabel()}
        error={createDialog.error}
        onClose={closeCreateDialog}
        onNameChange={(value) => setCreateDialog('name', value)}
        onKindChange={(kind) => setCreateDialog('kind', kind)}
        onSubmit={submitCreateDialogRequest}
      />

      <section
        class="min-w-0 min-h-0 flex flex-col overflow-hidden border border-base-300 rounded-tr-[14px] bg-[linear-gradient(180deg,_var(--app-pane-gradient-start)_0%,_var(--app-pane-gradient-end)_100%)] [box-shadow:var(--app-pane-shadow-top),_var(--app-pane-shadow-drop)] max-[960px]:rounded-tr-none"
        aria-label="Request workspace"
      >
        <header class="flex min-h-[42px] items-center justify-between gap-2 border-b border-base-300 px-3.5">
          <div class="flex items-center gap-2">
            <button
              type="button"
              class="btn btn-ghost btn-xs btn-square h-7 min-h-7 text-base-content/70 hover:text-base-content"
              onClick={toggleSidebarCollapsed}
              aria-label={
                isSidebarCollapsed() ? 'Expand workspace files' : 'Collapse workspace files'
              }
              title={isSidebarCollapsed() ? 'Expand workspace files' : 'Collapse workspace files'}
            >
              <ChevronRightIcon class={isSidebarCollapsed() ? 'size-3' : 'size-3 rotate-180'} />
            </button>
            <h2 class="m-0 font-mono text-[0.9rem] font-semibold tracking-[0.015em] text-base-content">
              Request Workspace
            </h2>
          </div>
          <div class="flex items-center gap-2">
            <Show when={selectedPath()}>
              {(path) => (
                <span
                  class="max-w-[320px] truncate font-mono text-[12px] text-base-content/65"
                  title={path()}
                >
                  {path()}
                </span>
              )}
            </Show>
            <Show when={selectedPath()}>
              <span class="badge badge-sm border-base-300 bg-base-300/60 px-2 font-mono text-[11px] text-base-content/80">
                {selectedRequestCount()} req
              </span>
            </Show>
          </div>
        </header>
        <Show when={selectedPath()} fallback={<EmptyRequestWorkspace />}>
          <div class="flex min-h-0 flex-1 flex-col overflow-hidden">
            <Show when={fileLoadError()}>
              {(message) => (
                <div
                  class="alert alert-error mx-3 mt-3 border border-error/50 bg-error/20 text-error-content"
                  role="alert"
                >
                  <span class="text-sm">{message()}</span>
                </div>
              )}
            </Show>

            <Show when={isFileLoading()}>
              <div class="alert mx-3 mt-3 border border-base-300 bg-base-200/70 text-base-content">
                <span class="text-sm">Loading request content…</span>
              </div>
            </Show>

            <Show when={requestsLoadError()}>
              {(message) => (
                <div
                  class="alert alert-error mx-3 mt-3 border border-error/50 bg-error/20 text-error-content"
                  role="alert"
                >
                  <span class="text-sm">{message()}</span>
                </div>
              )}
            </Show>

            <Show when={isRequestsLoading()}>
              <div class="alert mx-3 mt-3 border border-base-300 bg-base-200/70 text-base-content">
                <span class="text-sm">Loading requests in selected file…</span>
              </div>
            </Show>

            <Show when={unsupportedProtocolLabel()}>
              {(protocol) => (
                <div class="alert mx-3 mt-3 border border-base-300 bg-base-200/70 text-base-content">
                  <span class="text-sm">{protocol()} execution wiring is coming next.</span>
                </div>
              )}
            </Show>

            <RequestUrlBar
              method={requestMethod()}
              url={requestUrl()}
              requestOptions={requestOptions()}
              selectedRequestIndex={selectedRequestIndex()}
              onRequestIndexChange={handleRequestIndexChange}
              onSend={sendSelectedRequestAction}
              disabled={isBusy() || isFileLoading() || isRequestsLoading() || isSavingFile()}
              sendDisabled={sendDisabled()}
              isSending={isSending()}
            />

            <div
              class="grid min-h-0 min-w-0 flex-1 overflow-hidden grid-cols-[var(--request-panels-cols)] gap-0"
              style={requestPanelsStyle()}
            >
              <RequestDetailsPanel
                hasRequest={hasSelectedRequest()}
                params={draftParams()}
                headers={draftHeaders()}
                bodySummary={requestSourceBody()}
                bodyMode={draftBodyMode()}
                isJsonBodyMode={isInlineJsonBodyMode()}
                bodyDraft={draftBody()}
                formDataDraft={draftFormData()}
                bodyValidationError={bodyValidationError()}
                diagnostics={requestSourceDiagnostics()}
                fileDiagnostics={fileDiagnostics()}
                isLoading={isRequestDetailsLoading()}
                error={requestDetailsError()}
                saveError={requestDetailsSaveError()}
                hasUnsavedChanges={isDetailsDirty()}
                isSaving={isSavingFile()}
                onParamChange={handleDraftParamChange}
                onHeaderChange={handleDraftHeaderChange}
                onAddParam={addDraftParam}
                onRemoveParam={removeDraftParam}
                onAddHeader={addDraftHeader}
                onRemoveHeader={removeDraftHeader}
                onBodyModeChange={handleDraftBodyModeChange}
                onBodyChange={handleDraftBodyChange}
                onBodyFormDataNameChange={handleDraftFormDataNameChange}
                onBodyFormDataTypeChange={handleDraftFormDataTypeChange}
                onBodyFormDataValueChange={handleDraftFormDataValueChange}
                onBodyFormDataFilenameChange={handleDraftFormDataFilenameChange}
                onBodyFormDataAddField={addDraftFormDataField}
                onBodyFormDataRemoveField={removeDraftFormDataField}
                onBodyPrettify={prettifyDraftBody}
                onBodyMinify={minifyDraftBody}
                onBodyCopy={copyDraftBodyAction}
                onSave={saveRequestDetailsDraftAction}
                onDiscard={discardRequestDetailsDraft}
              />
              <Show
                when={!isResponseCollapsed()}
                fallback={
                  <aside class="min-h-0 bg-base-200/10 px-1 py-2">
                    <div class="flex h-full flex-col items-center gap-3">
                      <button
                        type="button"
                        class="btn btn-ghost btn-xs btn-square h-7 min-h-7 text-base-content/70 hover:text-base-content"
                        onClick={expandResponsePanel}
                        aria-label="Expand response panel"
                        title="Expand response panel"
                      >
                        <ChevronRightIcon class="size-3 rotate-180" />
                      </button>
                      <span class="[writing-mode:vertical-rl] text-[11px] font-mono uppercase tracking-[0.08em] text-base-content/55">
                        Response
                      </span>
                    </div>
                  </aside>
                }
              >
                <ResponseBodyPanel
                  onCollapse={collapseResponsePanel}
                  response={latestExecution()?.response}
                  durationMs={latestExecution()?.timing.durationMs}
                  isExecuting={isSending()}
                  error={executionError()}
                />
              </Show>
            </div>
          </div>
        </Show>
      </section>
    </main>
  );
}
