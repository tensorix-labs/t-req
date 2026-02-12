import { createMemo, Show } from 'solid-js';
import type { ExecutionResult } from '../../execution/types';
import { statusClass } from '../../webview/utils/body';
import { formatBytes, formatDuration } from '../../webview/utils/format';

type SummaryBarProps = {
  result: ExecutionResult;
  profile?: string;
};

export function SummaryBar(props: SummaryBarProps) {
  const durationLabel = createMemo(() => formatDuration(props.result.timing.durationMs));
  const ttfbLabel = createMemo(() =>
    props.result.timing.ttfb !== undefined ? `TTFB ${formatDuration(props.result.timing.ttfb)}` : ''
  );
  const sizeLabel = createMemo(() => formatBytes(props.result.response.bodyBytes));
  const profileLabel = createMemo(() => (props.profile ? `profile:${props.profile}` : ''));
  const warningLabel = createMemo(() => {
    const warnings = props.result.warnings.length;
    if (warnings === 0) return '';
    return `${warnings} warning${warnings === 1 ? '' : 's'}`;
  });
  const statusText = createMemo(() => props.result.response.statusText || '');

  return (
    <div class="summary">
      <span class={`status ${statusClass(props.result.response.status)}`}>
        <span>{props.result.response.status}</span>
        <span>{statusText()}</span>
      </span>
      <span class="tag">{durationLabel()}</span>
      <Show when={ttfbLabel()}>
        <span class="tag">{ttfbLabel()}</span>
      </Show>
      <span class="tag">
        {sizeLabel()}
        <Show when={props.result.response.truncated}> (truncated)</Show>
      </span>
      <span class="tag">{props.result.mode}</span>
      <Show when={profileLabel()}>
        <span class="tag">{profileLabel()}</span>
      </Show>
      <Show when={warningLabel()}>
        <span class="tag warning-tag">{warningLabel()}</span>
      </Show>
    </div>
  );
}
