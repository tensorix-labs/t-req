import { describe, expect, it } from 'bun:test';
import { theme } from '../../../src/tui/theme';
import { getStreamStatusDisplay } from '../../../src/tui/util/status-display';

describe('getStreamStatusDisplay', () => {
  it('returns success color and "Connected" for connected', () => {
    const result = getStreamStatusDisplay('connected');
    expect(result.text).toBe('Connected');
    expect(result.color).toBe(theme.success);
  });

  it('returns warning color and "Connecting..." for connecting', () => {
    const result = getStreamStatusDisplay('connecting');
    expect(result.text).toBe('Connecting...');
    expect(result.color).toBe(theme.warning);
  });

  it('returns error color and "Error" for error', () => {
    const result = getStreamStatusDisplay('error');
    expect(result.text).toBe('Error');
    expect(result.color).toBe(theme.error);
  });

  it('returns muted color and "Disconnected" for disconnected', () => {
    const result = getStreamStatusDisplay('disconnected');
    expect(result.text).toBe('Disconnected');
    expect(result.color).toBe(theme.textMuted);
  });

  it('returns an icon for each status', () => {
    const statuses = ['connected', 'connecting', 'error', 'disconnected'] as const;
    for (const status of statuses) {
      const result = getStreamStatusDisplay(status);
      expect(result.icon).toBeTruthy();
    }
  });
});
