/**
 * Stage-based domain configuration for t-req.io
 *
 * | Stage        | Webdocs Domain            | WebApp Domain           | Trigger                |
 * |--------------|---------------------------|-------------------------|------------------------|
 * | production   | t-req.io             | app.t-req.io            | Manual dispatch        |
 * | dev          | dev.t-req.io         | app-dev.t-req.io        | Auto on push to main   |
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
    return `${DOMAIN}`;
  }

  if (stage === 'dev') {
    return `dev.${DOMAIN}`;
  }

  // Personal/local stages don't get a custom domain (use SST's default URL)
  return undefined;
}

/**
 * Returns the domain configuration for the web app based on the current stage.
 *
 * @returns The domain string for the current stage, or undefined for personal stages
 */
export function getWebappDomain(): string | undefined {
  const stage = $app.stage;

  if (stage === 'production') {
    return `app.${DOMAIN}`;
  }

  if (stage === 'dev') {
    return `app-dev.${DOMAIN}`;
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
