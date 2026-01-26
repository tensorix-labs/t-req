// @ts-check
import { defineConfig } from 'astro/config';
import starlight from '@astrojs/starlight';
import tailwindcss from '@tailwindcss/vite';

// https://astro.build/config
export default defineConfig({
  vite: {
    plugins: [tailwindcss()]
  },
  integrations: [
    starlight({
      title: '@t-req/core',
      components: {
        ThemeProvider: './src/components/ForceLightTheme.astro',
        ThemeSelect: './src/components/ThemeSelect.astro'
      },
      social: [
        {
          icon: 'github',
          label: 'GitHub',
          href: 'https://github.com/tensorix-labs/t-req/tree/main/packages/core'
        }
      ],
      customCss: ['./src/styles/global.css', './src/styles/custom.css'],
      sidebar: [
        {
          label: 'Getting Started',
          items: [
            { label: 'Introduction', slug: 'getting-started/introduction' },
            { label: 'Installation', slug: 'getting-started/installation' },
            { label: 'Quick Start', slug: 'getting-started/quick-start' }
          ]
        },
        {
          label: 'Core Concepts',
          items: [
            { label: 'Ecosystem', slug: 'concepts/ecosystem' },
            { label: '.http File Format', slug: 'concepts/http-file-format' },
            { label: 'Variables', slug: 'concepts/variables' },
            { label: 'Request Lifecycle', slug: 'concepts/request-lifecycle' },
            { label: 'Runtime Adapters', slug: 'concepts/runtime-adapters' }
          ]
        },
        {
          label: 'Guides',
          items: [
            { label: 'Authentication', slug: 'guides/authentication' },
            { label: 'Cookies', slug: 'guides/cookies' },
            { label: 'File Uploads', slug: 'guides/file-uploads' },
            { label: 'Form Data', slug: 'guides/form-data' },
            { label: 'Testing Workflows', slug: 'guides/testing-workflows' },
            { label: 'Error Handling', slug: 'guides/error-handling' },
            { label: 'Tauri Integration', slug: 'guides/tauri-integration' }
          ]
        },
        {
          label: 'API Reference',
          items: [
            { label: 'Client', slug: 'reference/client' },
            { label: 'Engine', slug: 'reference/engine' },
            { label: 'Parser', slug: 'reference/parser' },
            { label: 'Interpolation', slug: 'reference/interpolation' },
            { label: 'Cookies', slug: 'reference/cookies' },
            { label: 'Runtime', slug: 'reference/runtime' },
            { label: 'Config', slug: 'reference/config' },
            { label: 'Types', slug: 'reference/types' }
          ]
        },
        {
          label: 'Recipes',
          items: [
            { label: 'Retry Logic', slug: 'recipes/retry-logic' },
            { label: 'Parallel Requests', slug: 'recipes/parallel-requests' },
            {
              label: 'E-Commerce Checkout',
              slug: 'recipes/e-commerce-checkout'
            }
          ]
        }
      ]
    })
  ]
});
