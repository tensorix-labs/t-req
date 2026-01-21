import { createMemo } from 'solid-js';
import type { WorkspaceRequest } from '../sdk';
import { theme, rgba, getMethodColor } from '../theme';

export interface RequestListProps {
  requests: WorkspaceRequest[];
  selectedFile?: string;
  isLoading: boolean;
}

export function RequestList(props: RequestListProps) {
  // Single request (0 or 1)
  const request = createMemo(() => props.requests[0]);

  // What to display
  const message = createMemo(() => {
    if (props.isLoading) return 'Loading...';
    if (!props.selectedFile) return 'Select a file to view requests';
    if (!request()) return 'No requests in this file';
    return null; // Show request instead
  });

  return (
    <box flexGrow={1} flexShrink={0} flexDirection="column" backgroundColor={rgba(theme.backgroundPanel)}>
      <box paddingLeft={2} paddingTop={1} paddingBottom={1}>
        <text fg={rgba(theme.primary)} attributes={1}>
          Requests
        </text>
      </box>
      <scrollbox flexGrow={1} paddingLeft={1} paddingRight={1}>
        <box id="content" height={1} flexShrink={0} flexDirection="row" paddingLeft={1} paddingRight={1}>
          <text
            fg={rgba(message() ? theme.textMuted : getMethodColor(request()?.method ?? 'GET'))}
            attributes={message() ? 0 : 1}
          >
            {message() ?? request()?.method.toUpperCase().padEnd(6)}
          </text>
          <text fg={rgba(theme.text)}>
            {message() ? '' : (request()?.name || request()?.url)}
          </text>
        </box>
      </scrollbox>
    </box>
  );
}
