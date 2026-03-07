import { defineConfig } from 'astro/config';
import starlight from '@astrojs/starlight';
import tailwindcss from '@tailwindcss/vite';
import cloudflare from '@astrojs/cloudflare';
import starlightBlog from 'starlight-blog'


export default defineConfig({
  site: 'https://t-req.io',
  output: 'server',
  adapter: cloudflare(),
  redirects: {
    '/install': 'https://raw.githubusercontent.com/tensorix-labs/t-req/main/install'
  },
  integrations: [
    starlight({
      plugins: [starlightBlog()],
      title: 't-req',
      description:
        'The open-source .http file engine for API testing and automation. Git-native, and built code-first teams.',
      logo: {
        src: './src/assets/logo.jpg',
        replacesTitle: true
      },
      favicon: '/favicon.png',
      head: [
        {
          tag: 'meta',
          attrs: { property: 'og:image', content: 'https://t-req.io/logo.jpg' }
        },
        {
          tag: 'meta',
          attrs: { name: 'twitter:image', content: 'https://t-req.io/logo.jpg' }
        }
      ],
      customCss: ['./src/styles/starlight.css'],
      sidebar: [
        { label: 'Getting Started', slug: 'docs/getting-started' },
        {
          label: 'Guides',
          items: [
            { label: 'Postman Migration', slug: 'docs/guides/postman-migration' },
            { label: 'BYO Test Runner', slug: 'docs/guides/byo-test-runner' },
            { label: 'Plugins', slug: 'docs/guides/plugins' },
            { label: 'Observer Mode', slug: 'docs/guides/observer-mode' },
            { label: 'VS Code Extension', slug: 'docs/guides/vscode-extension' }
          ]
        },
        {
          label: 'Interfaces',
          items: [{ label: 'Core Library', slug: 'docs/interfaces/core-library' }]
        },
        {
          label: 'Reference',
          items: [
            { label: 'HTTP File Format', slug: 'docs/reference/http-file-format' },
            { label: 'WebSocket Protocol', slug: 'docs/reference/websocket-protocol' },
            { label: 'Configuration', slug: 'docs/reference/configuration' },
            { label: 'CLI', slug: 'docs/reference/cli' }
          ]
        }
      ]
    })
  ],
  vite: {
    plugins: [tailwindcss()]
  }
});
