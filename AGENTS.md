
## Repository Overview
- Monorepo managed with Bun workspaces and Turborepo.
- Primary language: TypeScript.
- Notable packages:
  - `packages/core`: parsing and execution engine (`@t-req/core`)
  - `packages/app`: CLI, TUI, server (`@t-req/app`)
  - `packages/web`: browser dashboard
  - `packages/vscode`: VS Code extension
  - `packages/desktop`: Tauri desktop app
  - `packages/sdk/js`: TypeScript SDK (`@t-req/sdk`)
  - `packages/plugins/*`: plugin packages

## Tooling Expectations

- Use `bun` for package and script execution.
- Use `bunx turbo ...` or root `bun run ...` scripts for monorepo tasks.
- Prefer `rg` for code search and `rg --files` for file listing.
- Keep edits focused; avoid broad refactors unless requested.

## Setup

```bash
bun install
```

## Common Commands

Run from repo root unless package-level work is explicitly needed.

```bash
# Monorepo
bun run build
bun run test
bun run test:unit
bun run test:e2e   # requires internet
bun run lint
bun run check-types
bun run format
```

Package-level examples:

```bash
# Core package
bun --cwd packages/core run test
bun --cwd packages/core run test:unit

# App package
bun --cwd packages/app run test

# VS Code extension
bun --cwd packages/vscode run test:unit
```

## Validation Checklist (Before Finishing)

- Run the smallest relevant test set for changed code.
- For cross-package or shared API changes, run:
  - `bun run lint`
  - `bun run check-types`
  - `bun run test`
- If formatting drift is introduced, run `bun run format`.
- Mention any commands not run and why.

## Code Style

- Follow `biome.json` settings.
- Prefer explicit, readable TypeScript types.
- Preserve existing file conventions and naming.
- Keep conditionals explicit and self-documenting.
- Prefer guard clauses and early returns over deep nesting.
- Avoid bloated conditionals; extract complex checks into well-named booleans or helper functions.
- Avoid double negatives and side effects inside conditional expressions.
- When branching on known variants, prefer exhaustive `switch`/union handling.

## Generated Code and Build Artifacts

- Do not hand-edit generated SDK output in `packages/sdk/js/src/gen`.
- Regenerate SDK artifacts with package scripts when needed.
- Avoid committing build artifacts unless the repo already tracks them.

## Change Safety

- Do not perform destructive git operations (`reset --hard`, force checkout, etc.) unless explicitly requested.
- Do not revert user-authored unrelated changes.
- If unexpected file changes appear during work, stop and ask for direction.

## Contribution Workflow Notes
- Use conventional commit style for commit messages (`feat:`, `fix:`, `docs:`, etc.).
