import type { ParsedKey } from '@opentui/core';

export namespace Keybind {
  export type Info = Pick<ParsedKey, 'name' | 'ctrl' | 'meta' | 'shift' | 'super'>;

  export function match(a: Info | undefined, b: Info): boolean {
    if (!a) return false;
    return (
      (a.name ?? '') === (b.name ?? '') &&
      (a.ctrl ?? false) === (b.ctrl ?? false) &&
      (a.meta ?? false) === (b.meta ?? false) &&
      (a.shift ?? false) === (b.shift ?? false) &&
      (a.super ?? false) === (b.super ?? false)
    );
  }

  export function fromParsedKey(key: ParsedKey): Info {
    return {
      name: key.name,
      ctrl: key.ctrl,
      meta: key.meta,
      shift: key.shift,
      super: key.super ?? false
    };
  }

  export function parse(config: string): Info[] {
    if (!config || config === 'none') return [];

    return config.split(',').map((combo) => {
      const parts = combo.trim().toLowerCase().split('+');
      const info: Info = {
        name: '',
        ctrl: false,
        meta: false,
        shift: false,
        super: false
      };

      for (const part of parts) {
        switch (part) {
          case 'ctrl':
          case 'control':
            info.ctrl = true;
            break;
          case 'alt':
          case 'meta':
          case 'option':
            info.meta = true;
            break;
          case 'shift':
            info.shift = true;
            break;
          case 'super':
          case 'cmd':
          case 'command':
            info.super = true;
            break;
          case 'esc':
            info.name = 'escape';
            break;
          default:
            info.name = part;
            break;
        }
      }

      return info;
    });
  }

  export function stringify(info: Info | undefined): string {
    if (!info) return '';
    const parts: string[] = [];
    if (info.ctrl) parts.push('ctrl');
    if (info.meta) parts.push('alt');
    if (info.super) parts.push('super');
    if (info.shift) parts.push('shift');
    if (info.name) parts.push(info.name);
    return parts.join('+');
  }
}
