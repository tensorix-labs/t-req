import type { ParsedKey } from '@opentui/core';

type Normalized = ParsedKey & {
  ctrl: boolean;
  meta: boolean;
  shift: boolean;
  super: boolean;
  name: string;
};

function toBoolean(value: unknown): boolean {
  return value === true;
}

/**
 * OpenTUI/terminals sometimes send Ctrl+<letter> as a control character instead of
 * `{ ctrl: true, name: "<letter>" }`. Example: Ctrl+P may arrive as name "\x10".
 *
 * This normalizes common control-character cases into a consistent ParsedKey shape.
 */
export function normalizeKey(evt: ParsedKey): Normalized {
  const name = typeof evt.name === 'string' ? evt.name : '';
  const ctrl = toBoolean((evt as { ctrl?: unknown }).ctrl);
  const meta = toBoolean((evt as { meta?: unknown }).meta);
  const shift = toBoolean((evt as { shift?: unknown }).shift);
  const superKey = toBoolean((evt as { super?: unknown }).super);

  // Special-case seen in OpenTUI: Ctrl+Underscore represented as \x1F.
  if (name === '\x1F') {
    return { ...evt, name: '_', ctrl: true, meta, shift, super: superKey };
  }

  // Map ASCII control codes \x01..\x1A to Ctrl+a..Ctrl+z.
  // Terminals / OpenTUI may either:
  // - set ctrl=true and name="\x10" (Ctrl+P), or
  // - set ctrl=false and name="\x10".
  // Normalize both to ctrl=true and name="p".
  if (name.length === 1) {
    const code = name.charCodeAt(0);
    if (code >= 0x01 && code <= 0x1a && !meta && !shift && !superKey) {
      const letter = String.fromCharCode(code + 96);
      return { ...evt, name: letter, ctrl: true, meta, shift, super: superKey };
    }
  }

  return { ...evt, name, ctrl, meta, shift, super: superKey };
}
