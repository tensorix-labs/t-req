import { Show } from 'solid-js';
import { syntaxStyle } from '../syntax';
import { rgba, theme } from '../theme';

export interface HighlightedContentProps {
  content: string;
  filetype?: string;
}

export function HighlightedContent(props: HighlightedContentProps) {
  return (
    <Show when={props.filetype} fallback={<text fg={rgba(theme.text)}>{props.content}</text>}>
      <code
        content={props.content}
        filetype={props.filetype as string}
        syntaxStyle={syntaxStyle}
        fg={rgba(theme.text)}
      />
    </Show>
  );
}
