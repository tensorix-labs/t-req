# @t-req/core

## 0.2.5

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

## 0.2.4

### Patch Changes

- bdd0556: Expand `RequestDefinition` with optional `description`, `bodyFile`, `formData`, and `directives` fields, making
  it structurally compatible with `SerializableRequest`. Implement `writeHttpFile` in CLI command context using
  `serializeDocument()`.
- 2cd3609: Add deterministic `.http` serialization APIs:
  `serializeRequest` and `serializeDocument`, plus `SerializableRequest`/`SerializableDocument` exports.
  Includes parser-compatible serializer test coverage.

## 0.2.3

### Patch Changes

- ff3ca97: Add @t-req/plugin base
- bfc6f68: New API (pluginsReports) in server resposnes + SDK types. Adds plugin report fields to display in TUI/Web

## 0.2.2

### Patch Changes

- 7bf7422: Add TTFB timing measurement to execution details

## 0.2.1

### Patch Changes

- b7b4480: Add plugin system

## 0.2.0

### Minor Changes

- core: Unified client API (#9), scoped script tokens (#11)
  app: Fixed default port for open command (#10), scoped script tokens (#11), tag-based release pipeline (#7)

## 0.1.0

### Features

- Initial release
- HTTP request parsing from `.http` files
- Variable interpolation with `{{variable}}` syntax
- Custom resolvers for dynamic values (`$env`, `$timestamp`, `$uuid`, etc.)
- Native `fetch` Response objects
- Cookie management with RFC 6265 compliance
- Timeout and AbortSignal support
- File references (`< ./file.json`) and form data support
- TypeScript-first with full type definitions
- Support for Node.js (>=18) and Bun runtimes
