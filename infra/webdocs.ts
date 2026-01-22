import { getWebdocsDomain } from './stage.js';

/**
 * Webdocs - Astro/Starlight documentation site deployment
 *
 * Uses Cloudflare Workers with static assets for hosting.
 * The site is built during deployment and served from Cloudflare's edge network.
 */

const domain = getWebdocsDomain();

export const webdocs = new sst.cloudflare.StaticSite('Webdocs', {
  path: 'packages/webdocs',
  build: {
    command: 'bun run build',
    output: 'dist'
  },
  domain
});
