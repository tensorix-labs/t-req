# Changelog

## 0.1.7

### Patch Changes

- Updated dependencies [1c629f7]
  - @t-req/sdk@0.1.4
  - @t-req/core@0.2.6

## 0.1.6

### Patch Changes

- 7ead55c: - Enable syntax highlighting in the TUI response panel for JSON, HTML, and YAML responses (including JSON detection fallback when content-type is missing).

  - Improve footer keybind label spacing in the TUI status bar.

  ***

  ## "t-req-vscode": patch

  - Add hover tooltips for `{{variable}}` references in `.http` files.
  - Show resolved values and source attribution (file variable, config, or profile) directly in hover content.
  - Improve hover handling for resolver expressions and undefined variables with clearer messaging.

## 0.1.5

### Features

- **Enhanced marketplace visibility and SEO**: Optimized extension metadata and README for better discoverability in VS Code Marketplace and OpenVSX (Cursor).
  - Updated displayName to include "HTTP Client & API Testing"
  - Expanded keywords from 6 to 21 terms including competitors (Postman, Thunder Client, Insomnia, Bruno, curl, httpie)
  - Added "Debuggers" and "Other" categories for increased browse visibility
  - Rewrote README with SEO-optimized intro, badges, and structured feature sections
  - Positioned as file-based alternative to popular API testing tools

### Fixes

- **Remove duplicate headers in response panel**: Fixed an issue where response headers were being displayed twice. This was caused by redundant header processing in the body formatting utilities.
  - Cleaned up unused CSS styles (28 lines removed)
  - Simplified body formatting logic (15 lines removed)
  - Updated tests to reflect cleaner implementation

## 0.1.4

### Patch Changes

- Updated dependencies [c3cf95e]
  - @t-req/core@0.2.5
  - @t-req/sdk@0.1.3

## 0.1.3

### Patch Changes

- Updated dependencies [bdd0556]
- Updated dependencies [b0150a2]
- Updated dependencies [2cd3609]
  - @t-req/core@0.2.4
  - @t-req/sdk@0.1.2

## 0.1.1

### Fixes

- Fix Marketplace README screenshots by using absolute image URLs.

## 0.1.0

Initial release.

### Features

- Syntax highlighting for `.http` files with embedded JSON
- Run individual or all requests from the editor
- Local execution mode with bundled t-req engine
- Server execution mode with remote t-req server support
- Profile selection for switching between environments
- Response panel with status, headers, and body rendering
- Inline diagnostics from static analysis and plugins
- Secure token storage via VS Code SecretStorage
- Configurable timeouts, body size limits, and diagnostics toggle
