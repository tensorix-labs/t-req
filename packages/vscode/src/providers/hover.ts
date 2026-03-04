import * as path from 'node:path';
import { parseDocument } from '@t-req/core';
import {
  applyProfile,
  applySubstitutions,
  type LoadedConfig,
  loadConfig,
  type TreqConfigInput
} from '@t-req/core/config';
import * as vscode from 'vscode';
import { type ExtensionSettings, getWorkspaceBounds, readSettings } from '../config/loader';
import { getScopedProfile } from '../state/profile-state';
import { getFolderScopeUri } from '../state/scope';
import {
  type FormattedHoverContent,
  findTopLevelVariableKey,
  findVariableAtPosition,
  formatHoverContent,
  isResolverCall,
  lookupVariable,
  resolveVariablesWithSource,
  toValueMap,
  type VariablesWithSource
} from './hover-helpers';

export type {
  FormatHoverContentInput,
  FormattedHoverContent,
  ResolveVariablesWithSourceInput,
  VariableMatch,
  VariableSource,
  VariablesWithSource,
  VariableWithSource
} from './hover-helpers';

export {
  findVariableAtPosition,
  formatHoverContent,
  isResolverCall,
  lookupVariable,
  resolveVariablesWithSource
} from './hover-helpers';

type HoverScopeContext = {
  settings: ExtensionSettings;
  profile: string | undefined;
};

type CachedConfigVariables = {
  variablesWithSource: VariablesWithSource;
  configLabel: string | undefined;
};

type SubstitutionContext = {
  configDir: string;
  workspaceRoot: string;
};

type WorkspaceBounds = {
  startDir: string;
  stopDir: string;
};

export type HoverProviderDependencies = {
  parseDocument: typeof parseDocument;
  loadConfig: typeof loadConfig;
  applyProfile: typeof applyProfile;
  applySubstitutions: typeof applySubstitutions;
  readSettings: typeof readSettings;
  getWorkspaceBounds: typeof getWorkspaceBounds;
  getScopedProfile: typeof getScopedProfile;
  getFolderScopeUri: typeof getFolderScopeUri;
};

const DEFAULT_HOVER_PROVIDER_DEPENDENCIES: HoverProviderDependencies = {
  parseDocument,
  loadConfig,
  applyProfile,
  applySubstitutions,
  readSettings,
  getWorkspaceBounds,
  getScopedProfile,
  getFolderScopeUri
};

const MAX_CACHE_ENTRIES = 10;
const CONFIG_FILENAMES = new Set([
  'treq.jsonc',
  'treq.json',
  'treq.config.ts',
  'treq.config.js',
  'treq.config.mjs'
]);

function toErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
}

function isObjectRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function toVariablesRecord(value: unknown): Record<string, unknown> {
  if (!isObjectRecord(value)) {
    return {};
  }
  return value;
}

function isConfigFileUri(uri: vscode.Uri): boolean {
  const filename = path.basename(uri.fsPath || uri.path);
  return CONFIG_FILENAMES.has(filename);
}

function toMarkdownString(content: FormattedHoverContent): vscode.MarkdownString {
  const markdown = new vscode.MarkdownString();
  markdown.isTrusted = false;
  markdown.appendMarkdown('### ');
  markdown.appendText(content.variableName);

  switch (content.kind) {
    case 'resolver':
      markdown.appendMarkdown('\n\n');
      markdown.appendText(content.message);
      break;
    case 'undefined':
      markdown.appendMarkdown('\n\n');
      markdown.appendText(content.message);
      if (content.sourceLabel) {
        markdown.appendMarkdown('\n\nSource: ');
        markdown.appendText(content.sourceLabel);
      }
      break;
    case 'resolved':
      markdown.appendMarkdown('\n\nValue:\n');
      markdown.appendCodeblock(content.value, 'text');
      if (content.sourceLabel) {
        markdown.appendMarkdown('\n\nSource: ');
        markdown.appendText(content.sourceLabel);
      }
      break;
  }

  return markdown;
}

export class TreqHoverProvider implements vscode.HoverProvider, vscode.Disposable {
  private readonly disposables: vscode.Disposable[] = [];
  private readonly cache = new Map<string, CachedConfigVariables>();

  constructor(
    private readonly context: vscode.ExtensionContext,
    private readonly output: vscode.OutputChannel,
    private readonly dependencies: HoverProviderDependencies = DEFAULT_HOVER_PROVIDER_DEPENDENCIES
  ) {
    this.disposables.push(
      vscode.workspace.onDidChangeConfiguration((event) => {
        if (event.affectsConfiguration('t-req')) {
          this.clearCache();
        }
      })
    );
    this.disposables.push(
      vscode.workspace.onDidGrantWorkspaceTrust(() => {
        this.clearCache();
      })
    );
    this.disposables.push(
      vscode.workspace.onDidSaveTextDocument((document) => {
        if (isConfigFileUri(document.uri)) {
          this.clearCache();
        }
      })
    );
    this.disposables.push(
      vscode.workspace.onDidDeleteFiles((event) => {
        if (event.files.some((uri) => isConfigFileUri(uri))) {
          this.clearCache();
        }
      })
    );
    this.disposables.push(
      vscode.workspace.onDidRenameFiles((event) => {
        if (
          event.files.some(
            (entry) => isConfigFileUri(entry.oldUri) || isConfigFileUri(entry.newUri)
          )
        ) {
          this.clearCache();
        }
      })
    );
  }

  dispose(): void {
    this.clearCache();
    for (const disposable of this.disposables) {
      disposable.dispose();
    }
  }

  async provideHover(
    document: vscode.TextDocument,
    position: vscode.Position
  ): Promise<vscode.Hover | undefined> {
    try {
      if (document.languageId !== 'http') {
        return undefined;
      }

      const lineText = document.lineAt(position.line).text;
      const match = findVariableAtPosition(lineText, position.character);
      if (!match) {
        return undefined;
      }

      const range = new vscode.Range(position.line, match.start, position.line, match.end);
      if (isResolverCall(match.expression)) {
        return new vscode.Hover(
          toMarkdownString(
            formatHoverContent({
              variableName: match.expression,
              isResolver: true
            })
          ),
          range
        );
      }

      const scopeContext = this.resolveScopeContext(document.uri);
      const workspaceBounds = this.dependencies.getWorkspaceBounds(document.uri);
      const fileVariables = this.readFileVariables(document, scopeContext);
      const cachedConfigVariables = await this.getCachedConfigVariables(
        scopeContext,
        workspaceBounds
      );
      const variablesWithSource = resolveVariablesWithSource({ fileVariables });

      for (const [key, entry] of Object.entries(cachedConfigVariables.variablesWithSource)) {
        variablesWithSource[key] = {
          value: entry.value,
          source: entry.source
        };
      }

      const value = lookupVariable(toValueMap(variablesWithSource), match.expression);
      const topLevelKey = findTopLevelVariableKey(match.expression);
      const source = topLevelKey ? variablesWithSource[topLevelKey]?.source : undefined;

      const content = formatHoverContent({
        variableName: match.expression,
        isResolver: false,
        value,
        source,
        configLabel: cachedConfigVariables.configLabel
      });

      return new vscode.Hover(toMarkdownString(content), range);
    } catch (error) {
      this.output.appendLine(`[hover] unexpected error: ${toErrorMessage(error)}`);
      return undefined;
    }
  }

  private resolveScopeContext(documentUri: vscode.Uri): HoverScopeContext {
    const folderScopeUri = this.dependencies.getFolderScopeUri(documentUri);
    const settings = this.dependencies.readSettings(folderScopeUri);
    const profile = this.dependencies.getScopedProfile(
      this.context.workspaceState,
      folderScopeUri,
      settings.executionMode,
      settings.defaultProfile
    );

    return {
      settings,
      profile
    };
  }

  private async getCachedConfigVariables(
    scopeContext: HoverScopeContext,
    workspaceBounds: WorkspaceBounds
  ): Promise<CachedConfigVariables> {
    const key = this.buildCacheKey(workspaceBounds, scopeContext);
    const cached = this.cache.get(key);
    if (cached) {
      this.cache.delete(key);
      this.cache.set(key, cached);
      return cached;
    }

    const resolved = await this.resolveConfigVariables(scopeContext, workspaceBounds);
    this.cache.set(key, resolved);

    if (this.cache.size > MAX_CACHE_ENTRIES) {
      const oldestKey = this.cache.keys().next().value;
      if (oldestKey) {
        this.cache.delete(oldestKey);
      }
    }

    return resolved;
  }

  private buildCacheKey(workspaceBounds: WorkspaceBounds, scopeContext: HoverScopeContext): string {
    const trustState = vscode.workspace.isTrusted ? 'trusted' : 'untrusted';
    return [
      workspaceBounds.startDir,
      scopeContext.profile ?? '',
      scopeContext.settings.executionMode,
      trustState
    ].join('|');
  }

  private clearCache(): void {
    this.cache.clear();
  }

  private async resolveConfigVariables(
    scopeContext: HoverScopeContext,
    workspaceBounds: WorkspaceBounds
  ): Promise<CachedConfigVariables> {
    if (scopeContext.settings.executionMode !== 'local' || !vscode.workspace.isTrusted) {
      return {
        variablesWithSource: {},
        configLabel: undefined
      };
    }

    const loaded = await this.loadConfigWithFallback(workspaceBounds, scopeContext);
    if (!loaded) {
      return {
        variablesWithSource: {},
        configLabel: undefined
      };
    }

    const baseConfig = loaded.config;
    const profileResult = this.applyProfileWithFallback(baseConfig, scopeContext.profile);
    const substitutionContext = this.buildSubstitutionContext(workspaceBounds, loaded);
    const effectiveConfigVariables = profileResult.profileApplied
      ? toVariablesRecord(
          this.applySubstitutionsWithFallback(
            profileResult.mergedConfig,
            substitutionContext,
            `profile ${profileResult.profileName}`
          ).variables
        )
      : toVariablesRecord(
          this.applySubstitutionsWithFallback(
            baseConfig,
            substitutionContext,
            `base config (${scopeContext.profile ?? 'no-profile'})`
          ).variables
        );
    const variablesWithSource = resolveVariablesWithSource({
      configVariables: effectiveConfigVariables
    });

    if (profileResult.profileApplied && profileResult.profileName) {
      const profileSource = `profile:${profileResult.profileName}` as const;
      for (const key of profileResult.profileVariableKeys) {
        const existingVariable = variablesWithSource[key];
        if (!existingVariable) {
          continue;
        }

        variablesWithSource[key] = {
          value: existingVariable.value,
          source: profileSource
        };
      }
    }

    return {
      variablesWithSource,
      configLabel: loaded.path ? path.basename(loaded.path) : undefined
    };
  }

  private readFileVariables(
    document: vscode.TextDocument,
    scopeContext: HoverScopeContext
  ): Record<string, unknown> {
    try {
      return this.dependencies.parseDocument(document.getText()).fileVariables;
    } catch (error) {
      const message = toErrorMessage(error);
      this.output.appendLine(
        `[hover] file variable parse warning mode=${scopeContext.settings.executionMode} profile=${scopeContext.profile ?? '(none)'}: ${message}`
      );
      return {};
    }
  }

  private async loadConfigWithFallback(
    workspaceBounds: WorkspaceBounds,
    scopeContext: HoverScopeContext
  ): Promise<LoadedConfig | undefined> {
    const { startDir, stopDir } = workspaceBounds;

    try {
      return await this.dependencies.loadConfig({ startDir, stopDir });
    } catch (error) {
      const message = toErrorMessage(error);
      this.output.appendLine(
        `[hover] config load warning startDir=${startDir} stopDir=${stopDir} profile=${scopeContext.profile ?? '(none)'}: ${message}`
      );
      return undefined;
    }
  }

  private buildSubstitutionContext(
    workspaceBounds: WorkspaceBounds,
    loaded: LoadedConfig
  ): SubstitutionContext {
    const { startDir, stopDir } = workspaceBounds;
    const projectRoot = loaded.path ? path.dirname(loaded.path) : (stopDir ?? startDir);
    const workspaceRoot = stopDir ? path.resolve(stopDir) : projectRoot;
    const configDir = loaded.path ? path.dirname(loaded.path) : projectRoot;

    return {
      configDir,
      workspaceRoot
    };
  }

  private applyProfileWithFallback(
    baseConfig: TreqConfigInput,
    profileName: string | undefined
  ): {
    mergedConfig: TreqConfigInput;
    profileApplied: boolean;
    profileName: string | undefined;
    profileVariableKeys: string[];
  } {
    if (!profileName) {
      return {
        mergedConfig: baseConfig,
        profileApplied: false,
        profileName: undefined,
        profileVariableKeys: []
      };
    }

    try {
      const mergedConfig = this.dependencies.applyProfile(baseConfig, profileName);
      const rawProfile = baseConfig.profiles?.[profileName];
      const profileVariables = toVariablesRecord(rawProfile?.variables);
      return {
        mergedConfig,
        profileApplied: true,
        profileName,
        profileVariableKeys: Object.keys(profileVariables)
      };
    } catch (error) {
      const message = toErrorMessage(error);
      this.output.appendLine(
        `[hover] profile apply warning profile=${profileName}: ${message}; using base config variables`
      );
      return {
        mergedConfig: baseConfig,
        profileApplied: false,
        profileName: undefined,
        profileVariableKeys: []
      };
    }
  }

  private applySubstitutionsWithFallback(
    config: TreqConfigInput,
    substitutionContext: SubstitutionContext,
    layerName: string
  ): TreqConfigInput {
    const allowExternalFiles = config.security?.allowExternalFiles ?? false;

    try {
      const substituted = this.dependencies.applySubstitutions(config, {
        configDir: substitutionContext.configDir,
        workspaceRoot: substitutionContext.workspaceRoot,
        allowExternalFiles
      });
      return isObjectRecord(substituted) ? (substituted as TreqConfigInput) : config;
    } catch (error) {
      const message = toErrorMessage(error);
      this.output.appendLine(
        `[hover] config substitution warning layer=${layerName}: ${message}; using raw config values`
      );
      return config;
    }
  }
}
