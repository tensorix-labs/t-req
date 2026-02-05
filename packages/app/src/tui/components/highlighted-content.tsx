import { Show } from 'solid-js';
import { theme, rgba } from '../theme';
import { syntaxStyle } from '../syntax';

export interface HighlightedContentProps {
  content: string;
  filetype?: string;
}

export function HighlightedContent(props: HighlightedContentProps) {
  return (
    <Show
      when={props.filetype}
      fallback={<text fg={rgba(theme.text)}>{props.content}</text>}
    >
      <code
        content={props.content}
        filetype={props.filetype!}
        syntaxStyle={syntaxStyle}
        fg={rgba(theme.text)}
      />
    </Show>
  );
}
