# @t-req/web

Browser dashboard for the t-req server. Browse `.http` files, execute requests, view responses, and observe script activity in real time.

## Features

- **File tree** -- Browse workspace `.http` files, scripts, and tests
- **Request execution** -- Select and execute requests from `.http` files
- **Response viewer** -- Inspect status, headers, and body of HTTP responses
- **Script runner** -- Run scripts with auto-detected runners (bun, node, tsx, python)
- **Test runner** -- Run tests with auto-detected frameworks (vitest, jest, bun test, pytest)
- **SSE observer mode** -- Watch HTTP requests from running scripts appear in real time

## Usage

The dashboard is served through `treq open --web`, which starts the server and opens the dashboard in your browser:

```bash
treq open --web
```

The web app connects to the server via relative URLs and uses cookie-based authentication (same-origin). No token configuration is needed.

## Development

### Prerequisites

- [Bun](https://bun.sh) runtime
- The monorepo root dependencies installed (`bun install` from the repo root)

### Dev server

```bash
bun dev
```

Starts the Vite dev server. You'll need a running t-req server to connect to (e.g. `treq serve` in another terminal).

### Build

```bash
bun run build
```

Outputs production files to `dist/`.

## Tech Stack

- [Solid.js](https://www.solidjs.com/) -- Reactive UI framework
- [Vite](https://vite.dev/) -- Build tool and dev server
- [Tailwind CSS](https://tailwindcss.com/) via [@t-req/ui](../ui) -- Styling and theme
- [TypeScript](https://www.typescriptlang.org/)

## Part of the t-req Ecosystem

| Package | Role |
|---------|------|
| [@t-req/core](../core) | HTTP parsing and execution library |
| [@t-req/app](../app) | CLI, TUI, and server |
| **@t-req/web** | **Browser dashboard** |
| [@t-req/ui](../ui) | Shared theme and Tailwind config |
| [@t-req/webdocs](../webdocs) | Documentation site |

## License

[MIT](../../LICENSE)
