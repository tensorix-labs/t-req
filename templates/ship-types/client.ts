import { createClient } from '@t-req/core';
import { resolveProjectConfig } from '@t-req/core/config';
import { TreqConfig } from './schemas';

const { config } = await resolveProjectConfig({ startDir: process.cwd() });

// Validate config structure matches expected schema
TreqConfig.parse(config);

export const client = createClient({
  variables: config.variables,
  defaults: config.defaults
});
