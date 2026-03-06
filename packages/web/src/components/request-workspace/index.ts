// Model exports
export {
  DEFAULT_REQUEST_WORKSPACE_TAB,
  isRequestWorkspaceTabId,
  REQUEST_WORKSPACE_TABS,
  type RequestWorkspaceTabId
} from './model';

// Panel component exports
export { BodyPanel } from './panels/body';
export { HeadersPanel } from './panels/headers';
export { ParamsPanel } from './panels/params';

// Shared panel component exports
export {
  DraftHeader,
  ErrorBanner,
  KeyValueTable
} from './panels/shared';

// Legacy panel component exports (re-exported from new locations)
export {
  RequestWorkspaceBodyPanel,
  RequestWorkspaceHeadersPanel,
  RequestWorkspaceParamsPanel
} from './request-workspace-tab-panels';
// Legacy exports (keep for backward compatibility)
export { RequestWorkspaceTabs } from './request-workspace-tabs';
export { useRequestBodyDraftController } from './use-request-body-draft-controller';
export { useRequestHeaderDraftController } from './use-request-header-draft-controller';
export { useRequestParseDetails } from './use-request-parse-details';
