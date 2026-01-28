# @t-req/webdocs

Documentation site for the t-req ecosystem. Covers the core library, CLI, server API, TUI, web dashboard, and configuration reference.

## Development

### Prerequisites

- [Bun](https://bun.sh) runtime
- The monorepo root dependencies installed (`bun install` from the repo root)

### Dev server

```bash
bun dev
```

Starts the Astro dev server at `http://localhost:4321`.

### Build

```bash
bun run build
```

Outputs the static site to `dist/`.

### Preview

```bash
bun preview
```

Preview the production build locally before deploying.

## Contributing Content

Documentation pages live in `src/content/docs/`. Each `.md` or `.mdx` file becomes a route based on its file name.

### Adding a page

Create a new markdown file in `src/content/docs/`:

```markdown
---
title: My New Page
description: A brief description for SEO and link previews.
---

Page content here.
```

### Images

Place images in `src/assets/` and reference them with a relative path in markdown.

### Static assets

Favicons, fonts, and other static files go in `public/`.

## Tech Stack

- [Astro](https://astro.build/) -- Static site generator
- [Starlight](https://starlight.astro.build/) -- Documentation theme for Astro
- [Tailwind CSS](https://tailwindcss.com/) via [@t-req/ui](../ui) -- Styling and theme

## Part of the t-req Ecosystem

| Package | Role |
|---------|------|
| [@t-req/core](../core) | HTTP parsing and execution library |
| [@t-req/app](../app) | CLI, TUI, and server |
| [@t-req/web](../web) | Browser dashboard |
| [@t-req/ui](../ui) | Shared theme and Tailwind config |
| **@t-req/webdocs** | **Documentation site** |

## License

[MIT](../../LICENSE)
