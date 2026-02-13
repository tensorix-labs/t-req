import { asVariableArray } from './guards';

export function collectVariables(variables: unknown): Record<string, unknown> {
  const output: Record<string, unknown> = {};
  for (const variable of asVariableArray(variables)) {
    if (variable.disabled || typeof variable.key !== 'string' || variable.key === '') {
      continue;
    }
    output[variable.key] = variable.value;
  }
  return output;
}
