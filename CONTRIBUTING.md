# Contributing to @t-req

Thank you for your interest in contributing! This document provides guidelines and instructions for contributing to the project.

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

Use clear, descriptive commit messages:

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

- Provide a clear description of the changes
- Reference any related issues
- Include tests for new functionality
- Ensure CI passes
- Keep changes focused and atomic

## Reporting Issues

When reporting issues, please include:

1. A clear description of the problem
2. Steps to reproduce
3. Expected vs actual behavior
4. Environment details (Bun version, OS, etc.)
5. Minimal reproduction code if possible

## Feature Requests

Feature requests are welcome! Please:

1. Check if the feature already exists or is planned
2. Describe the use case
3. Propose an API if applicable
4. Be open to discussion about implementation

## Questions?

If you have questions, feel free to:

- Open an issue for discussion
- Check existing issues and documentation

Thank you for contributing!
