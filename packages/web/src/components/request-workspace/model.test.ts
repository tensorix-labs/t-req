import { describe, expect, test } from 'bun:test';
import {
  DEFAULT_REQUEST_WORKSPACE_TAB,
  isRequestWorkspaceTabId,
  REQUEST_WORKSPACE_TABS
} from './model';

describe('request workspace tab model', () => {
  test('exports the expected tab order', () => {
    expect(REQUEST_WORKSPACE_TABS).toEqual(['params', 'headers', 'body']);
  });

  test('uses params as the default tab', () => {
    expect(DEFAULT_REQUEST_WORKSPACE_TAB).toBe('params');
  });

  test('validates request workspace tab ids', () => {
    expect(isRequestWorkspaceTabId('params')).toBe(true);
    expect(isRequestWorkspaceTabId('headers')).toBe(true);
    expect(isRequestWorkspaceTabId('body')).toBe(true);
    expect(isRequestWorkspaceTabId('response')).toBe(false);
    expect(isRequestWorkspaceTabId('')).toBe(false);
    expect(isRequestWorkspaceTabId('Params')).toBe(false);
  });
});
