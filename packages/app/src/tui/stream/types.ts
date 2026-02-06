/** Supported streaming protocols — extend this union as new protocols are added */
export type StreamProtocol = 'sse'; // future: | 'websocket' | 'grpc' | 'graphql'

/** Universal connection lifecycle for all streaming protocols */
export type StreamConnectionStatus = 'connecting' | 'connected' | 'disconnected' | 'error';

/**
 * A single message received on a stream.
 * `meta` holds protocol-specific fields:
 *   SSE:       { event?, id?, retry? }
 *   WebSocket: { opcode? }  (future)
 *   gRPC:      { method?, status? }  (future)
 */
export interface StreamMessage {
  index: number;
  receivedAt: number;
  data: string;
  isJson: boolean;
  meta: Record<string, string | number | undefined>;
}

/** Full state of an active or completed stream */
export interface StreamState {
  protocol: StreamProtocol;
  connectionStatus: StreamConnectionStatus;
  messages: StreamMessage[];
  messageCount: number;
  startedAt: number | undefined;
  endedAt: number | undefined;
  errorMessage?: string;
  requestMethod?: string;
  requestUrl?: string;
}

export const MAX_STREAM_MESSAGES = 500;
