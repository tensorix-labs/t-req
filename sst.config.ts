/// <reference path="./.sst/platform/config.d.ts" />

export default $config({
  app(input) {
    return {
      name: 't-req',
      removal: input?.stage === 'production' ? 'retain' : 'remove',
      protect: ['production'].includes(input?.stage ?? ''),
      home: 'cloudflare'
    };
  },
  async run() {
    // await import('./infra/webdocs.js');
    await import('./infra/webapp.js');
  }
});
