# t-req API Testing

## Commands
- `bun run test` - Contract tests
- `bun run typecheck` - Type checking
- `bun run openapi` - Generate OpenAPI spec

## Code Style
- ES modules only (import/export)
- Schema-first: Zod schema required before using any API response
- Contract tests must use `.parse()` to validate
