import { getWebappDomain } from './stage.js';

/**
 * WebApp - web interface for t-req
 *
 * Uses Cloudflare Workers with static assets for hosting.
 * The web app connects to the user's local t-req server via configurable API_URL.
 *
 * Architecture:
 * - UI assets served from Cloudflare CDN (app.t-req.io)
 * - API calls go to user's local server (localhost:port)
 * - All workspace data stays local, only UI assets from cloud
 */

const domain = getWebappDomain();

export const webapp = new sst.cloudflare.StaticSite('WebApp', {
  path: 'packages/web',
  build: {
    command: 'bun run build',
    output: 'dist'
  },
  domain
});
