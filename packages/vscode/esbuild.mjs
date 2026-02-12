import esbuild from 'esbuild';
import { solidPlugin } from 'esbuild-plugin-solid';

const watch = process.argv.includes('--watch');
const production = process.argv.includes('--production') || !watch;

/** @type {import('esbuild').BuildOptions} */
const extensionBuildOptions = {
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

/** @type {import('esbuild').BuildOptions} */
const webviewBuildOptions = {
  entryPoints: ['src/webview-solid/entry.tsx'],
  bundle: true,
  platform: 'browser',
  target: 'es2022',
  format: 'iife',
  outfile: 'dist/webview/entry.js',
  sourcemap: production ? false : 'inline',
  minify: production,
  plugins: [solidPlugin({ solid: { generate: 'dom' } })],
  loader: {
    '.css': 'css'
  },
  logLevel: 'info'
};

if (watch) {
  const [extensionContext, webviewContext] = await Promise.all([
    esbuild.context(extensionBuildOptions),
    esbuild.context(webviewBuildOptions)
  ]);
  await Promise.all([extensionContext.watch(), webviewContext.watch()]);
  console.log('[t-req-vscode] watching extension and webview bundles for changes...');
} else {
  await Promise.all([esbuild.build(extensionBuildOptions), esbuild.build(webviewBuildOptions)]);
}
