---
"@t-req/sdk": patch
"@t-req/app": patch
---

 Add source-agnostic import preview/apply server endpoints

  - `POST /import/{source}/preview` — convert and preview filesystem changes without writing
  - `POST /import/{source}/apply` — convert and apply with conflict resolution, variable merge, staging
  - Parameterized `{source}` path validated against importer registry (initially: `postman`)
  - `convertOptions` validated per-importer via `optionsSchema`
  - Script-scoped tokens blocked (403)
  - Error diagnostics gate apply unless `force: true` (422)
  - Partial commit failures return 207 with `partialResult`
  - SDK regenerated: `TreqClient.importPreview()` and `TreqClient.importApply()`
