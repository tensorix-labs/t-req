import { describe, expect, test } from 'bun:test';
import yargs from 'yargs';
import { openCommand } from '../../src/cmd/open';
import { tuiCommand } from '../../src/cmd/tui';
import { webCommand } from '../../src/cmd/web';

describe('interactive command auto-update options', () => {
  test('tui command exposes --auto-update with default true', () => {
    const builder = tuiCommand.builder as Record<string, { default?: boolean }>;
    expect(builder['auto-update']?.default).toBe(true);
  });

  test('open command registers --auto-update with default true', () => {
    const configured = (
      openCommand.builder as (argv: ReturnType<typeof yargs>) => ReturnType<typeof yargs>
    )(yargs([]));
    const defaults = (
      configured as unknown as { getOptions: () => { default: Record<string, unknown> } }
    ).getOptions().default;
    expect(defaults['auto-update']).toBe(true);
  });

  test('web command registers --auto-update with default true', () => {
    const configured = (
      webCommand.builder as (argv: ReturnType<typeof yargs>) => ReturnType<typeof yargs>
    )(yargs([]));
    const defaults = (
      configured as unknown as { getOptions: () => { default: Record<string, unknown> } }
    ).getOptions().default;
    expect(defaults['auto-update']).toBe(true);
  });
});
