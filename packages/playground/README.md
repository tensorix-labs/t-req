# @t-req/playground

Development playground for testing `treq init` functionality without external dependencies.

## Purpose

This package provides a self-contained environment for developing and testing t-req initialization features. It removes the need to rely on third-party dependencies during development by providing a local server and test environment.

## Getting Started

### Prerequisites

- [Bun](https://bun.sh) installed

### Installation

```bash
bun install
```

### Development

Start the development server with hot reloading:

```bash
bun run dev
```

The server will start at `http://localhost:3000`.

## Usage

The playground currently exposes a simple Hono server for testing. You can extend this to:

- Test t-req initialization workflows
- Mock external API responses
- Validate request/response handling
- Experiment with new features before integrating into the main packages

## Project Structure

```
.
├── src/
│   └── index.ts          # Main server entry point
├── package.json          # Dependencies (Hono + Bun types)
├── tsconfig.json         # TypeScript configuration
└── README.md            # This file
```

## Related Packages

- [`@t-req/core`](../core) - Core parsing and execution engine
- [`@t-req/app`](../app) - CLI, TUI, and server implementation

## License

See repository root for license information.
