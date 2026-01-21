import { For, Match, Show, Switch, createMemo } from 'solid-js';
import type { WorkspaceRequest } from '../sdk';
import { theme, rgba, getMethodColor } from '../theme';

export interface RequestListProps {
  requests: WorkspaceRequest[];
  selectedFile?: string;
  isLoading: boolean;
}

type ContentState = 'loading' | 'no-selection' | 'empty' | 'has-requests';

export function RequestList(props: RequestListProps) {
  const selectionKey = createMemo(() => props.selectedFile ?? '__none__');

  const contentState = createMemo((): ContentState => {
    if (props.isLoading) return 'loading';
    if (!props.selectedFile) return 'no-selection';
    if (props.requests.length === 0) return 'empty';
    return 'has-requests';
  });

  return (
    <box flexGrow={1} flexDirection="column" backgroundColor={rgba(theme.backgroundPanel)}>
      <box paddingLeft={2} paddingTop={1} paddingBottom={1}>
        <text fg={rgba(theme.primary)} attributes={1}>
          Requests
        </text>
      </box>
      <Show when={selectionKey()} keyed>
        {(key: string) => (
          <scrollbox id={`requests-scroll-${key}`} flexGrow={1} paddingLeft={1} paddingRight={1}>
            <Switch>
              <Match when={contentState() === 'loading'}>
                <box id={`state-loading-${key}`} height={1} flexShrink={0} paddingLeft={2}>
                  <text fg={rgba(theme.textMuted)}>Loading...</text>
                </box>
              </Match>
              <Match when={contentState() === 'no-selection'}>
                <box id={`state-no-selection-${key}`} height={1} flexShrink={0} paddingLeft={2}>
                  <text fg={rgba(theme.textMuted)}>Select a file to view requests</text>
                </box>
              </Match>
              <Match when={contentState() === 'empty'}>
                <box id={`state-empty-${key}`} height={1} flexShrink={0} paddingLeft={2}>
                  <text fg={rgba(theme.textMuted)}>No requests in this file</text>
                </box>
              </Match>
              <Match when={contentState() === 'has-requests'}>
                <For each={props.requests}>
                  {(request) => (
                    <box
                      id={`request-${key}-${request.index}`}
                      height={1}
                      flexShrink={0}
                      flexDirection="row"
                      paddingLeft={1}
                      paddingRight={1}
                    >
                      <text fg={rgba(getMethodColor(request.method))} attributes={1}>
                        {request.method.toUpperCase().padEnd(6)}
                      </text>
                      <text fg={rgba(theme.text)}>{request.name || request.url}</text>
                    </box>
                  )}
                </For>
              </Match>
            </Switch>
          </scrollbox>
        )}
      </Show>
    </box>
  );
}
