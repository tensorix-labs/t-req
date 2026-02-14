# @t-req/app

## 0.3.11

### Patch Changes

- a7bb6dc: Add `treq import postman <file>` CLI command:
  - Import Postman collections into .http files
  - Options: output directory, file strategy, conflict policy, variable merge
  - Dry-run mode for previewing changes
  - Colored diagnostic output
- bdd0556: Expand `RequestDefinition` with optional `description`, `bodyFile`, `formData`, and `directives` fields, making
  it structurally compatible with `SerializableRequest`. Implement `writeHttpFile` in CLI command context using
  `serializeDocument()`.
- b0150a2: Add source-agnostic import preview/apply server endpoints

  - `POST /import/{source}/preview` — convert and preview filesystem changes without writing
  - `POST /import/{source}/apply` — convert and apply with conflict resolution, variable merge, staging
  - Parameterized `{source}` path validated against importer registry (initially: `postman`)
  - `convertOptions` validated per-importer via `optionsSchema`
  - Script-scoped tokens blocked (403)
  - Error diagnostics gate apply unless `force: true` (422)
  - Partial commit failures return 207 with `partialResult`
  - SDK regenerated: `TreqClient.importPreview()` and `TreqClient.importApply()`

- Updated dependencies [bdd0556]
- Updated dependencies [b0150a2]
- Updated dependencies [2cd3609]
  - @t-req/core@0.2.4
  - @t-req/sdk@0.1.2
  - @t-req/plugin-base@0.1.1

## 0.3.8

### Patch Changes

- ff3ca97: Add @t-req/plugin base
- bfc6f68: New API (pluginsReports) in server resposnes + SDK types. Adds plugin report fields to display in TUI/Web
- Updated dependencies [ff3ca97]
- Updated dependencies [bfc6f68]
  - @t-req/plugin-base@0.1.0
  - @t-req/core@0.2.3
  - @t-req/sdk@0.1.1

## 0.3.7

### Patch Changes

- 7f32a00: @t-req/sdk: Add TypeScript SDK with client, server spawner, and SSE streaming support
  @t-req/app: Migrate TUI to @t-req/sdk clietn and add OpenAPI spec export
- 37d724c: Add integrated code editor to the web UI
- 7e4856e: Add SSE support and stream view in TUI
- Updated dependencies [7f32a00]
  - @t-req/sdk@0.1.0

## 0.3.6

### Patch Changes

- 7bf7422: Add TTFB timing measurement to execution details
- c2f85d9: Improve execution detail view. Add tab based details in output
- Updated dependencies [7bf7422]
  - @t-req/core@0.2.2

## 0.3.4

### Patch Changes

- b7b4480: Add plugin system
- Updated dependencies [b7b4480]
  - @t-req/core@0.2.1

## 0.3.3

### Patch Changes

- 8f6b004: Fix TUI freeze when opening command dialog
- 7fbaa04: Add test file generation to `treq init` - New flags: `--no-tests` to skip, `--test-runner` to specify runner (bun/vitest/jest)
- 5ddebf9: Add profile selection in TUI and Web.

## 0.3.2

### Patch Changes

- b23d6d5: Fix bin/treq crash with "require is not defined in ES module scope" by converting to ESM imports

## 0.3.1

### Patch Changes

- 847eded: Fix `treq --version` showing "unknown" in compiled binary by passing version explicitly to yargs

## 0.3.0

### Minor Changes

- 2e9b699: Fix treq init to scaffold projects that work immediately — replace broken auth/login
- 8578d84: Add auto-update notification and upgrade command. The TUI checks npm for new versions on startup and shows a toastnotification. A new treq upgrade cli command allows manual upgrade. support npm, bun, and curl installations

## 0.2.0

### Minor Changes

- core: Unified client API (#9), scoped script tokens (#11)
  app: Fixed default port for open command (#10), scoped script tokens (#11), tag-based release pipeline (#7)

### Patch Changes

- Updated dependencies
  - @t-req/core@0.2.0
