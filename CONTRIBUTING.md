# Contributing to @t-req

Thank you for your interest in contributing! This document provides guidelines and instructions for contributing to the project.

## How to Contribute

### Discussion First Policy

All non-trivial contributions should start with an issue or discussion before implementation. This helps ensure your time is well spent and that the contribution aligns with project goals.

**PRs without a linked issue may be closed without review.** Use `Fixes #123` or `Closes #123` in your PR description to link issues.

#### Contributions welcome without prior discussion:
- Bug fixes with clear reproduction steps
- Documentation improvements and typo fixes
- Test coverage improvements

#### Contributions requiring discussion first:
- New features or functionality
- API changes or additions
- Architectural changes
- Breaking changes
- UI/UX changes

### GitHub Labels

Look for these labels when finding issues to work on:

- `help wanted` - Issues where community help is welcome
- `good first issue` - Good for newcomers
- `needs discussion` - Requires design input before implementation

## AI Usage Policy

AI tools are welcome and encouraged as productivity aids. This policy exists to ensure quality and help maintainers understand contributions.

### Disclosure Requirement

All AI usage must be disclosed in PRs and issues:

- State the tool used (e.g., Claude Code, Cursor, Copilot, ChatGPT)
- Describe the extent of AI assistance (e.g., "used for initial implementation", "helped debug", "generated tests")

Maintainers are exempt from disclosure requirements.

### Quality Expectations

- AI-assisted code must be fully tested and verified by the contributor
- No AI-generated walls of text - keep descriptions concise and human-reviewed
- Contributors are responsible for the quality of AI-assisted work

## Development Setup

### Prerequisites

- [Bun](https://bun.sh) v1.3
- Git

### Getting Started

1. Fork the repository on GitHub

2. Clone your fork:
   ```bash
   git clone https://github.com/tensorix-labs/t-req.git
   cd t-req
   ```

3. Install dependencies:
   ```bash
   bun install
   ```

4. Run the tests to verify setup:
   ```bash
   bun test
   ```

## Running Tests

```bash
# Run all tests
bun test

# Run unit tests only (faster)
bun run test:unit

# Run E2E tests (requires internet)
bun run test:e2e

# Run specific test file
bun test test/parser.test.ts

# Run tests in watch mode
bun test --watch
```

## Code Style Guidelines

### TypeScript

- Use TypeScript strict mode
- Prefer explicit types over `any`
- Export types from `src/types.ts`
- Use JSDoc comments for public APIs

### Formatting

- Use 2-space indentation
- Use single quotes for strings
- No trailing commas in function parameters
- Use semicolons

### Naming Conventions

- `camelCase` for functions and variables
- `PascalCase` for types and interfaces
- Descriptive names that reflect purpose

### Example

```typescript
/**
 * Parse .http file content into structured request objects
 */
export function parse(content: string): ParsedRequest[] {
  const requests: ParsedRequest[] = [];
  // Implementation
  return requests;
}
```

## Making Changes

### 1. Create a Branch

```bash
git checkout -b feature/your-feature-name
# or
git checkout -b fix/your-bug-fix
```

### 2. Make Your Changes

- Write tests for new functionality
- Update documentation if needed
- Ensure all tests pass

### 3. Test Your Changes

```bash
# Run all tests
bun test

# Run the build
bun run build

# Verify the build works
bun ./dist/index.js
```

### 4. Commit Your Changes

Use clear, descriptive commit messages following [Conventional Commits](https://www.conventionalcommits.org/):

```bash
git commit -m "feat: add support for custom HTTP methods"
git commit -m "fix: handle empty body in POST requests"
git commit -m "docs: update README with new examples"
```

Commit message prefixes:
- `feat:` - New feature
- `fix:` - Bug fix
- `docs:` - Documentation changes
- `test:` - Test changes
- `refactor:` - Code refactoring
- `chore:` - Build/tooling changes

### 5. Push and Create a Pull Request

```bash
git push origin your-branch-name
```

Then create a Pull Request on GitHub.

## Pull Request Guidelines

- **Link an issue:** Reference the issue your PR addresses using `Fixes #123` or `Closes #123`
- **Describe your changes:** Provide a clear summary of what changed and why
- **Explain how you tested:** Describe the tests you ran to verify your changes
- **Use conventional commits:** Format PR titles as `type: description` (e.g., `feat: add timeout option`)
- **Include tests:** Add tests for new functionality
- **Keep it focused:** PRs should be atomic - one logical change per PR
- **Ensure CI passes:** All checks must pass before review

## Reporting Issues

When reporting issues, please include:

1. A clear description of the problem
2. Steps to reproduce
3. Expected vs actual behavior
4. Environment details (Bun version, OS, etc.)
5. Minimal reproduction code if possible

## Feature Requests

Feature requests are welcome! To propose a new feature:

1. **Open an issue first** - Describe the problem you're trying to solve, not just the solution
2. **Wait for feedback** - Allow maintainers to discuss the approach before starting implementation
3. Check if the feature already exists or is planned
4. Propose an API if applicable
5. Be open to discussion about implementation

## Questions?

If you have questions, feel free to:

- Open an issue for discussion
- Check existing issues and documentation

Thank you for contributing!
