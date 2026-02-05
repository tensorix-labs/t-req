import type { PluginsResponse } from '../schemas';
import type { ConfigService } from './config-service';

export interface PluginService {
  getPlugins(): Promise<PluginsResponse>;
}

export function createPluginService(configService: ConfigService): PluginService {
  async function getPlugins(): Promise<PluginsResponse> {
    const workspaceConfig = await configService.getWorkspaceConfig();
    const pluginManager = workspaceConfig.config.pluginManager;

    if (!pluginManager) {
      return {
        plugins: [],
        count: 0
      };
    }

    const pluginInfo = pluginManager.getPluginInfo();
    const plugins = pluginInfo.map((p) => ({
      name: p.name,
      version: p.version,
      source: p.source as 'npm' | 'file' | 'inline' | 'subprocess',
      permissions: p.permissions,
      capabilities: {
        hasHooks: !!pluginManager.getPlugin(p.name)?.plugin.hooks,
        hasResolvers: !!pluginManager.getPlugin(p.name)?.plugin.resolvers,
        hasCommands: !!pluginManager.getPlugin(p.name)?.plugin.commands,
        hasMiddleware: !!pluginManager.getPlugin(p.name)?.plugin.middleware,
        hasTools: !!pluginManager.getPlugin(p.name)?.plugin.tools
      }
    }));

    return {
      plugins,
      count: plugins.length
    };
  }

  return {
    getPlugins
  };
}
