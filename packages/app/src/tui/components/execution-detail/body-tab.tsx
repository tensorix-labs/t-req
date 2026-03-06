import { Show } from 'solid-js';
import { rgba, theme } from '../../theme';
import { HighlightedContent } from '../highlighted-content';

export interface BodyTabProps {
  body: string;
  filetype?: string;
}

export function BodyTab(props: BodyTabProps) {
  return (
    <box id="body" flexDirection="column">
      <Show when={props.body} fallback={<text fg={rgba(theme.textMuted)}>No body content</text>}>
        <HighlightedContent content={props.body} filetype={props.filetype} />
      </Show>
    </box>
  );
}
