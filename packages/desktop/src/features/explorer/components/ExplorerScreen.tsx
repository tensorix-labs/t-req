import {
  importCurlApply,
  importCurlPreview,
  type PostExecuteResponses,
  unwrap
} from '@t-req/sdk/client';
import { createMemo, createResource, createSignal, Show } from 'solid-js';
import { createStore } from 'solid-js/store';
import { useServer } from '../../../context/server-context';
import { useConfigSummary } from '../../../hooks/useConfigSummary';
import { toErrorMessage } from '../../../lib/errors';
import {
  type CreateWorkspaceItemKind,
  DEFAULT_CREATE_WORKSPACE_ITEM_KIND,
  getRequestTemplate,
  isCreateRequestKind
} from '../create-request';
import { FALLBACK_REQUEST_METHOD, FALLBACK_REQUEST_URL } from '../request-line';
import { useExplorerStore } from '../use-explorer-store';
import { useRequestDraftController } from '../use-request-draft-controller';
import {
  type CurlImportConflictPolicy,
  type CurlImportDiagnostics,
  type CurlImportStats,
  type CurlImportSummary,
  normalizeCurlImportApplyOutcome,
  normalizeCurlImportPreviewOutcome,
  resolveCurlImportInput
} from '../utils/curl-import';
import { formatJsonBodyText, validateJsonBodyText } from '../utils/json-body';
import { buildCreateFilePath, toCreateHttpPath } from '../utils/mutations';
import { parentDirectory } from '../utils/path';
import {
  findRequestBlock,
  toRequestBodySummary,
  toRequestHeaders,
  toRequestParams
} from '../utils/request-details';
import { cloneFormDataFields } from '../utils/request-form-data';
import { isHttpProtocol, type RequestOption, toRequestOption } from '../utils/request-workspace';
import {
  analyzeTemplateUsage,
  buildTemplatePreviewVariables,
  interpolateTemplatePreview,
  resolveTemplateTokenFromVariables,
  type TemplateToken
} from '../utils/template-variables';
import { CreateRequestDialog } from './CreateRequestDialog';
import { CurlImportDialog } from './CurlImportDialog';
import { ExplorerSidebarPanel } from './ExplorerSidebarPanel';
import { RequestWorkspacePanel } from './workspace';

export default function ExplorerScreen() {
  const DEFAULT_CURL_IMPORT_OUTPUT_DIR = 'curl-import';
  const DEFAULT_CURL_IMPORT_CONFLICT_POLICY: CurlImportConflictPolicy = 'fail';

  const server = useServer();
  const explorer = useExplorerStore();
  const templateConfigQuery = createMemo(() => ({
    enabled: Boolean(server.client()),
    client: server.client(),
    profile: undefined
  }));
  const { config: templateConfig } = useConfigSummary(templateConfigQuery);
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
  const [curlImportDialog, setCurlImportDialog] = createStore<{
    isOpen: boolean;
    command: string;
    outputDir: string;
    onConflict: CurlImportConflictPolicy;
    fileName: string;
    requestName: string;
    mergeVariables: boolean;
    force: boolean;
    advancedOpen: boolean;
    isPreviewing: boolean;
    isApplying: boolean;
    previewKey: string | undefined;
    previewSummary: CurlImportSummary | undefined;
    previewDiagnostics: CurlImportDiagnostics;
    previewStats: CurlImportStats | undefined;
    previewDiagnosticsBlocked: boolean;
    previewError: string | undefined;
    applyResult:
      | {
          kind: 'success' | 'partial';
          summary: CurlImportSummary;
        }
      | undefined;
    applyError: string | undefined;
  }>({
    isOpen: false,
    command: '',
    outputDir: DEFAULT_CURL_IMPORT_OUTPUT_DIR,
    onConflict: DEFAULT_CURL_IMPORT_CONFLICT_POLICY,
    fileName: '',
    requestName: '',
    mergeVariables: false,
    force: false,
    advancedOpen: false,
    isPreviewing: false,
    isApplying: false,
    previewKey: undefined,
    previewSummary: undefined,
    previewDiagnostics: [],
    previewStats: undefined,
    previewDiagnosticsBlocked: false,
    previewError: undefined,
    applyResult: undefined,
    applyError: undefined
  });
  const [selectedRequestIndex, setSelectedRequestIndex] = createSignal(0);
  const [isSending, setIsSending] = createSignal(false);
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
  const {
    draftRequestKey,
    draftUrl,
    draftParams,
    draftHeaders,
    draftBodyMode,
    draftBody,
    draftFormData,
    isDetailsDirty,
    detailsSaveError,
    handleDraftUrlChange,
    handleDraftParamChange,
    handleDraftHeaderChange,
    handleDraftBodyChange,
    handleDraftBodyModeChange,
    handleDraftFormDataNameChange,
    handleDraftFormDataTypeChange,
    handleDraftFormDataValueChange,
    handleDraftFormDataFilenameChange,
    addDraftFormDataField,
    removeDraftFormDataField,
    addDraftParam,
    removeDraftParam,
    addDraftHeader,
    removeDraftHeader,
    discardRequestDetailsDraft,
    saveRequestDetailsDraft
  } = useRequestDraftController({
    requestDraftKey,
    requestSourceUrl,
    requestSourceParams,
    requestSourceHeaders,
    requestSourceBody,
    requestSourceFormData,
    selectedRequest,
    getFileDraftContent: () => explorer.fileDraftContent(),
    setFileDraftContent: (content) => explorer.setFileDraftContent(content),
    saveSelectedFile: () => explorer.saveSelectedFile(),
    refetchParsedRequestFile: () => refetchParsedRequestFile()
  });

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
    const key = requestDraftKey();
    if (!key) {
      return FALLBACK_REQUEST_URL;
    }

    if (draftRequestKey() !== key) {
      return requestSourceUrl() ?? FALLBACK_REQUEST_URL;
    }

    return draftUrl();
  });
  const templatePreviewVariables = createMemo(() =>
    buildTemplatePreviewVariables({
      resolvedVariables: templateConfig()?.resolvedConfig.variables,
      draftContent: explorer.fileDraftContent() ?? ''
    })
  );
  const resolveTemplateToken = (token: TemplateToken) =>
    resolveTemplateTokenFromVariables(token, templatePreviewVariables());
  const templateRefreshKey = createMemo(() => {
    try {
      return JSON.stringify(templatePreviewVariables());
    } catch {
      return String(Object.keys(templatePreviewVariables()).length);
    }
  });
  const unresolvedUrlVariables = createMemo(
    () => analyzeTemplateUsage(requestUrl(), templatePreviewVariables()).unresolvedVariables
  );
  const resolvedUrlPreview = createMemo(() =>
    interpolateTemplatePreview(requestUrl(), templatePreviewVariables())
  );
  const unresolvedBodyVariables = createMemo(() => {
    if (draftBodyMode() !== 'inline') {
      return [];
    }
    return analyzeTemplateUsage(draftBody(), templatePreviewVariables()).unresolvedVariables;
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
    return (
      isBusy() ||
      isFileLoading() ||
      isRequestsLoading() ||
      isSavingFile() ||
      isSending() ||
      isDetailsDirty()
    );
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
  const isImportBusy = createMemo(
    () => curlImportDialog.isPreviewing || curlImportDialog.isApplying
  );
  const toCurlImportInput = () => ({
    command: curlImportDialog.command,
    outputDir: curlImportDialog.outputDir,
    onConflict: curlImportDialog.onConflict,
    fileName: curlImportDialog.fileName,
    requestName: curlImportDialog.requestName,
    mergeVariables: curlImportDialog.mergeVariables,
    force: curlImportDialog.force
  });
  const resolvedCurlImportInput = createMemo(() => resolveCurlImportInput(toCurlImportInput()));
  const hasCurrentPreviewForImport = createMemo(() => {
    const resolved = resolvedCurlImportInput();
    if (!resolved.ok) {
      return false;
    }

    if (curlImportDialog.previewKey !== resolved.value.previewKey) {
      return false;
    }

    return Boolean(curlImportDialog.previewStats);
  });
  const canApplyCurlImport = createMemo(() => {
    if (isImportBusy()) {
      return false;
    }

    if (!hasCurrentPreviewForImport()) {
      return false;
    }

    if (curlImportDialog.previewDiagnosticsBlocked && !curlImportDialog.force) {
      return false;
    }

    return true;
  });

  const createCurlImportDialogState = (
    outputDir: string,
    isOpen: boolean
  ): typeof curlImportDialog => ({
    isOpen,
    command: '',
    outputDir,
    onConflict: DEFAULT_CURL_IMPORT_CONFLICT_POLICY,
    fileName: '',
    requestName: '',
    mergeVariables: false,
    force: false,
    advancedOpen: false,
    isPreviewing: false,
    isApplying: false,
    previewKey: undefined,
    previewSummary: undefined,
    previewDiagnostics: [],
    previewStats: undefined,
    previewDiagnosticsBlocked: false,
    previewError: undefined,
    applyResult: undefined,
    applyError: undefined
  });

  const clearCurlImportApplyOutcome = () => {
    setCurlImportDialog({
      applyResult: undefined,
      applyError: undefined
    });
  };

  const clearCurlImportPreviewOutcome = () => {
    setCurlImportDialog({
      previewKey: undefined,
      previewSummary: undefined,
      previewDiagnostics: [],
      previewStats: undefined,
      previewDiagnosticsBlocked: false,
      previewError: undefined,
      applyResult: undefined,
      applyError: undefined
    });
  };

  const withSelectedImportOutputDir = (): string => {
    const path = selectedPath();
    if (path && selectedIsDirectory()) {
      return path;
    }

    if (path) {
      const parent = parentDirectory(path);
      if (parent) {
        return parent;
      }
    }

    return DEFAULT_CURL_IMPORT_OUTPUT_DIR;
  };

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

  const openCurlImportDialog = () => {
    setCurlImportDialog(createCurlImportDialogState(withSelectedImportOutputDir(), true));
  };

  const closeCurlImportDialog = () => {
    if (isImportBusy()) {
      return;
    }
    setCurlImportDialog('isOpen', false);
  };

  const handleCurlImportCommandChange = (value: string) => {
    setCurlImportDialog('command', value);
    clearCurlImportPreviewOutcome();
  };

  const handleCurlImportOutputDirChange = (value: string) => {
    setCurlImportDialog('outputDir', value);
    clearCurlImportPreviewOutcome();
  };

  const handleCurlImportConflictChange = (value: CurlImportConflictPolicy) => {
    setCurlImportDialog('onConflict', value);
    clearCurlImportPreviewOutcome();
  };

  const handleCurlImportFileNameChange = (value: string) => {
    setCurlImportDialog('fileName', value);
    clearCurlImportPreviewOutcome();
  };

  const handleCurlImportRequestNameChange = (value: string) => {
    setCurlImportDialog('requestName', value);
    clearCurlImportPreviewOutcome();
  };

  const handleCurlImportMergeVariablesChange = (checked: boolean) => {
    setCurlImportDialog('mergeVariables', checked);
    clearCurlImportApplyOutcome();
  };

  const handleCurlImportForceChange = (checked: boolean) => {
    setCurlImportDialog('force', checked);
    clearCurlImportApplyOutcome();
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

  const previewCurlImport = async () => {
    const client = server.client();
    if (!client) {
      return;
    }

    const resolvedInput = resolveCurlImportInput(toCurlImportInput());
    if (!resolvedInput.ok) {
      setCurlImportDialog('previewError', resolvedInput.error);
      return;
    }

    setCurlImportDialog({
      isPreviewing: true,
      previewError: undefined,
      applyError: undefined,
      applyResult: undefined
    });

    try {
      const response = await importCurlPreview(client, resolvedInput.value.previewRequest);
      const normalized = normalizeCurlImportPreviewOutcome(response);
      if (normalized.kind === 'success') {
        setCurlImportDialog({
          previewKey: resolvedInput.value.previewKey,
          previewSummary: normalized.data.result,
          previewDiagnostics: normalized.data.diagnostics,
          previewStats: normalized.data.stats,
          previewDiagnosticsBlocked: false,
          previewError: undefined,
          applyError: undefined,
          applyResult: undefined
        });
        return;
      }

      if (normalized.kind === 'diagnostics') {
        setCurlImportDialog({
          previewKey: resolvedInput.value.previewKey,
          previewSummary: undefined,
          previewDiagnostics: normalized.data.diagnostics,
          previewStats: normalized.data.stats,
          previewDiagnosticsBlocked: true,
          previewError: normalized.data.message,
          applyError: undefined,
          applyResult: undefined
        });
        return;
      }

      setCurlImportDialog({
        previewKey: undefined,
        previewSummary: undefined,
        previewDiagnostics: [],
        previewStats: undefined,
        previewDiagnosticsBlocked: false,
        previewError: normalized.message
      });
    } catch (error) {
      setCurlImportDialog('previewError', `Failed to preview import: ${toErrorMessage(error)}`);
    } finally {
      setCurlImportDialog('isPreviewing', false);
    }
  };

  const applyCurlImport = async () => {
    const client = server.client();
    if (!client) {
      return;
    }

    const resolvedInput = resolveCurlImportInput(toCurlImportInput());
    if (!resolvedInput.ok) {
      setCurlImportDialog('applyError', resolvedInput.error);
      return;
    }

    if (
      curlImportDialog.previewKey !== resolvedInput.value.previewKey ||
      !hasCurrentPreviewForImport()
    ) {
      setCurlImportDialog('applyError', 'Run preview with the current inputs before applying.');
      return;
    }

    if (curlImportDialog.previewDiagnosticsBlocked && !curlImportDialog.force) {
      setCurlImportDialog(
        'applyError',
        'Preview contains error diagnostics. Enable force before applying.'
      );
      return;
    }

    setCurlImportDialog({
      isApplying: true,
      applyError: undefined,
      applyResult: undefined
    });

    try {
      const response = await importCurlApply(client, resolvedInput.value.applyRequest);
      const normalized = normalizeCurlImportApplyOutcome(response);

      if (normalized.kind === 'success') {
        setCurlImportDialog({
          previewKey: resolvedInput.value.previewKey,
          previewSummary: normalized.data.result,
          previewDiagnostics: normalized.data.diagnostics,
          previewStats: normalized.data.stats,
          previewDiagnosticsBlocked: false,
          previewError: undefined,
          applyResult: {
            kind: 'success',
            summary: normalized.data.result
          },
          applyError: undefined
        });

        await explorer.refresh();
        const firstWritten = normalized.data.result.written[0];
        if (firstWritten) {
          handleSelectFile(firstWritten);
        }
        setCurlImportDialog('isOpen', false);
        return;
      }

      if (normalized.kind === 'partial') {
        setCurlImportDialog({
          applyResult: {
            kind: 'partial',
            summary: normalized.data.partialResult
          },
          applyError: 'Import completed with partial failures. Review failed entries below.'
        });
        await explorer.refresh();
        const firstWritten = normalized.data.partialResult.written[0];
        if (firstWritten) {
          handleSelectFile(firstWritten);
        }
        return;
      }

      if (normalized.kind === 'diagnostics') {
        setCurlImportDialog({
          previewKey: resolvedInput.value.previewKey,
          previewSummary: undefined,
          previewDiagnostics: normalized.data.diagnostics,
          previewStats: normalized.data.stats,
          previewDiagnosticsBlocked: true,
          previewError: normalized.data.message,
          applyError: normalized.data.message,
          applyResult: undefined
        });
        return;
      }

      setCurlImportDialog({
        applyError: normalized.message,
        applyResult: undefined
      });
    } catch (error) {
      setCurlImportDialog('applyError', `Failed to apply import: ${toErrorMessage(error)}`);
    } finally {
      setCurlImportDialog('isApplying', false);
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
        closeCurlImportDialog();
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

    handleDraftBodyChange(result.text);
  };

  const minifyDraftBody = () => {
    if (!isInlineJsonBodyMode()) {
      return;
    }

    const result = formatJsonBodyText(draftBody(), 'minify');
    if (!result.ok) {
      return;
    }

    handleDraftBodyChange(result.text);
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
  const previewCurlImportAction = () => void previewCurlImport();
  const applyCurlImportAction = () => void applyCurlImport();
  const sendSelectedRequestAction = () => void sendSelectedRequest();
  const copyDraftBodyAction = () => void copyDraftBody();
  const saveRequestDetailsDraftAction = () => void saveRequestDetailsDraft();

  return (
    <main
      class="flex-1 min-h-0 overflow-hidden grid grid-cols-[var(--explorer-grid-cols)] gap-0 px-2 pt-2 max-[960px]:grid-cols-1 max-[960px]:grid-rows-[var(--explorer-grid-rows-mobile)]"
      style={explorerGridStyle()}
    >
      <Show when={!isSidebarCollapsed()}>
        <ExplorerSidebarPanel
          onCreate={openCreateDialog}
          onImport={openCurlImportDialog}
          onRefresh={refreshExplorer}
          isRefreshing={explorer.isLoading()}
          isMutating={isBusy() || isImportBusy()}
          workspaceRoot={explorer.workspaceRoot()}
          loadError={explorer.error()}
          mutationError={mutationError()}
          isLoading={explorer.isLoading()}
          items={visibleItems()}
          selectedPath={selectedPath()}
          onToggleDir={handleToggleDirectory}
          onSelectFile={handleSelectFile}
        />
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

      <CurlImportDialog
        open={curlImportDialog.isOpen}
        command={curlImportDialog.command}
        outputDir={curlImportDialog.outputDir}
        onConflict={curlImportDialog.onConflict}
        fileName={curlImportDialog.fileName}
        requestName={curlImportDialog.requestName}
        mergeVariables={curlImportDialog.mergeVariables}
        force={curlImportDialog.force}
        advancedOpen={curlImportDialog.advancedOpen}
        isPreviewing={curlImportDialog.isPreviewing}
        isApplying={curlImportDialog.isApplying}
        canApply={canApplyCurlImport()}
        previewResult={curlImportDialog.previewSummary}
        previewDiagnostics={curlImportDialog.previewDiagnostics}
        previewStats={curlImportDialog.previewStats}
        previewDiagnosticsBlocked={curlImportDialog.previewDiagnosticsBlocked}
        previewError={curlImportDialog.previewError}
        applyResult={curlImportDialog.applyResult}
        applyError={curlImportDialog.applyError}
        onClose={closeCurlImportDialog}
        onCommandChange={handleCurlImportCommandChange}
        onOutputDirChange={handleCurlImportOutputDirChange}
        onConflictChange={handleCurlImportConflictChange}
        onFileNameChange={handleCurlImportFileNameChange}
        onRequestNameChange={handleCurlImportRequestNameChange}
        onMergeVariablesChange={handleCurlImportMergeVariablesChange}
        onForceChange={handleCurlImportForceChange}
        onToggleAdvanced={() => setCurlImportDialog('advancedOpen', (value) => !value)}
        onPreview={previewCurlImportAction}
        onApply={applyCurlImportAction}
      />

      <RequestWorkspacePanel
        isSidebarCollapsed={isSidebarCollapsed()}
        onToggleSidebarCollapsed={toggleSidebarCollapsed}
        selectedPath={selectedPath()}
        selectedRequestCount={selectedRequestCount()}
        fileLoadError={fileLoadError()}
        isFileLoading={isFileLoading()}
        requestsLoadError={requestsLoadError()}
        isRequestsLoading={isRequestsLoading()}
        unsupportedProtocolLabel={unsupportedProtocolLabel()}
        urlBarProps={{
          method: requestMethod(),
          url: requestUrl(),
          resolvedUrlPreview: resolvedUrlPreview(),
          requestOptions: requestOptions(),
          selectedRequestIndex: selectedRequestIndex(),
          onRequestIndexChange: handleRequestIndexChange,
          onUrlChange: handleDraftUrlChange,
          onSend: sendSelectedRequestAction,
          disabled: isBusy() || isFileLoading() || isRequestsLoading() || isSavingFile(),
          sendDisabled: sendDisabled(),
          isSending: isSending(),
          resolveTemplateToken,
          templateRefreshKey: templateRefreshKey(),
          unresolvedVariables: unresolvedUrlVariables()
        }}
        requestDetailsProps={{
          hasRequest: hasSelectedRequest(),
          params: draftParams(),
          headers: draftHeaders(),
          bodySummary: requestSourceBody(),
          bodyMode: draftBodyMode(),
          isJsonBodyMode: isInlineJsonBodyMode(),
          bodyDraft: draftBody(),
          formDataDraft: draftFormData(),
          bodyUnresolvedVariables: unresolvedBodyVariables(),
          bodyValidationError: bodyValidationError(),
          diagnostics: requestSourceDiagnostics(),
          fileDiagnostics: fileDiagnostics(),
          resolveTemplateToken,
          templateRefreshKey: templateRefreshKey(),
          isLoading: isRequestDetailsLoading(),
          error: requestDetailsError(),
          saveError: requestDetailsSaveError(),
          hasUnsavedChanges: isDetailsDirty(),
          isSaving: isSavingFile(),
          onParamChange: handleDraftParamChange,
          onHeaderChange: handleDraftHeaderChange,
          onAddParam: addDraftParam,
          onRemoveParam: removeDraftParam,
          onAddHeader: addDraftHeader,
          onRemoveHeader: removeDraftHeader,
          onBodyModeChange: handleDraftBodyModeChange,
          onBodyChange: handleDraftBodyChange,
          onBodyFormDataNameChange: handleDraftFormDataNameChange,
          onBodyFormDataTypeChange: handleDraftFormDataTypeChange,
          onBodyFormDataValueChange: handleDraftFormDataValueChange,
          onBodyFormDataFilenameChange: handleDraftFormDataFilenameChange,
          onBodyFormDataAddField: addDraftFormDataField,
          onBodyFormDataRemoveField: removeDraftFormDataField,
          onBodyPrettify: prettifyDraftBody,
          onBodyMinify: minifyDraftBody,
          onBodyCopy: copyDraftBodyAction,
          onSave: saveRequestDetailsDraftAction,
          onDiscard: discardRequestDetailsDraft
        }}
        requestPanelsStyle={requestPanelsStyle()}
        isResponseCollapsed={isResponseCollapsed()}
        onExpandResponsePanel={expandResponsePanel}
        onCollapseResponsePanel={collapseResponsePanel}
        response={latestExecution()?.response}
        responseDurationMs={latestExecution()?.timing.durationMs}
        isSending={isSending()}
        executionError={executionError()}
      />
    </main>
  );
}
