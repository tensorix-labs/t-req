export const REQUEST_WORKSPACE_TABS = ['params', 'headers', 'body'] as const;

export type RequestWorkspaceTabId = (typeof REQUEST_WORKSPACE_TABS)[number];

export const DEFAULT_REQUEST_WORKSPACE_TAB: RequestWorkspaceTabId = 'params';

const requestWorkspaceTabSet = new Set<RequestWorkspaceTabId>(REQUEST_WORKSPACE_TABS);

export function isRequestWorkspaceTabId(value: string): value is RequestWorkspaceTabId {
  return requestWorkspaceTabSet.has(value as RequestWorkspaceTabId);
}
