---
"@t-req/app": patch
"@t-req/core": patch
"@t-req/sdk": patch
---

Add WebSocket foundation support (protocol v1.1) across core, server, and SDK with a server-first model.

### Core (`@t-req/core`)
- Add `ws` as a first-class protocol (`http | sse | ws`).
- Add WebSocket protocol options and parsing support:
  - `@ws`
  - `@ws-subprotocols`
  - `@ws-connect-timeout`
  - auto-detection for `ws://` and `wss://`.
- Preserve existing HTTP/SSE behavior.

### App (`@t-req/app`)
- Add WebSocket execution and session endpoints:
  - `POST /execute/ws`
  - `GET /ws/session/{wsSessionId}`
  - `GET /event/ws`.
- Add observer WebSocket transport alongside existing SSE `/event` (no SSE regression).
- Add bounded replay support via `afterSeq` for observer and session sockets.
- Update capabilities to protocol version `1.1` and WebSocket feature flags.

### SDK (`@t-req/sdk`)
- Regenerate SDK from updated OpenAPI with WebSocket endpoints.
- Add typed manual WebSocket helpers:
  - `connectObserverWs`
  - `connectRequestWsSession`
  - `executeAndConnectRequestWs`
- Add reconnect/resume support with `afterSeq` and typed envelope iteration.

### Compatibility notes
- This release is additive: existing `/execute`, `/execute/sse`, and `/event` flows continue to work.
- In protocol `1.1`, WebSocket `.http` definitions are connection metadata only (no request body/file/form-data execution).
- Binary WebSocket payloads remain unsupported in `1.1`.
