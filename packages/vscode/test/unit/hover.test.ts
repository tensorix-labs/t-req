import { describe, expect, test } from 'bun:test';
import {
  findVariableAtPosition,
  formatHoverContent,
  isResolverCall,
  lookupVariable,
  resolveVariablesWithSource
} from '../../src/providers/hover-helpers';

describe('hover helpers', () => {
  describe('findVariableAtPosition', () => {
    test('finds variable when cursor is inside braces', () => {
      const line = 'GET https://{{host}}/api';
      const position = line.indexOf('host') + 1;
      const match = findVariableAtPosition(line, position);

      expect(match).toEqual({
        expression: 'host',
        rawExpression: 'host',
        start: line.indexOf('{{host}}'),
        end: line.indexOf('{{host}}') + '{{host}}'.length
      });
    });

    test('returns undefined when cursor is outside variable', () => {
      const line = 'GET https://{{host}}/api';
      const match = findVariableAtPosition(line, 0);
      expect(match).toBeUndefined();
    });

    test('supports nested braces and returns outer expression', () => {
      const line = 'Auth: {{$hmac(["{{body}}"])}}';
      const position = line.indexOf('body') + 1;
      const match = findVariableAtPosition(line, position);

      expect(match?.expression).toBe('$hmac(["{{body}}"])');
      expect(match?.start).toBe(line.indexOf('{{$hmac'));
      expect(match?.end).toBe(line.length);
    });

    test('handles adjacent variables and edge positions', () => {
      const line = '{{a}}{{b}}';

      const first = findVariableAtPosition(line, 4);
      const second = findVariableAtPosition(line, 5);
      const boundaryOutside = findVariableAtPosition(line, 10);

      expect(first?.expression).toBe('a');
      expect(second?.expression).toBe('b');
      expect(boundaryOutside).toBeUndefined();
    });

    test('skips empty expressions', () => {
      const line = '{{}}';
      const match = findVariableAtPosition(line, 1);
      expect(match).toBeUndefined();
    });
  });

  describe('isResolverCall', () => {
    test('matches resolver expression patterns', () => {
      expect(isResolverCall('$env(KEY)')).toBe(true);
      expect(isResolverCall('$timestamp()')).toBe(true);
      expect(isResolverCall('  $env(KEY)  ')).toBe(true);
    });

    test('rejects non-resolver patterns', () => {
      expect(isResolverCall('env(KEY)')).toBe(false);
      expect(isResolverCall('$env')).toBe(false);
      expect(isResolverCall('not-a-resolver')).toBe(false);
      expect(isResolverCall('$env(KEY')).toBe(false);
      expect(isResolverCall('$foo-bar()')).toBe(false);
      expect(isResolverCall('$foo.bar()')).toBe(false);
    });
  });

  describe('lookupVariable', () => {
    test('resolves top-level and dot-path values', () => {
      const value = lookupVariable(
        {
          host: 'example.com',
          user: { name: 'andrew', team: { name: 'core' } }
        },
        'user.team.name'
      );

      expect(value).toBe('core');
      expect(lookupVariable({ host: 'example.com' }, 'host')).toBe('example.com');
    });

    test('returns undefined for missing or invalid traversal paths', () => {
      expect(lookupVariable({ user: { name: 'andrew' } }, 'user.id')).toBeUndefined();
      expect(lookupVariable({ user: 'andrew' }, 'user.name')).toBeUndefined();
      expect(lookupVariable({ 'user.name': 'flat' }, 'user.name')).toBeUndefined();
    });
  });

  describe('resolveVariablesWithSource', () => {
    test('merges with file < config < profile precedence and source ownership', () => {
      const merged = resolveVariablesWithSource({
        fileVariables: {
          host: 'file-host',
          fileOnly: 'x'
        },
        configVariables: {
          host: 'config-host',
          configOnly: 'y'
        },
        profileName: 'dev',
        profileVariables: {
          host: 'profile-host',
          profileOnly: 'z'
        }
      });

      expect(merged).toEqual({
        host: { value: 'profile-host', source: 'profile:dev' },
        fileOnly: { value: 'x', source: 'file' },
        configOnly: { value: 'y', source: 'config' },
        profileOnly: { value: 'z', source: 'profile:dev' }
      });
    });

    test('ignores profileVariables when profile name is missing', () => {
      const merged = resolveVariablesWithSource({
        configVariables: { token: 'config-token' },
        profileVariables: { token: 'profile-token' }
      });

      expect(merged).toEqual({
        token: { value: 'config-token', source: 'config' }
      });
    });
  });

  describe('formatHoverContent', () => {
    test('formats resolver content', () => {
      expect(
        formatHoverContent({
          variableName: '$env(KEY)',
          isResolver: true
        })
      ).toEqual({
        kind: 'resolver',
        variableName: '$env(KEY)',
        message: 'Resolver - resolved at runtime'
      });
    });

    test('formats undefined variable content', () => {
      expect(
        formatHoverContent({
          variableName: 'missing',
          isResolver: false
        })
      ).toEqual({
        kind: 'undefined',
        variableName: 'missing',
        message: 'Undefined variable',
        sourceLabel: undefined
      });
    });

    test('formats resolved values across scalar and object types', () => {
      expect(
        formatHoverContent({
          variableName: 'count',
          isResolver: false,
          value: 42,
          source: 'config'
        })
      ).toEqual({
        kind: 'resolved',
        variableName: 'count',
        value: '42',
        sourceLabel: 'Config'
      });

      expect(
        formatHoverContent({
          variableName: 'payload',
          isResolver: false,
          value: { nested: true },
          source: 'profile:dev'
        })
      ).toEqual({
        kind: 'resolved',
        variableName: 'payload',
        value: '{\n  "nested": true\n}',
        sourceLabel: 'Profile dev'
      });
    });
  });
});
