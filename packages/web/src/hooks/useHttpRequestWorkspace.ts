import type { TreqClient } from '@t-req/sdk/client';
import { type Accessor, createEffect, createMemo, createSignal, on } from 'solid-js';
import {
  useRequestBodyDraftController,
  useRequestHeaderDraftController,
  useRequestParamDraftController,
  useRequestParseDetails
} from '../components/request-workspace';
import type { WorkspaceRequest } from '../sdk';
import type { WorkspaceStore } from '../stores/workspace';
import { toRequestParams } from '../utils/request-details';
import { buildUrlWithQueryRows } from '../utils/request-editing';

interface UseHttpRequestWorkspaceInput {
  path: Accessor<string>;
  client: Accessor<TreqClient | null>;
  workspace: WorkspaceStore;
}

// Structured API with domain grouping
export interface HttpRequestWorkspaceState {
  // Core request selection state
  selection: {
    index: Accessor<number>;
    setIndex: (index: number) => void;
    selected: Accessor<WorkspaceRequest | undefined>;
    hasSelection: Accessor<boolean>;
  };
  // All requests in current file
  requests: {
    all: Accessor<WorkspaceRequest[]>;
    count: Accessor<number>;
    hasRequests: Accessor<boolean>;
  };
  // Draft controllers for editing
  drafts: {
    parse: ReturnType<typeof useRequestParseDetails>;
    param: ReturnType<typeof useRequestParamDraftController>;
    header: ReturnType<typeof useRequestHeaderDraftController>;
    body: ReturnType<typeof useRequestBodyDraftController>;
  };
  // Actions/operations
  actions: {
    reset: () => void;
  };
}

export function useHttpRequestWorkspace(
  input: UseHttpRequestWorkspaceInput
): HttpRequestWorkspaceState {
  const [selectedRequestIndex, setSelectedRequestIndex] = createSignal(0);

  const requests = createMemo<WorkspaceRequest[]>(() => {
    const path = input.path();
    return input.workspace.requestsByPath()[path] ?? [];
  });

  const selectedRequest = createMemo<WorkspaceRequest | undefined>(() => {
    const allRequests = requests();
    if (allRequests.length === 0) {
      return undefined;
    }
    return allRequests[selectedRequestIndex()];
  });

  const hasRequests = () => requests().length > 0;
  const requestCount = () => requests().length;
  const hasSelection = () => selectedRequest() !== undefined;

  const parseDetails = useRequestParseDetails({
    client: input.client,
    path: input.path,
    requestIndex: () => selectedRequest()?.index
  });

  const sourceParams = createMemo(() => {
    const request = selectedRequest();
    if (!request) {
      return [];
    }

    return toRequestParams(request.url);
  });

  let paramDraftRef: ReturnType<typeof useRequestParamDraftController> | undefined;

  // Keep cross-tab edits in sync: header saves include unsaved param drafts when present.
  const sourceUrlForHeaderSave = () => {
    const requestUrl = selectedRequest()?.url;
    if (!requestUrl) {
      return undefined;
    }

    const paramDraft = paramDraftRef;
    if (!paramDraft || !paramDraft.isDirty()) {
      return requestUrl;
    }

    return buildUrlWithQueryRows(requestUrl, paramDraft.draftParams());
  };

  const headerDraft = useRequestHeaderDraftController({
    path: input.path,
    selectedRequest,
    sourceHeaders: parseDetails.headers,
    sourceUrl: sourceUrlForHeaderSave,
    getFileContent: () => {
      const path = input.path();
      return input.workspace.fileContents()[path]?.content;
    },
    setFileContent: (content: string) => {
      const path = input.path();
      input.workspace.updateFileContent(path, content);
    },
    saveFile: (path: string) => input.workspace.saveFile(path),
    reloadRequests: (path: string) => input.workspace.loadRequests(path),
    refetchRequestDetails: parseDetails.refetch
  });

  const paramDraft = useRequestParamDraftController({
    path: input.path,
    selectedRequest,
    sourceParams,
    // Keep cross-tab edits in sync: param saves include unsaved header drafts when present.
    sourceHeaders: () =>
      headerDraft.isDirty() ? headerDraft.draftHeaders() : parseDetails.headers(),
    sourceUrl: () => selectedRequest()?.url,
    getFileContent: () => {
      const path = input.path();
      return input.workspace.fileContents()[path]?.content;
    },
    setFileContent: (content: string) => {
      const path = input.path();
      input.workspace.updateFileContent(path, content);
    },
    saveFile: (path: string) => input.workspace.saveFile(path),
    reloadRequests: (path: string) => input.workspace.loadRequests(path),
    refetchRequestDetails: parseDetails.refetch
  });
  paramDraftRef = paramDraft;

  const bodyDraft = useRequestBodyDraftController({
    path: input.path,
    selectedRequest,
    sourceBody: parseDetails.bodySummary,
    requestDiagnostics: parseDetails.diagnostics,
    getFileContent: () => {
      const path = input.path();
      return input.workspace.fileContents()[path]?.content;
    },
    setFileContent: (content: string) => {
      const path = input.path();
      input.workspace.updateFileContent(path, content);
    },
    saveFile: (path: string) => input.workspace.saveFile(path),
    reloadRequests: (path: string) => input.workspace.loadRequests(path),
    refetchRequestDetails: parseDetails.refetch
  });

  // Keep selected index valid as request lists change after edits/saves.
  const validateAndAdjustIndex = () => {
    const totalRequests = requests().length;
    if (totalRequests === 0) {
      if (selectedRequestIndex() !== 0) {
        setSelectedRequestIndex(0);
      }
      return;
    }

    if (selectedRequestIndex() >= totalRequests) {
      setSelectedRequestIndex(totalRequests - 1);
    }
  };

  createEffect(
    on(
      () => requests().length,
      () => validateAndAdjustIndex()
    )
  );

  const reset = () => {
    setSelectedRequestIndex(0);
  };

  return {
    selection: {
      index: selectedRequestIndex,
      setIndex: setSelectedRequestIndex,
      selected: selectedRequest,
      hasSelection
    },
    requests: {
      all: requests,
      count: requestCount,
      hasRequests
    },
    drafts: {
      parse: parseDetails,
      param: paramDraft,
      header: headerDraft,
      body: bodyDraft
    },
    actions: {
      reset
    }
  };
}
