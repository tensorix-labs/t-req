---
"@t-req/app": patch
---

make Enter drill into directories in Files tree
- Enter previously did nothing when a directory row was selected, which blocked keyboard navigation into nested folders. Resolve Enter by selected node type (toggle directory vs execute file) and add tests for left-panel Enter action behavior.