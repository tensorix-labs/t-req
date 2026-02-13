import type { PostmanEvent } from '../postman-types';
import type { ImportDiagnostic } from '../types';
import type { ConvertState } from './state';

export function createDiagnostic(
  code: string,
  severity: ImportDiagnostic['severity'],
  message: string,
  sourcePath?: string,
  details?: Record<string, unknown>
): ImportDiagnostic {
  const diagnostic: ImportDiagnostic = {
    code,
    severity,
    message
  };

  if (sourcePath) {
    diagnostic.sourcePath = sourcePath;
  }
  if (details) {
    diagnostic.details = details;
  }

  return diagnostic;
}

export function sourcePath(parts: string[]): string {
  return parts.join(' / ');
}

export function addDisabledDiagnostic(state: ConvertState, source: string, kind: string): void {
  if (!state.reportDisabled) {
    return;
  }
  state.diagnostics.push(
    createDiagnostic(
      'disabled-item',
      'info',
      `Disabled ${kind} was ignored during conversion.`,
      source
    )
  );
}

export function emitScriptDiagnostics(
  state: ConvertState,
  sourceParts: string[],
  events: PostmanEvent[] | undefined
): void {
  for (const event of events ?? []) {
    if (event.disabled) {
      continue;
    }

    const exec = event.script?.exec;
    const hasScript =
      Array.isArray(exec) && exec.some((line) => typeof line === 'string' && line.trim() !== '');
    if (!hasScript) {
      continue;
    }

    state.diagnostics.push(
      createDiagnostic(
        'script-ignored',
        'info',
        `Postman ${event.listen ?? 'script'} script was ignored.`,
        sourcePath(sourceParts)
      )
    );
  }
}
