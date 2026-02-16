import {
  type ClientOptions,
  createConfig,
  createClient as createGeneratedClient,
  TreqClient
} from '@t-req/sdk/client';
import type { ServerInfo } from '../context/server-context';

export function createTreqDesktopClient(info: ServerInfo): TreqClient {
  const client = createGeneratedClient(
    createConfig<ClientOptions>({
      baseUrl: info.baseUrl,
      headers: { Authorization: `Bearer ${info.token}` }
    })
  );

  return new TreqClient({ client });
}
