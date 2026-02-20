# @t-req/sdk

## 0.1.3

### Patch Changes

- c3cf95e: Add WebSocket foundation support (protocol v1.1) across core, server, and SDK with a server-first model.

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

## 0.1.2

### Patch Changes

- b0150a2: Add source-agnostic import preview/apply server endpoints

  - `POST /import/{source}/preview` — convert and preview filesystem changes without writing
  - `POST /import/{source}/apply` — convert and apply with conflict resolution, variable merge, staging
  - Parameterized `{source}` path validated against importer registry (initially: `postman`)
  - `convertOptions` validated per-importer via `optionsSchema`
  - Script-scoped tokens blocked (403)
  - Error diagnostics gate apply unless `force: true` (422)
  - Partial commit failures return 207 with `partialResult`
  - SDK regenerated: `TreqClient.importPreview()` and `TreqClient.importApply()`

## 0.1.1

### Patch Changes

- bfc6f68: New API (pluginsReports) in server resposnes + SDK types. Adds plugin report fields to display in TUI/Web

## 0.1.0

### Minor Changes

- 7f32a00: @t-req/sdk: Add TypeScript SDK with client, server spawner, and SSE streaming support
  @t-req/app: Migrate TUI to @t-req/sdk clietn and add OpenAPI spec export
