import { createEffect, createMemo, createSignal, For, onCleanup, Show } from 'solid-js';
import type { ScrollBoxRenderable } from '@opentui/core';
import { useKeyboard } from '@opentui/solid';
import { useDialog } from '../context';
import type { StreamMessage, StreamState } from '../stream';
import { theme, rgba, getMethodColor } from '../theme';
import { normalizeKey } from '../util/normalize-key';
import { HighlightedContent } from './highlighted-content';

export interface StreamViewProps {
  stream: StreamState;
  onDisconnect: () => void;
}

function formatTime(ts: number): string {
  const d = new Date(ts);
  const h = String(d.getHours()).padStart(2, '0');
  const m = String(d.getMinutes()).padStart(2, '0');
  const s = String(d.getSeconds()).padStart(2, '0');
  const ms = String(d.getMilliseconds()).padStart(3, '0');
  return `${h}:${m}:${s}.${ms}`;
}

function formatElapsed(startedAt: number | undefined, endedAt: number | undefined): string {
  if (!startedAt) return '';
  const end = endedAt ?? Date.now();
  const totalSec = Math.floor((end - startedAt) / 1000);
  const min = Math.floor(totalSec / 60);
  const sec = totalSec % 60;
  if (min > 0) return `${min}m ${sec}s`;
  return `${sec}s`;
}

function formatMessageData(msg: StreamMessage): string {
  if (msg.isJson) {
    try {
      return JSON.stringify(JSON.parse(msg.data), null, 2);
    } catch {
      return msg.data;
    }
  }
  return msg.data;
}

function getStatusDotColor(status: StreamState['connectionStatus']): string {
  switch (status) {
    case 'connected':
      return theme.success;
    case 'connecting':
      return theme.warning;
    case 'error':
      return theme.error;
    case 'disconnected':
      return theme.textMuted;
  }
}

function getStatusLabel(status: StreamState['connectionStatus']): string {
  switch (status) {
    case 'connected':
      return 'Connected';
    case 'connecting':
      return 'Connecting...';
    case 'error':
      return 'Error';
    case 'disconnected':
      return 'Disconnected';
  }
}

function StreamStatusBar(props: { stream: StreamState }) {
  const [elapsed, setElapsed] = createSignal(
    formatElapsed(props.stream.startedAt, props.stream.endedAt)
  );

  // Update elapsed time every second while connected/connecting
  const timer = setInterval(() => {
    const status = props.stream.connectionStatus;
    if (status === 'connected' || status === 'connecting') {
      setElapsed(formatElapsed(props.stream.startedAt, undefined));
    } else {
      setElapsed(formatElapsed(props.stream.startedAt, props.stream.endedAt));
    }
  }, 1000);

  onCleanup(() => clearInterval(timer));

  const isActive = createMemo(
    () =>
      props.stream.connectionStatus === 'connected' ||
      props.stream.connectionStatus === 'connecting'
  );

  return (
    <box flexDirection="column" paddingLeft={2} paddingRight={1} flexShrink={0}>
      <box flexDirection="row" marginBottom={0}>
        <Show when={props.stream.requestMethod}>
          <text
            fg={rgba(getMethodColor(props.stream.requestMethod!))}
            attributes={1}
          >
            {props.stream.requestMethod}
          </text>
          <text fg={rgba(theme.text)}> </text>
        </Show>
        <text fg={rgba(theme.text)}>{props.stream.requestUrl ?? ''}</text>
      </box>

      <box flexDirection="row" gap={1} marginBottom={1}>
        <text fg={rgba(getStatusDotColor(props.stream.connectionStatus))}>
          {getStatusLabel(props.stream.connectionStatus)}
        </text>
        <text fg={rgba(theme.textMuted)}>
          {props.stream.messageCount} message{props.stream.messageCount !== 1 ? 's' : ''}
        </text>
        <Show when={elapsed()}>
          <text fg={rgba(theme.textMuted)}>{elapsed()}</text>
        </Show>
        <Show when={isActive()}>
          <text fg={rgba(theme.textMuted)}>[d] disconnect</text>
        </Show>
      </box>

      <Show when={props.stream.connectionStatus === 'error' && props.stream.errorMessage}>
        <box marginBottom={1}>
          <text fg={rgba(theme.error)}>Error: {props.stream.errorMessage}</text>
        </box>
      </Show>

      <Show
        when={
          props.stream.connectionStatus === 'disconnected' && props.stream.messageCount === 0
        }
      >
        <box marginBottom={1}>
          <text fg={rgba(theme.textMuted)}>Stream ended — 0 messages</text>
        </box>
      </Show>
    </box>
  );
}

function MessageMetaLine(props: { msg: StreamMessage }) {
  const metaParts = createMemo(() => {
    const parts: string[] = [];
    if (props.msg.meta.event !== undefined) parts.push(`event: ${props.msg.meta.event}`);
    if (props.msg.meta.id !== undefined) parts.push(`id: ${props.msg.meta.id}`);
    if (props.msg.meta.retry !== undefined) parts.push(`retry: ${props.msg.meta.retry}`);
    return parts.join('  ');
  });

  return (
    <box flexDirection="row" flexShrink={0}>
      <text fg={rgba(theme.textMuted)}>
        #{props.msg.index + 1}  {formatTime(props.msg.receivedAt)}
      </text>
      <Show when={metaParts()}>
        <text fg={rgba(theme.info)}>  {metaParts()}</text>
      </Show>
    </box>
  );
}

function StreamMessageList(props: { stream: StreamState }) {
  let scrollRef: ScrollBoxRenderable | undefined;

  // Auto-scroll to bottom when new messages arrive.
  // Each message is one <box> child; +1 when truncation banner is visible.
  createEffect(() => {
    const len = props.stream.messages.length;
    if (scrollRef && len > 0) {
      const hasBanner = props.stream.messageCount > len;
      scrollRef.scrollTo(len - 1 + (hasBanner ? 1 : 0));
    }
  });

  return (
    <scrollbox ref={(r) => (scrollRef = r)} flexGrow={1} paddingLeft={2} paddingRight={1}>
      <Show when={props.stream.messageCount > props.stream.messages.length}>
        <box flexShrink={0} marginBottom={1}>
          <text fg={rgba(theme.warning)}>
            Showing latest {props.stream.messages.length} of {props.stream.messageCount} messages
          </text>
        </box>
      </Show>
      <For each={props.stream.messages}>
        {(msg) => (
          <box flexDirection="column" flexShrink={0} marginBottom={1}>
            <MessageMetaLine msg={msg} />
            <box paddingLeft={2} flexShrink={0}>
              <HighlightedContent
                content={formatMessageData(msg)}
                filetype={msg.isJson ? 'json' : undefined}
              />
            </box>
          </box>
        )}
      </For>
    </scrollbox>
  );
}

export function StreamView(props: StreamViewProps) {
  const dialog = useDialog();

  const isActive = createMemo(
    () =>
      props.stream.connectionStatus === 'connected' ||
      props.stream.connectionStatus === 'connecting'
  );

  // Keyboard shortcut: 'd' to disconnect
  useKeyboard((evt) => {
    if (dialog.stack.length > 0) return;
    const key = normalizeKey(evt);

    if (key.name === 'd' && !key.ctrl && !key.meta && isActive()) {
      props.onDisconnect();
      evt.preventDefault();
    }
  });

  return (
    <box
      flexGrow={1}
      flexDirection="column"
      overflow="hidden"
      backgroundColor={rgba(theme.backgroundPanel)}
    >
      <box paddingLeft={2} paddingTop={1} paddingBottom={1} flexDirection="row">
        <text fg={rgba(theme.primary)} attributes={1}>
          Stream
        </text>
        <text fg={rgba(theme.textMuted)}> ({props.stream.protocol.toUpperCase()})</text>
      </box>

      <StreamStatusBar stream={props.stream} />
      <StreamMessageList stream={props.stream} />
    </box>
  );
}
