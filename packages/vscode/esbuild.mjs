import esbuild from 'esbuild';

const watch = process.argv.includes('--watch');
const production = process.argv.includes('--production') || !watch;

/** @type {import('esbuild').BuildOptions} */
const buildOptions = {
  entryPoints: ['src/extension.ts'],
  bundle: true,
  platform: 'node',
  target: 'node20',
  format: 'esm',
  outfile: 'dist/extension.js',
  sourcemap: production ? false : 'inline',
  minify: production,
  external: ['vscode'],
  logLevel: 'info'
};

if (watch) {
  const ctx = await esbuild.context(buildOptions);
  await ctx.watch();
  console.log('[t-req-vscode] watching for changes...');
} else {
  await esbuild.build(buildOptions);
}
