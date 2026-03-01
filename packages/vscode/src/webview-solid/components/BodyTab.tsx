import { createMemo, Show } from 'solid-js';
import type { ExecutionResult } from '../../execution/types';
import { formatBodyContent } from '../../webview/utils/body';
import { escapeHtml } from '../../webview/utils/format';

type BodyTabProps = {
  result: ExecutionResult;
};

export function BodyTab(props: BodyTabProps) {
  const bodyContent = createMemo(() => formatBodyContent(props.result));
  const renderedBody = createMemo(() => {
    const content = bodyContent().content;
    if (!content) {
      return '';
    }
    return bodyContent().highlighted ? content : escapeHtml(content);
  });

  return (
    <>
      <Show when={bodyContent().binary}>
        <div class="notice">Binary payload shown as base64.</div>
      </Show>
      <Show when={props.result.response.truncated}>
        <div class="notice">Body truncated by t-req.maxBodyBytes.</div>
      </Show>
      <Show when={bodyContent().content} fallback={<div class="empty">No response body</div>}>
        <pre innerHTML={renderedBody()} />
      </Show>
    </>
  );
}
