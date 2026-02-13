import { describe, expect, test } from 'bun:test';
import { SDKError } from '@t-req/sdk/client';
import {
  shouldAutoRerunAfterTokenUpdate,
  shouldPromptForAuthRecovery
} from '../../src/auth/auth-policy';

describe('commands auth policy', () => {
  test('prompts for auth recovery on typed server auth errors', () => {
    expect(shouldPromptForAuthRecovery(new SDKError('Unauthorized', 401))).toBe(true);
    expect(shouldPromptForAuthRecovery(new SDKError('Forbidden', 403))).toBe(true);
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
