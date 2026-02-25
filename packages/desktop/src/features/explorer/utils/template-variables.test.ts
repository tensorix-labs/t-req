import { describe, expect, it } from 'bun:test';
import {
  analyzeTemplateUsage,
  buildTemplatePreviewVariables,
  extractFileVariablesFromContent,
  formatUnresolvedVariablesPreview,
  interpolateTemplatePreview,
  resolveTemplateTokenFromVariables,
  scanTemplateTokens
} from './template-variables';

describe('scanTemplateTokens', () => {
  it('detects variable and resolver tokens', () => {
    const tokens = scanTemplateTokens('https://{{host}}/users/{{$uuid()}}');

    expect(tokens).toHaveLength(2);
    expect(tokens[0]).toMatchObject({
      kind: 'variable',
      expression: 'host',
      variablePath: 'host'
    });
    expect(tokens[1]).toMatchObject({
      kind: 'resolver',
      expression: '$uuid()',
      resolverName: 'uuid'
    });
  });

  it('marks empty and unclosed expressions as invalid', () => {
    const tokens = scanTemplateTokens('{{   }} {{missing');
    expect(tokens.map((token) => token.kind)).toEqual(['invalid', 'invalid']);
  });
});

describe('resolveTemplateTokenFromVariables', () => {
  it('resolves nested variable paths', () => {
    const token = scanTemplateTokens('hello {{user.name}}')[0];
    if (!token) {
      throw new Error('Expected token to exist');
    }

    const result = resolveTemplateTokenFromVariables(token, {
      user: { name: 'Ada' }
    });

    expect(result.status).toBe('resolved');
    expect(result.displayValue).toBe('Ada');
  });

  it('returns resolver status for resolver expressions', () => {
    const token = scanTemplateTokens('{{$timestamp()}}')[0];
    if (!token) {
      throw new Error('Expected token to exist');
    }

    const result = resolveTemplateTokenFromVariables(token, {});

    expect(result.status).toBe('resolver');
  });
});

describe('analyzeTemplateUsage', () => {
  it('collects unresolved variables without duplicates', () => {
    const analysis = analyzeTemplateUsage('{{missing}}/{{user.name}}/{{missing}}', {
      user: { name: 'Ada' }
    });

    expect(analysis.unresolvedVariables).toEqual(['missing']);
  });
});

describe('extractFileVariablesFromContent', () => {
  it('extracts @var = value declarations', () => {
    const variables = extractFileVariablesFromContent(`
@baseUrl = https://api.example.com
@api.version = v1
# ignored
@broken
`);

    expect(variables).toEqual({
      baseUrl: 'https://api.example.com',
      'api.version': 'v1'
    });
  });
});

describe('buildTemplatePreviewVariables', () => {
  it('merges resolved and file-level values with file values winning', () => {
    const variables = buildTemplatePreviewVariables({
      resolvedVariables: {
        baseUrl: 'https://prod.example.com',
        env: 'prod'
      },
      draftContent: `
@baseUrl = https://local.example.com
@token = local-token
`
    });

    expect(variables).toEqual({
      baseUrl: 'https://local.example.com',
      env: 'prod',
      token: 'local-token'
    });
  });
});

describe('interpolateTemplatePreview', () => {
  it('interpolates resolved variables and keeps unresolved tokens', () => {
    const preview = interpolateTemplatePreview('https://{{host}}/users/{{missing}}', {
      host: 'api.example.com'
    });

    expect(preview).toBe('https://api.example.com/users/{{missing}}');
  });
});

describe('formatUnresolvedVariablesPreview', () => {
  it('joins all values when they are within the preview limit', () => {
    expect(formatUnresolvedVariablesPreview(['one', 'two'])).toBe('one, two');
  });

  it('truncates values and appends a remainder count when over the limit', () => {
    expect(formatUnresolvedVariablesPreview(['one', 'two', 'three', 'four', 'five'])).toBe(
      'one, two, three, four, +1 more'
    );
  });
});
