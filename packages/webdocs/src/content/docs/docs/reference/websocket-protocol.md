---
title: WebSocket Protocol
description: Protocol v1.1 WebSocket model, endpoints, envelopes, and compatibility notes.
---

t-req protocol `1.1` adds additive WebSocket support with a server-first model:

- `.http` remains a connection definition format.
- The server owns upstream WebSocket connections.
- Clients interact with sessions through HTTP and WebSocket API endpoints.
- Existing HTTP/SSE behavior remains compatible.

## Protocol model

WebSocket requests are defined in `.http` as connection metadata only.

```http
# @ws
# @ws-subprotocols graphql-ws,json
# @ws-connect-timeout 30000
GET wss://api.example.com/graphql
Authorization: Bearer {{token}}
```

### Detection

WebSocket protocol is detected by:

1. `# @ws`
2. `ws://` or `wss://` URL scheme

Directives:

- `@ws`
- `@ws-subprotocols chat,json`
- `@ws-connect-timeout 30000`

### v1.1 body rule

In protocol `1.1`, WebSocket request definitions cannot include body, body file, or form-data.  
`POST /execute/ws` returns a validation error if these are present.

## Endpoints

### Execute WebSocket definition

- `POST /execute/ws`
- Parses and validates `.http` request selection.
- Opens upstream WebSocket.
- Returns session metadata:
  - `wsSessionId`
  - `downstreamPath`
  - `upstreamUrl`
  - negotiated subprotocol (if any)
  - replay metadata (`replayBufferSize`, `lastSeq`)

### Request session socket

- `GET /ws/session/{wsSessionId}` (WebSocket upgrade)
- Query: `afterSeq` (optional)
- Single downstream control socket per session.
- Supports bounded replay on reconnect.

### Observer event socket

- `GET /event/ws` (WebSocket upgrade)
- Same filtering semantics as SSE `/event`:
  - `sessionId`
  - `flowId`
- Optional replay query:
  - `afterSeq`

SSE `/event` remains fully supported.

## Envelope contracts

### Server -> client (request session)

- `session.opened`
- `session.inbound`
- `session.outbound`
- `session.closed`
- `session.error`
- `session.replay.end`

Each envelope includes:

- `type`
- `ts`
- `seq`
- `wsSessionId`
- optional `flowId`
- optional `reqExecId`
- optional payload metadata (`payloadType`, `encoding`, `byteLength`)

### Client -> server (request session)

- `session.send` (`payloadType: text | json`)
- `session.close`
- `session.ping`

## Replay semantics

- Replay is bounded in-memory ring buffer storage.
- Reconnect with `afterSeq` to resume.
- If `afterSeq` falls before retained history, server emits explicit replay-gap error envelope.

## Security and scope

- Existing bearer/script auth semantics apply.
- Script-token scope rules remain enforced.
- Observer subscriptions with auth enabled must include `sessionId` or `flowId`.

## Capabilities and versioning

- `protocolVersion: "1.1"`
- WebSocket capability flags:
  - `observerWebSocket: true`
  - `requestWebSocket: true`
  - `replayBuffer: true`
  - `binaryPayloads: false`

## Compatibility and non-goals

This release is additive:

- `/execute`, `/execute/sse`, and `/event` are unchanged.
- Existing SSE SDK flows remain valid.

Out of scope in `1.1`:

- Binary WebSocket frame payload support.
- Durable replay history beyond process memory.
- Client UI workflows (desktop/web/CLI UX is implemented separately from protocol foundations).
