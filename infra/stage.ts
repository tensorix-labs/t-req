/**
 * Stage-based domain configuration for t-req.io
 *
 * | Stage        | Webdocs Domain            | Trigger                |
 * |--------------|---------------------------|------------------------|
 * | production   | docs.t-req.io             | Manual dispatch        |
 * | dev          | docs-dev.t-req.io         | Auto on push to main   |
 * | pr-{N}       | docs-pr-{N}.t-req.io      | Auto on PR open/sync   |
 */

const DOMAIN = 't-req.io';

/**
 * Returns the domain configuration for the webdocs site based on the current stage.
 *
 * @returns The domain string for the current stage, or undefined for personal stages
 */
export function getWebdocsDomain(): string | undefined {
  const stage = $app.stage;

  if (stage === 'production') {
    return `docs.${DOMAIN}`;
  }

  if (stage === 'dev') {
    return `docs-dev.${DOMAIN}`;
  }

  // PR preview environments: pr-123 -> docs-pr-123.t-req.io
  if (stage.startsWith('pr-')) {
    return `docs-${stage}.${DOMAIN}`;
  }

  // Personal/local stages don't get a custom domain (use SST's default URL)
  return undefined;
}

/**
 * Whether the current stage should be protected from accidental deletion.
 */
export function isProtectedStage(): boolean {
  return $app.stage === 'production';
}
