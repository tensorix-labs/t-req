# @t-req/core

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
