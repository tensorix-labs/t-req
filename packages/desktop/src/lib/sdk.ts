import { createTreqClient, type TreqClient } from '@t-req/sdk/client';

type TreqDesktopClientCredentials = {
  baseUrl: string;
  token: string;
};

export function createTreqDesktopClient(info: TreqDesktopClientCredentials): TreqClient {
  return createTreqClient({
    baseUrl: info.baseUrl,
    token: info.token
  });
}
