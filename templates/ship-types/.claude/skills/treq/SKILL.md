---
name: treq
description: t-req.io API testing - CLI reference, SOPs, and syntax
---

# t-req CLI Reference

## treq run
```bash
treq run <file.http> [options]
```

| Option | Alias | Description |
|--------|-------|-------------|
| `--name` | `-n` | Select request by @name |
| `--profile` | `-p` | Config profile from treq.jsonc |
| `--var` | `-v` | Variables as key=value |
| `--verbose` | | Detailed output |

**Examples:**
```bash
treq run collection/users/get.http --verbose
treq run collection/auth/login.http -p dev
```

## SOPs

### Add a New API
1. Create Zod schema: `schemas/<name>.ts`
2. Create HTTP file: `collection/<name>/<action>.http` with `# @name`
3. Quick test: `treq run collection/<name>/<file>.http --verbose`
4. Create test: `tests/<name>.test.ts` with `.parse()` validation
5. Full verify: `bun run test`

### Fix a Failing Test
1. `bun run test` to see failure
2. `treq run <file>.http --verbose` to see raw response
3. Compare Zod schema to actual response
4. Update schema or `.http` file
5. `bun run test` to confirm

## Syntax
- Variables: `{{var}}` or `{{nested.path}}`
- Resolvers: `{{$uuid()}}`, `{{$timestamp()}}`, `{{$env(NAME)}}`
- File injection: `< ./path/to/file.json`
