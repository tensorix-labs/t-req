import { describe, expect, it } from 'bun:test';
import {
  CREATE_WORKSPACE_ITEM_OPTIONS,
  getRequestTemplate,
  isCreateRequestKind
} from './create-request';

describe('CREATE_WORKSPACE_ITEM_OPTIONS', () => {
  it('marks only HTTP, SSE, and WebSocket as enabled', () => {
    const enabledKinds = CREATE_WORKSPACE_ITEM_OPTIONS.filter((option) => !option.disabled).map(
      (option) => option.kind
    );
    expect(enabledKinds).toEqual(['http', 'sse', 'ws']);
  });

  it('keeps gRPC, Collection, and Environment as disabled placeholders', () => {
    const disabledKinds = CREATE_WORKSPACE_ITEM_OPTIONS.filter((option) => option.disabled).map(
      (option) => option.kind
    );
    expect(disabledKinds).toEqual(['grpc', 'collection', 'environment']);
  });
});

describe('isCreateRequestKind', () => {
  it('returns true only for supported request kinds', () => {
    expect(isCreateRequestKind('http')).toBe(true);
    expect(isCreateRequestKind('sse')).toBe(true);
    expect(isCreateRequestKind('ws')).toBe(true);
    expect(isCreateRequestKind('grpc')).toBe(false);
    expect(isCreateRequestKind('collection')).toBe(false);
    expect(isCreateRequestKind('environment')).toBe(false);
  });
});

describe('getRequestTemplate', () => {
  it('returns a starter HTTP template', () => {
    expect(getRequestTemplate('http')).toBe('GET https://api.example.com\n');
  });

  it('returns an SSE template with directive and accept header', () => {
    expect(getRequestTemplate('sse')).toContain('# @sse');
    expect(getRequestTemplate('sse')).toContain('Accept: text/event-stream');
  });

  it('returns a WebSocket template with @ws directive', () => {
    expect(getRequestTemplate('ws')).toContain('# @ws');
    expect(getRequestTemplate('ws')).toContain('GET wss://echo.websocket.events');
  });
});
