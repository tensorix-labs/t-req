---
"@t-req/core": patch
"@t-req/app": patch
---

Expand `RequestDefinition` with optional `description`, `bodyFile`, `formData`, and `directives` fields, making
   it structurally compatible with `SerializableRequest`. Implement `writeHttpFile` in CLI command context using
  `serializeDocument()`.
