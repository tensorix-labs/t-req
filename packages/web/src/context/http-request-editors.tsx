import type { HttpRequestWorkspaceState } from '../hooks/use-http-request-workspace';
import { createSimpleContext } from '../utils/createSimpleContext';

// Context for HTTP request editor - provides workspace state to child components
// This eliminates prop drilling from HttpEditorWithExecution to RequestWorkspaceTabs

interface HttpRequestEditorContextProps extends Record<string, unknown> {
  store: HttpRequestWorkspaceState;
}

const context = createSimpleContext<HttpRequestWorkspaceState, HttpRequestEditorContextProps>({
  name: 'HttpRequestEditor',
  gate: false, // No async initialization needed
  init: (props) => props.store
});

export const useHttpRequestEditor = context.use;
export const HttpRequestEditorProvider = context.provider;
