import { Installation } from '../installation';

export interface UpdateResult {
  version: string;
  method: Installation.Method;
  command: string;
}

export async function checkForUpdate(): Promise<UpdateResult | undefined> {
  const method = await Installation.method();
  const latest = await Installation.latest(method).catch(() => undefined);
  if (!latest) return undefined;
  if (Installation.VERSION === latest) return undefined;
  return {
    version: latest,
    method,
    command: Installation.updateCommand(method, latest)
  };
}
