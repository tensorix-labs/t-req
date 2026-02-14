# @t-req/sdk

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
