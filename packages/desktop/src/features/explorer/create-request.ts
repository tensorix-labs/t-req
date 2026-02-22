export type CreateWorkspaceItemKind = 'http' | 'sse' | 'ws' | 'grpc' | 'collection' | 'environment';

export type CreateRequestKind = 'http' | 'sse' | 'ws';

export type CreateWorkspaceItemOption = {
  kind: CreateWorkspaceItemKind;
  label: string;
  description: string;
  disabled: boolean;
};

export const DEFAULT_CREATE_WORKSPACE_ITEM_KIND: CreateRequestKind = 'http';

export const CREATE_WORKSPACE_ITEM_OPTIONS: readonly CreateWorkspaceItemOption[] = [
  {
    kind: 'http',
    label: 'HTTP',
    description: 'Standard HTTP request',
    disabled: false
  },
  {
    kind: 'sse',
    label: 'SSE',
    description: 'Server-sent events stream',
    disabled: false
  },
  {
    kind: 'ws',
    label: 'WebSocket',
    description: 'WebSocket request definition',
    disabled: false
  },
  {
    kind: 'grpc',
    label: 'gRPC',
    description: 'gRPC request definition',
    disabled: true
  },
  {
    kind: 'collection',
    label: 'Collection',
    description: 'Request collection scaffold',
    disabled: true
  },
  {
    kind: 'environment',
    label: 'Environment',
    description: 'Environment scaffold',
    disabled: true
  }
];

const ENABLED_CREATE_KIND_SET = new Set<CreateWorkspaceItemKind>(['http', 'sse', 'ws']);

export function isCreateRequestKind(kind: CreateWorkspaceItemKind): kind is CreateRequestKind {
  return ENABLED_CREATE_KIND_SET.has(kind);
}

export function getRequestTemplate(kind: CreateRequestKind): string {
  switch (kind) {
    case 'http':
      return 'GET https://api.example.com\n';
    case 'sse':
      return '# @sse\nGET https://api.example.com/events\nAccept: text/event-stream\n';
    case 'ws':
      return '# @ws\nGET wss://echo.websocket.events\n';
    default: {
      const _never: never = kind;
      return _never;
    }
  }
}
