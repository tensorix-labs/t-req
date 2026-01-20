# t-req Examples

This directory contains examples for the t-req ecosystem.

## Structure

```
examples/
├── core/       # @t-req/core examples - .http files and TypeScript usage
└── app/        # @t-req/app examples - language client examples for the HTTP server
```

## Core Examples

The `core/` directory contains examples for using `@t-req/core` directly:

- `.http` files demonstrating the HTTP file format
- TypeScript scripts showing programmatic usage with `createClient`

See [core/README.md](./core/README.md) for details.

## App Examples

The `app/` directory contains client examples for connecting to `treq serve`:

- Python client using `requests` and SSE
- Go client using `net/http`
- TypeScript client using `fetch`

See [app/README.md](./app/README.md) for details.
