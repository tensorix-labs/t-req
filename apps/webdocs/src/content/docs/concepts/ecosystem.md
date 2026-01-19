---
title: Ecosystem
description: Overview of the t-req ecosystem and package structure
---

The t-req ecosystem provides tools for working with `.http` files across different contexts—from programmatic library usage to command-line tools and interactive interfaces.

## Available Packages

### @t-req/core

**This documentation** covers `@t-req/core`, the foundational library for parsing, interpolating, and executing HTTP requests.

```bash
npm install @t-req/core
```

Use @t-req/core when you need:

- Programmatic control over HTTP request execution
- Integration into your TypeScript/JavaScript applications
- Building custom tooling on top of `.http` file support
- API testing in your test suites

[Get started with @t-req/core →](/getting-started/installation/)

### @t-req/ui

A companion package providing UI components for displaying HTTP requests and responses. Used internally by other t-req tools.

```bash
npm install @t-req/ui
```

## Upcoming Tools

The following tools are planned for the t-req ecosystem:

### t-req CLI

**Coming soon** — Run `.http` files directly from the command line.

```bash
# Execute a request
t-req run ./api/users.http

# Execute with variables
t-req run ./api/user.http --var userId=123
```

### t-req TUI

**Coming soon** — An interactive terminal interface for exploring and running requests.

Features:
- Browse `.http` files in your project
- Execute requests interactively
- View response history
- Manage variables and environments

### t-req Agent

**Coming soon** — AI-powered HTTP request assistant.

Features:
- Generate `.http` files from natural language
- Debug failing requests
- Suggest optimizations

## Monorepo Structure

The t-req project is organized as a monorepo:

```
t-req/
├── packages/
│   ├── core/      # @t-req/core - HTTP client library
│   └── ui/        # @t-req/ui - UI components
├── apps/
│   └── webdocs/   # Documentation site (this site)
└── examples/      # Example projects
```

Source code: [github.com/tensorix-labs/t-req](https://github.com/tensorix-labs/t-req)
