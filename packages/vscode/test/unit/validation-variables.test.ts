import { describe, expect, test } from 'bun:test';
import { buildValidationVariables } from '../../src/providers/validation-variables';

describe('validation variables', () => {
  test('includes file variables and resolved config variables', () => {
    const content = [
      '@baseUrl = https://file.example.test',
      '@token = file-token',
      'GET {{baseUrl}}/users'
    ].join('\n');

    const variables = buildValidationVariables(content, {
      baseUrl: 'https://dev.example.test',
      env: 'dev'
    });

    expect(variables).toEqual({
      baseUrl: 'https://dev.example.test',
      token: 'file-token',
      env: 'dev'
    });
  });
});
