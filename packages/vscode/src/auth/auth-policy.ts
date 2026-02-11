import { isServerAuthError } from '../execution/server-runner';

export function shouldPromptForAuthRecovery(error: unknown): boolean {
  if (isServerAuthError(error)) {
    return true;
  }
  if (!(error instanceof Error)) {
    return false;
  }
  return /\b401\b|\b403\b|auth|token|unauthorized|forbidden/i.test(error.message);
}

export function shouldAutoRerunAfterTokenUpdate(): boolean {
  return false;
}
