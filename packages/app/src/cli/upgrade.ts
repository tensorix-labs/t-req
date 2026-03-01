import { checkForAvailableUpdate } from '../update';

export interface UpdateResult {
  version: string;
  method: import('../installation').Installation.Method;
  command: string;
}

export async function checkForUpdate(): Promise<UpdateResult | undefined> {
  return checkForAvailableUpdate();
}
