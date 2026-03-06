// Model exports
export {
  DEFAULT_REQUEST_WORKSPACE_TAB,
  isRequestWorkspaceTabId,
  REQUEST_WORKSPACE_TABS,
  type RequestWorkspaceTabId
} from './model';
export { BodyPanel } from './panels/body';
export { HeadersPanel } from './panels/headers';
// New panel component exports
export { ParamsPanel } from './panels/params';
export {
  DraftHeader as SharedDraftHeader,
  ErrorBanner as SharedErrorBanner,
  KeyValueRow as SharedKeyValueRow,
  KeyValueTable as SharedKeyValueTable
} from './panels/shared';

// Legacy panel component exports (re-exported from new locations)
export {
  DraftHeader,
  ErrorBanner,
  KeyValueRow,
  KeyValueTable,
  RequestWorkspaceBodyPanel,
  RequestWorkspaceHeadersPanel,
  RequestWorkspaceParamsPanel
} from './request-workspace-tab-panels';
// Legacy exports (keep for backward compatibility)
export { RequestWorkspaceTabs } from './request-workspace-tabs';
export { useRequestBodyDraftController } from './use-request-body-draft-controller';
export { useRequestHeaderDraftController } from './use-request-header-draft-controller';
export { useRequestParseDetails } from './use-request-parse-details';
