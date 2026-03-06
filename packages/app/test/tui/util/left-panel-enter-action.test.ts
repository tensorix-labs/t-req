import { describe, expect, it } from 'bun:test';
import { resolveLeftPanelEnterAction } from '../../../src/tui/util/left-panel-enter-action';

describe('resolveLeftPanelEnterAction', () => {
  it('returns none when executions tab is active', () => {
    expect(resolveLeftPanelEnterAction('executions', true)).toBe('none');
    expect(resolveLeftPanelEnterAction('executions', false)).toBe('none');
  });

  it('returns none when nothing is selected', () => {
    expect(resolveLeftPanelEnterAction('files', undefined)).toBe('none');
  });

  it('returns toggle-directory for a selected directory in files tab', () => {
    expect(resolveLeftPanelEnterAction('files', true)).toBe('toggle-directory');
  });

  it('returns execute-file for a selected file in files tab', () => {
    expect(resolveLeftPanelEnterAction('files', false)).toBe('execute-file');
  });
});
