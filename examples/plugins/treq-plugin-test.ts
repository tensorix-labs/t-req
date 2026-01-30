/**
 * Simple test plugin to verify plugin system works
 */

// Use relative import for file:// loading compatibility
import { definePlugin } from '../../packages/core/src/index';

export default definePlugin({
  name: 'treq-plugin-test',
  version: '1.0.0',

  setup(ctx) {
    console.log('[test-plugin] Setup called, project root:', ctx.projectRoot);
  },

  hooks: {
    async 'request.before'(input, output) {
      console.log('[test-plugin] request.before:', input.request.method, input.request.url);
      // Add a test header to prove the plugin ran
      output.request = {
        ...input.request,
        headers: {
          ...input.request.headers,
          'X-Test-Plugin': 'active'
        }
      };
    },

    async 'request.after'(input) {
      console.log('[test-plugin] request.after (read-only):', input.request.method);
    },

    async 'response.after'(input, _output) {
      console.log('[test-plugin] response.after:', input.response.status);
    }
  },

  teardown() {
    console.log('[test-plugin] Teardown called');
  }
});
