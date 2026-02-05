import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'vite';
import solid from 'vite-plugin-solid';

export default defineConfig({
  plugins: [solid(), tailwindcss()],
  server: {
    port: 5173
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          'codemirror-core': ['@codemirror/state', '@codemirror/view', 'codemirror'],
          'codemirror-languages': [
            '@codemirror/lang-javascript',
            '@codemirror/lang-python',
            '@codemirror/theme-one-dark'
          ],
          'codemirror-extensions': [
            '@codemirror/autocomplete',
            '@codemirror/lint',
            '@codemirror/search'
          ]
        }
      }
    }
  }
});
