import { describe, expect, test } from 'bun:test';
import {
  shouldAutoRerunAfterTokenUpdate,
  shouldPromptForAuthRecovery
} from '../../src/auth/auth-policy';
import { ServerAuthError } from '../../src/execution/server-runner';

describe('commands auth policy', () => {
  test('prompts for auth recovery on typed server auth errors', () => {
    expect(shouldPromptForAuthRecovery(new ServerAuthError(401, 'Unauthorized'))).toBe(true);
    expect(shouldPromptForAuthRecovery(new ServerAuthError(403, 'Forbidden'))).toBe(true);
  });

  test('prompts for auth recovery on auth-like generic messages', () => {
    expect(shouldPromptForAuthRecovery(new Error('HTTP 401'))).toBe(true);
    expect(shouldPromptForAuthRecovery(new Error('forbidden token'))).toBe(true);
    expect(shouldPromptForAuthRecovery(new Error('connection timeout'))).toBe(false);
  });

  test('never auto-reruns after token update', () => {
    expect(shouldAutoRerunAfterTokenUpdate()).toBe(false);
  });
});
