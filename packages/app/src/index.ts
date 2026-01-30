#!/usr/bin/env node
import { cli } from './cli';

cli(process.argv.slice(2)).catch((err) => {
  console.error('Fatal error:', err instanceof Error ? err.message : String(err));
  process.exit(1);
});
