import { getWebdocsDomain } from './stage.js';

/**
 * Webdocs - Astro/Starlight documentation site deployment
 *
 * Uses Cloudflare Workers for SSR hosting.
 * The site is built during deployment and served from Cloudflare's edge network.
 */

const domain = getWebdocsDomain();

export const webdocs = new sst.cloudflare.x.Astro('Webdocs', {
  path: 'packages/webdocs',
  domain
});
