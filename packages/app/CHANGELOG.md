# @t-req/app

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
